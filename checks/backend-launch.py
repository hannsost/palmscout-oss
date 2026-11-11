"""Offline launch checks: synthetic input/state only, no application dependencies or sockets."""

from __future__ import annotations

import ast
import asyncio
import copy
import hashlib
import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import patch
from urllib.parse import urlsplit
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from app.operator_bootstrap import BootstrapError, bootstrap, parse_config, read_config  # noqa: E402


def fixture() -> dict:
    return {
        "version": 1,
        "tenant": {
            "name": "Synthetic workspace", "slug": "synthetic-workspace",
            "type": "internal_hr", "modules": ["kanban_pipeline"],
        },
        "platform_admin": {
            "email": "platform@example.test", "full_name": "Synthetic platform owner",
            "password": "synthetic-platform-fixture-only",
        },
        "tenant_admin": {
            "email": "tenant@example.test", "full_name": "Synthetic tenant owner",
            "password": "synthetic-tenant-fixture-only",
        },
    }


def fake_hash(value: str) -> str:
    # Test double only; production uses existing passlib/bcrypt.
    return "test-double:" + hashlib.sha256(value.encode()).hexdigest()


def fake_verify(value: str, hashed: str) -> bool:
    return fake_hash(value) == hashed


class FakeConnection:
    def __init__(self) -> None:
        self.tables = {key: [] for key in ("customers", "users", "companies", "privacy_consent", "customer_modules")}
        self.revision = "054"
        self.writes = 0
        self.locked = False

    async def fetch(self, query: str, *args: object) -> list[dict]:
        if query == "SELECT version_num FROM alembic_version":
            return [{"version_num": self.revision}]
        if query.startswith("SELECT EXISTS"):
            return [{"occupied": any(self.tables[key] for key in ("users", "customers", "companies"))}]
        if query.startswith("SELECT * FROM customers"):
            return [row for row in self.tables["customers"] if row["slug"] == args[0]]
        if query.startswith("SELECT * FROM users"):
            return [row for row in self.tables["users"] if row["email"].lower() in args[0]]
        if query.startswith("SELECT * FROM companies"):
            return [row for row in self.tables["companies"] if row["id"] == args[0]]
        if query.startswith("SELECT user_id FROM privacy_consent"):
            return [row for row in self.tables["privacy_consent"] if row["user_id"] in args[0]]
        if query.startswith("SELECT module_key, enabled FROM customer_modules"):
            return [row for row in self.tables["customer_modules"] if row["customer_id"] == args[0]]
        raise AssertionError("Unexpected read")

    async def execute(self, query: str, *args: object) -> str:
        if query.startswith("SET LOCAL"):
            return "SET"
        if query.startswith("LOCK TABLE"):
            self.locked = True
            return "LOCK"
        assert self.locked
        self.writes += 1
        if query.startswith("INSERT INTO customers"):
            self.tables["customers"].append(dict(zip(
                ("id", "name", "slug", "type", "contact_email"), args, strict=True
            ), plan="free", status="active"))
        elif query.startswith("INSERT INTO users"):
            self.tables["users"].append(dict(zip(
                ("id", "email", "hashed_password", "full_name", "tenant_id"), args, strict=True
            ), role="admin", is_active=True, is_verified=True, company_id=None))
        elif query.startswith("INSERT INTO privacy_consent"):
            self.tables["privacy_consent"].append({"id": args[0], "user_id": args[1], "ai_opt_in": False, "terms_accepted": False})
        elif query.startswith("INSERT INTO companies"):
            self.tables["companies"].append(dict(zip(("id", "name", "created_by"), args, strict=True)))
        elif query.startswith("UPDATE users SET company_id"):
            next(row for row in self.tables["users"] if row["id"] == args[1])["company_id"] = args[0]
        elif query.startswith("INSERT INTO customer_modules"):
            self.tables["customer_modules"].append(dict(zip(("id", "customer_id", "module_key"), args, strict=True), enabled=True))
        else:
            raise AssertionError("Unexpected write")
        return "OK"


