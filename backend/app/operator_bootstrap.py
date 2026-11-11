"""Explicit, atomic first-owner setup; never a server startup hook or seed dataset."""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import re
import stat
import sys
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol
from uuid import uuid4

SAFE_MODULES = frozenset({"kanban_pipeline", "interview_scheduling", "org_charts"})
EXPECTED_REVISION = "054"


class BootstrapError(ValueError):
    """Only fixed, non-sensitive error codes may be passed to this exception."""


@dataclass(frozen=True)
class Account:
    email: str
    full_name: str
    password: str = field(repr=False)


@dataclass(frozen=True)
class BootstrapInput:
    tenant_name: str
    tenant_slug: str
    tenant_type: str
    modules: tuple[str, ...]
    platform_admin: Account
    tenant_admin: Account


class Connection(Protocol):
    async def fetch(self, query: str, *args: object) -> list[Mapping[str, object]]: ...

    async def execute(self, query: str, *args: object) -> str: ...


def _object(value: object, keys: set[str]) -> dict[str, object]:
    if not isinstance(value, dict) or set(value) != keys:
        raise BootstrapError("invalid_config_fields")
    return value


def _string(value: object, minimum: int, maximum: int) -> str:
    if (
        not isinstance(value, str)
        or not minimum <= len(value) <= maximum
        or any(ord(character) < 32 for character in value)
    ):
        raise BootstrapError("invalid_config_value")
    return value


def _account(value: object) -> Account:
    data = _object(value, {"email", "full_name", "password"})
    email = _string(data["email"], 3, 255).strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", email):
        raise BootstrapError("invalid_email")
    password = _string(data["password"], 16, 72)
    if len(password.encode("utf-8")) > 72:
        raise BootstrapError("password_exceeds_bcrypt_limit")
    return Account(email, _string(data["full_name"], 1, 255), password)


def parse_config(value: object) -> BootstrapInput:
    data = _object(value, {"version", "tenant", "platform_admin", "tenant_admin"})
    if type(data["version"]) is not int or data["version"] != 1:
        raise BootstrapError("unsupported_config_version")
    tenant = _object(data["tenant"], {"name", "slug", "type", "modules"})
    slug = _string(tenant["slug"], 1, 100)
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", slug):
        raise BootstrapError("invalid_tenant_slug")
    tenant_type = _string(tenant["type"], 1, 50)
    if tenant_type not in {"internal_hr", "recruiter_agency", "solo_recruiter", "zeitarbeit"}:
        raise BootstrapError("invalid_tenant_type")
    modules = tenant["modules"]
    if (
        not isinstance(modules, list)
        or not all(isinstance(item, str) and item in SAFE_MODULES for item in modules)
        or len(set(modules)) != len(modules)
    ):
        raise BootstrapError("invalid_initial_modules")
    platform_admin = _account(data["platform_admin"])
    tenant_admin = _account(data["tenant_admin"])
    if platform_admin.email == tenant_admin.email:
        raise BootstrapError("distinct_accounts_required")
    if platform_admin.password == tenant_admin.password:
        raise BootstrapError("distinct_passwords_required")
    return BootstrapInput(
        _string(tenant["name"], 2, 255),
        slug,
        tenant_type,
        tuple(sorted(modules)),
        platform_admin,
        tenant_admin,
    )


def _unique_keys(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            raise BootstrapError("duplicate_config_key")
        result[key] = value
    return result


def read_config(path: Path) -> BootstrapInput:
    # Kubernetes projected Secret paths are symlinks; inspect the opened target.
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK)
    with os.fdopen(descriptor, "rb") as handle:
        metadata = os.fstat(handle.fileno())
        if (
            not stat.S_ISREG(metadata.st_mode)
            or metadata.st_mode & 0o027
            or metadata.st_uid not in {0, os.geteuid()}
            or not 1 <= metadata.st_size <= 16384
        ):
            raise BootstrapError("private_regular_config_file_required")
        payload = handle.read(16385)
    if len(payload) > 16384:
        raise BootstrapError("config_too_large")
    return parse_config(json.loads(payload, object_pairs_hook=_unique_keys))


