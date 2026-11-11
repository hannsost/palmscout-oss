"""Focused checks for transaction-local PostgreSQL tenant context."""

from __future__ import annotations

import os
import unittest
import uuid
from types import SimpleNamespace
from typing import cast
from unittest.mock import AsyncMock, Mock

from sqlalchemy import text
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, SessionTransaction

from app.tenant_context import clear_tenant_context, restore_tenant_context, set_tenant_context


class TenantContextUnitTests(unittest.IsolatedAsyncioTestCase):
    async def test_verified_tenant_context_uses_bound_transaction_local_settings(self) -> None:
        tenant_id = uuid.uuid4()
        session = SimpleNamespace(info={}, execute=AsyncMock())

        await set_tenant_context(cast(AsyncSession, session), tenant_id=tenant_id, role="recruiter")

        statement, parameters = session.execute.await_args.args
        assert str(statement) == (
            "SELECT set_config('app.current_tenant_id', :tenant_id, true), "
            "set_config('app.is_admin', :is_admin, true)"
        )
        assert parameters == {"tenant_id": str(tenant_id), "is_admin": "false"}
        assert str(tenant_id) not in str(statement)

    async def test_only_tenantless_admin_gets_platform_bypass(self) -> None:
        tenant_id = uuid.uuid4()
        cases = (
            (None, "admin", "true"),
            (tenant_id, "admin", "false"),
            (None, "recruiter", "false"),
        )

        for context_tenant_id, role, expected in cases:
            with self.subTest(tenant_id=context_tenant_id, role=role):
                session = SimpleNamespace(info={}, execute=AsyncMock())
                await set_tenant_context(
                    cast(AsyncSession, session), tenant_id=context_tenant_id, role=role
                )
                assert session.execute.await_args.args[1]["is_admin"] == expected

    async def test_clear_replaces_context_inside_an_open_transaction(self) -> None:
        tenant_id = uuid.uuid4()
        session = SimpleNamespace(
            info={},
            execute=AsyncMock(),
            in_transaction=Mock(return_value=True),
        )
        await set_tenant_context(cast(AsyncSession, session), tenant_id=tenant_id, role="recruiter")
        session.execute.reset_mock()

        await clear_tenant_context(cast(AsyncSession, session))

        assert session.info == {}
        assert session.execute.await_args.args[1] == {"tenant_id": "", "is_admin": "false"}

    async def test_after_begin_reapplies_context_on_postgresql_only(self) -> None:
        tenant_id = uuid.uuid4()
        session = SimpleNamespace(info={})
        async_session = SimpleNamespace(info=session.info, execute=AsyncMock())
        await set_tenant_context(
            cast(AsyncSession, async_session), tenant_id=tenant_id, role="recruiter"
        )
        connection = SimpleNamespace(dialect=SimpleNamespace(name="postgresql"), execute=Mock())

        restore_tenant_context(
            cast(Session, session),
            cast(SessionTransaction, object()),
            cast(Connection, connection),
        )

        assert connection.execute.call_args.args[1] == {
            "tenant_id": str(tenant_id),
            "is_admin": "false",
        }

        sqlite_connection = SimpleNamespace(dialect=SimpleNamespace(name="sqlite"), execute=Mock())
        restore_tenant_context(
            cast(Session, session),
            cast(SessionTransaction, object()),
            cast(Connection, sqlite_connection),
        )
        sqlite_connection.execute.assert_not_called()


@unittest.skipUnless(
    os.environ.get("RLS_TEST_DATABASE_URL"),
    "RLS_TEST_DATABASE_URL is required for the isolated PostgreSQL RLS check",
)
class TenantContextPostgresTests(unittest.IsolatedAsyncioTestCase):
    async def test_context_survives_transactions_without_pool_leakage(self) -> None:
        database_url = os.environ["RLS_TEST_DATABASE_URL"]
        database_name = make_url(database_url).database or ""
        if not database_name.endswith("_test"):
            self.fail("RLS integration tests require a database ending in _test")

        engine = create_async_engine(database_url, pool_size=1, max_overflow=0)
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        table_name = f"rls_context_test_{uuid.uuid4().hex}"
        tenant_a = uuid.uuid4()
        tenant_b = uuid.uuid4()

        try:
            async with engine.begin() as connection:
                await connection.execute(
                    text(
                        f"CREATE TABLE {table_name} ("
                        "id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY, "
                        "tenant_id uuid, value text NOT NULL)"
                    )
                )
                await connection.execute(
                    text(f"ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY")
                )
                await connection.execute(text(f"ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY"))
                await connection.execute(
                    text(
                        f"CREATE POLICY tenant_isolation ON {table_name} USING ("
                        "tenant_id IS NULL "
                        "OR current_setting('app.is_admin', true) = 'true' "
                        "OR (tenant_id::text = "
                        "current_setting('app.current_tenant_id', true) "
                        "AND current_setting('app.current_tenant_id', true) <> ''))"
                    )
                )

            async with sessions() as session:
                await set_tenant_context(session, tenant_id=tenant_a, role="recruiter")
                await session.execute(
                    text(f"INSERT INTO {table_name} (tenant_id, value) VALUES (:tenant, 'a')"),
                    {"tenant": tenant_a},
                )
                await session.commit()
                count = await session.scalar(text(f"SELECT count(*) FROM {table_name}"))
                self.assertEqual(count, 1, "context must be restored after commit")

            async with sessions() as session:
                await set_tenant_context(session, tenant_id=tenant_b, role="recruiter")
                self.assertEqual(
                    await session.scalar(text(f"SELECT count(*) FROM {table_name}")), 0
                )
                with self.assertRaises(DBAPIError):
                    await session.execute(
                        text(
                            f"INSERT INTO {table_name} (tenant_id, value) "
                            "VALUES (:tenant, 'forbidden')"
                        ),
                        {"tenant": tenant_a},
                    )
                    await session.flush()
                await session.rollback()
                await session.execute(
                    text(f"INSERT INTO {table_name} (tenant_id, value) VALUES (:tenant, 'b')"),
                    {"tenant": tenant_b},
                )
                await session.commit()
                self.assertEqual(
                    await session.scalar(text(f"SELECT count(*) FROM {table_name}")), 1
                )

            async with sessions() as session:
                await set_tenant_context(session, tenant_id=None, role="admin")
                await session.execute(
                    text(f"INSERT INTO {table_name} (tenant_id, value) VALUES (NULL, 'public')")
                )
                await session.commit()
                self.assertEqual(
                    await session.scalar(text(f"SELECT count(*) FROM {table_name}")), 3
                )

            async with sessions() as session:
                await set_tenant_context(session, tenant_id=tenant_a, role="admin")
                self.assertEqual(
                    await session.scalar(text(f"SELECT count(*) FROM {table_name}")), 2
                )

            async with sessions() as anonymous_session:
                rows = (
                    await anonymous_session.execute(
                        text(f"SELECT value FROM {table_name} ORDER BY value")
                    )
                ).scalars()
                self.assertEqual(list(rows), ["public"])
        finally:
            async with engine.begin() as connection:
                await connection.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
            await engine.dispose()


if __name__ == "__main__":
    unittest.main()