class InputChecks(unittest.TestCase):
    def test_private_file_and_projected_symlink(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "input.json"
            target.write_text(json.dumps(fixture()))
            target.chmod(0o600)
            link = Path(directory) / "projected.json"
            link.symlink_to(target)
            self.assertEqual(read_config(link), parse_config(fixture()))
            target.chmod(0o640)
            self.assertEqual(read_config(link), parse_config(fixture()))
            for mode in (0o644, 0o660, 0o777):
                target.chmod(mode)
                with self.assertRaises(BootstrapError):
                    read_config(link)

    def test_duplicate_and_oversized_input(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "input.json"
            target.write_text('{"version":1,"version":1}')
            target.chmod(0o600)
            with self.assertRaisesRegex(BootstrapError, "duplicate_config_key"):
                read_config(target)
            target.write_bytes(b"x" * 16385)
            with self.assertRaises(BootstrapError):
                read_config(target)

    def test_invalid_and_ambiguous_configuration(self) -> None:
        cases = []
        for password in ("short", "x" * 73, "ü" * 37, "x" * 20 + "\n"):
            value = fixture()
            value["platform_admin"]["password"] = password
            cases.append(value)
        value = fixture()
        value["version"] = True
        cases.append(value)
        value = fixture()
        value["tenant"]["modules"] = ["ai_cv_parser"]
        cases.append(value)
        value = fixture()
        value["tenant_admin"]["email"] = value["platform_admin"]["email"]
        cases.append(value)
        value = fixture()
        value["tenant_admin"]["password"] = value["platform_admin"]["password"]
        cases.append(value)
        for value in cases:
            with self.assertRaises(BootstrapError):
                parse_config(value)

    def test_password_not_in_repr(self) -> None:
        value = fixture()
        self.assertNotIn(value["platform_admin"]["password"], repr(parse_config(value)))


class BootstrapChecks(unittest.IsolatedAsyncioTestCase):
    async def setup(self) -> tuple:
        connection = FakeConnection()
        config = parse_config(fixture())
        result = await bootstrap(connection, config, fake_hash, fake_verify)
        self.assertEqual(result, "initialized")
        return connection, config

    async def test_creation_and_exact_replay(self) -> None:
        connection, config = await self.setup()
        before = copy.deepcopy(connection.tables)
        writes = connection.writes
        self.assertEqual(await bootstrap(connection, config, fake_hash, fake_verify), "already_initialized")
        self.assertEqual(connection.tables, before)
        self.assertEqual(connection.writes, writes)
        platform, owner = connection.tables["users"]
        self.assertIsNone(platform["tenant_id"])
        self.assertIsNone(platform["company_id"])
        self.assertIsNotNone(owner["tenant_id"])
        self.assertIsNotNone(owner["company_id"])
        for consent in connection.tables["privacy_consent"]:
            self.assertFalse(consent["ai_opt_in"])
            self.assertFalse(consent["terms_accepted"])

    async def test_wrong_revision_and_unrelated_database(self) -> None:
        for occupied in (False, True):
            connection = FakeConnection()
            if occupied:
                connection.tables["companies"].append({"id": uuid4()})
            else:
                connection.revision = "053"
            with self.assertRaises(BootstrapError):
                await bootstrap(connection, parse_config(fixture()), fake_hash, fake_verify)
            self.assertEqual(connection.writes, 0)

    async def test_conflicts_never_reset_or_promote(self) -> None:
        for field, value in (("role", "candidate"), ("is_active", False), ("tenant_id", uuid4()), ("hashed_password", "foreign-hash")):
            connection, config = await self.setup()
            connection.tables["users"][0][field] = value
            before, writes = copy.deepcopy(connection.tables), connection.writes
            with self.assertRaises(BootstrapError):
                await bootstrap(connection, config, fake_hash, fake_verify)
            self.assertEqual(connection.tables, before)
            self.assertEqual(connection.writes, writes)


class FakeHTTPException(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        self.status_code = status_code
        self.detail = detail


def load_function(path: Path, name: str, namespace: dict) -> object:
    tree = ast.parse(path.read_text())
    node = next(node for node in ast.walk(tree) if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == name)
    node.decorator_list = []
    future = ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)
    code = ast.fix_missing_locations(ast.Module(body=[future, node], type_ignores=[]))
    exec(compile(code, str(path), "exec"), namespace)
    return namespace[name]


class GuardChecks(unittest.IsolatedAsyncioTestCase):
    async def test_production_configuration_fails_closed(self) -> None:
        validate = load_function(ROOT / "backend/app/config.py", "require_production_configuration", {"urlsplit": urlsplit})
        settings = SimpleNamespace(
            is_production=True,
            model_fields_set={"database_url", "redis_url", "secret_key", "scraper_import_key"},
            secret_key="synthetic-signing-key-for-local-check-only",
            scraper_import_key="synthetic-import-key-for-local-check-only",
            database_url="postgresql+asyncpg://localhost/synthetic",
            redis_url="redis://localhost/0",
            frontend_url="https://example.test",
            allowed_origins=["https://example.test"],
            ai_mock_mode=False, public_registration_enabled=False, smtp_host="",
        )
        self.assertIs(validate(settings), settings)
        for field, value in (
            ("model_fields_set", set()), ("secret_key", "short"),
            ("frontend_url", "http://example.test"), ("allowed_origins", []),
            ("ai_mock_mode", True), ("public_registration_enabled", True),
        ):
            changed = copy.copy(settings)
            setattr(changed, field, value)
            with self.assertRaises(ValueError):
                validate(changed)
        validate(SimpleNamespace(is_production=False))

    async def test_unconfigured_mail_reports_unavailable(self) -> None:
        module = ModuleType("app.config")
        settings = SimpleNamespace(is_production=True, smtp_host="")
        module.get_settings = lambda: settings
        require_mail = load_function(ROOT / "backend/app/auth/service.py", "_require_production_mail", {"HTTPException": FakeHTTPException})
        with patch.dict(sys.modules, {"app.config": module}):
            with self.assertRaises(FakeHTTPException) as error:
                require_mail()
            self.assertEqual(error.exception.status_code, 503)
            settings.is_production = False
            require_mail()

    async def test_registration_guard_before_database(self) -> None:
        settings = SimpleNamespace(is_production=True, public_registration_enabled=False)
        module = ModuleType("app.config")
        module.get_settings = lambda: settings
        register = load_function(ROOT / "backend/app/auth/service.py", "register_user", {"HTTPException": FakeHTTPException})
        with patch.dict(sys.modules, {"app.config": module}):
            with self.assertRaises(FakeHTTPException) as error:
                await register(None, None)
            self.assertEqual(error.exception.status_code, 403)

    async def test_unverified_and_platform_company_creation_denied(self) -> None:
        module = ModuleType("app.config")
        module.get_settings = lambda: SimpleNamespace(is_production=True)
        create = load_function(ROOT / "backend/app/companies/router.py", "create", {"HTTPException": FakeHTTPException})
        with patch.dict(sys.modules, {"app.config": module}):
            for user in (SimpleNamespace(is_verified=False), SimpleNamespace(is_verified=True, role="admin", tenant_id=None)):
                with self.assertRaises(FakeHTTPException) as error:
                    await create(None, user, None)
                self.assertEqual(error.exception.status_code, 403)

    async def test_missing_embeddings_are_unavailable_not_zero(self) -> None:
        module = ModuleType("fastapi")
        module.HTTPException = FakeHTTPException
        spec = importlib.util.spec_from_file_location("checked_embeddings", ROOT / "backend/app/jobs/embeddings.py")
        embeddings = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"fastapi": module}):
            spec.loader.exec_module(embeddings)
        embeddings._load_model = lambda: None
        with self.assertRaises(FakeHTTPException) as error:
            embeddings._embed_sync(["synthetic text"])
        self.assertEqual(error.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main(verbosity=1)