async def bootstrap(
    connection: Connection,
    config: BootstrapInput,
    hash_password: Callable[[str], str],
    verify_password: Callable[[str, str], bool],
) -> str:
    """Caller owns one transaction; any conflict must roll back the entire setup."""
    await connection.execute("SET LOCAL lock_timeout = '5s'")
    await connection.execute("SET LOCAL statement_timeout = '30s'")
    await connection.execute(
        "LOCK TABLE customers, users, companies, privacy_consent, customer_modules "
        "IN SHARE ROW EXCLUSIVE MODE"
    )
    revisions = await connection.fetch("SELECT version_num FROM alembic_version")
    if [row["version_num"] for row in revisions] != [EXPECTED_REVISION]:
        raise BootstrapError("migration_054_required")
    tenants = await connection.fetch("SELECT * FROM customers WHERE slug = $1", config.tenant_slug)
    accounts = await connection.fetch(
        "SELECT * FROM users WHERE lower(email) = ANY($1::text[])",
        [config.platform_admin.email, config.tenant_admin.email],
    )
    if tenants or accounts:
        if len(tenants) != 1 or len(accounts) != 2:
            raise BootstrapError("existing_identity_conflict")
        tenant = tenants[0]
        if any(
            tenant[key] != expected
            for key, expected in {
                "name": config.tenant_name,
                "type": config.tenant_type,
                "status": "active",
                "plan": "free",
            }.items()
        ):
            raise BootstrapError("existing_tenant_conflict")
        by_email = {str(row["email"]): row for row in accounts}
        for account, tenant_id in (
            (config.platform_admin, None),
            (config.tenant_admin, tenant["id"]),
        ):
            user = by_email.get(account.email)
            if (
                user is None
                or user["role"] != "admin"
                or user["tenant_id"] != tenant_id
                or not user["is_active"]
                or not user["is_verified"]
                or user["full_name"] != account.full_name
                or not verify_password(account.password, str(user["hashed_password"]))
            ):
                raise BootstrapError("existing_account_conflict")
        if by_email[config.platform_admin.email]["company_id"] is not None:
            raise BootstrapError("platform_account_must_not_own_company")
        owner = by_email[config.tenant_admin.email]
        companies = await connection.fetch(
            "SELECT * FROM companies WHERE id = $1", owner["company_id"]
        )
        if (
            len(companies) != 1
            or companies[0]["name"] != config.tenant_name
            or companies[0]["created_by"] != owner["id"]
        ):
            raise BootstrapError("existing_company_conflict")
        consents = await connection.fetch(
            "SELECT user_id FROM privacy_consent WHERE user_id = ANY($1::uuid[])",
            [row["id"] for row in accounts],
        )
        if len(consents) != 2:
            raise BootstrapError("existing_consent_conflict")
        modules = await connection.fetch(
            "SELECT module_key, enabled FROM customer_modules WHERE customer_id = $1", tenant["id"]
        )
        enabled = tuple(sorted(str(row["module_key"]) for row in modules if row["enabled"]))
        if enabled != config.modules:
            raise BootstrapError("existing_modules_conflict")
        return "already_initialized"

    occupied = await connection.fetch(
        "SELECT EXISTS(SELECT 1 FROM users) OR EXISTS(SELECT 1 FROM customers) "
        "OR EXISTS(SELECT 1 FROM companies) AS occupied"
    )
    if occupied[0]["occupied"]:
        raise BootstrapError("empty_identity_database_required")
    tenant_id, company_id = uuid4(), uuid4()
    platform_id, owner_id = uuid4(), uuid4()
    await connection.execute(
        "INSERT INTO customers (id, name, slug, type, plan, status, contact_email) "
        "VALUES ($1, $2, $3, $4, 'free', 'active', $5)",
        tenant_id,
        config.tenant_name,
        config.tenant_slug,
        config.tenant_type,
        config.tenant_admin.email,
    )
    for account, user_id, assignment in (
        (config.platform_admin, platform_id, None),
        (config.tenant_admin, owner_id, tenant_id),
    ):
        await connection.execute(
            "INSERT INTO users (id, email, hashed_password, full_name, role, tenant_id, "
            "is_active, is_verified, auth_version) "
            "VALUES ($1, $2, $3, $4, 'admin', $5, true, true, 0)",
            user_id,
            account.email,
            hash_password(account.password),
            account.full_name,
            assignment,
        )
        await connection.execute(
            "INSERT INTO privacy_consent (id, user_id, ai_opt_in, terms_accepted) "
            "VALUES ($1, $2, false, false)",
            uuid4(),
            user_id,
        )
    await connection.execute(
        "INSERT INTO companies (id, name, created_by) VALUES ($1, $2, $3)",
        company_id,
        config.tenant_name,
        owner_id,
    )
    await connection.execute("UPDATE users SET company_id = $1 WHERE id = $2", company_id, owner_id)
    for module in config.modules:
        await connection.execute(
            "INSERT INTO customer_modules (id, customer_id, module_key, enabled) "
            "VALUES ($1, $2, $3, true)",
            uuid4(),
            tenant_id,
            module,
        )
    return "initialized"


async def run(config: BootstrapInput) -> str:
    import asyncpg
    from passlib.context import CryptContext

    from app.config import get_settings

    settings = get_settings()
    if not settings.is_production or not settings.database_url.startswith("postgresql+asyncpg://"):
        raise BootstrapError("production_postgresql_configuration_required")
    context = CryptContext(schemes=["bcrypt"], deprecated="auto")
    try:
        connection = await asyncpg.connect(
            settings.database_url.replace("postgresql+asyncpg://", "postgresql://", 1),
            timeout=10,
            command_timeout=30,
        )
        try:
            async with connection.transaction():
                return await bootstrap(connection, config, context.hash, context.verify)
        finally:
            await connection.close()
    except asyncpg.PostgresError:
        raise BootstrapError("database_operation_failed") from None


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Initialize the explicitly configured first owners"
    )
    parser.add_argument("--config-file", type=Path, required=True)
    args = parser.parse_args()
    try:
        outcome = asyncio.run(run(read_config(args.config_file)))
    except BootstrapError as error:
        print(f"bootstrap_failed:{error}", file=sys.stderr)
        return 1
    except (OSError, ValueError, RuntimeError, ImportError, TimeoutError):
        # Connection/configuration exceptions can contain credentials; never format them.
        print("bootstrap_failed:configuration_or_runtime_error", file=sys.stderr)
        return 1
    print(f"bootstrap:{outcome}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
