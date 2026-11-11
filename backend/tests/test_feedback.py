"""Regression coverage for authenticated SolveIT feedback intake."""

from __future__ import annotations

import json
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Literal

import httpx
import pytest
from httpx import AsyncClient, MockTransport, Request, Response
from pydantic import SecretStr, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.admin.models import Customer
from app.config import Settings, get_settings
from app.feedback import service as feedback_service
from app.main import app
from app.security import create_access_token
from app.users.models import User
from tests.utils import auth_headers

RECEIPT = {
    "data": {
        "ticket_id": 7301,
        "report_id": 8402,
        "reference": "SOL-7301",
        "application": "palmscout",
    }
}
GENERIC_UNAVAILABLE = (
    "Feedback konnte nicht bestätigt werden. Bitte dieselbe Rückmeldung erneut senden."
)


@pytest.mark.parametrize(
    "origin",
    [
        "http://support.example.test",
        "https://user:password@example.test",
        "https://support.example.test/intake",
        "https://support.example.test?secret=x",
        "https://support.example.test#fragment",
        "https://support.example.test:invalid",
        "https://support.example.test\\other",
        "https://support.example.test\t",
    ],
)
def test_intake_configuration_rejects_unsafe_origins(origin: str) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, secret_key="synthetic", solveit_base_url=origin)


def test_intake_configuration_normalizes_origin_and_redacts_secret() -> None:
    settings = Settings(
        _env_file=None,
        secret_key="synthetic",
        solveit_base_url="https://support.example.test/",
        solveit_intake_key=SecretStr("synthetic-private-intake-key"),
    )
    assert settings.solveit_base_url == "https://support.example.test"
    assert "synthetic-private-intake-key" not in repr(settings)


def test_production_does_not_allow_loopback_http_intake() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            app_env="production",
            secret_key="synthetic",
            solveit_base_url="http://127.0.0.1:5073",
        )


@dataclass
class AuthContext:
    user: User
    headers: dict[str, str]


ReplyFactory = Callable[[Request], Response]


@dataclass
class IntakeMock:
    """Mock the service module's AsyncClient while retaining every request."""

    replies: list[ReplyFactory | BaseException] = field(default_factory=list)
    calls: list[Request] = field(default_factory=list)
    client_kwargs: list[dict[str, object]] = field(default_factory=list)

    async def handle(self, request: Request) -> Response:
        self.calls.append(request)
        if not self.replies:
            raise AssertionError("The feedback service made an unexpected intake request")
        reply = self.replies.pop(0)
        if isinstance(reply, BaseException):
            raise reply
        return reply(request)

    def client(self, **kwargs: object) -> httpx.AsyncClient:
        self.client_kwargs.append(kwargs)
        return httpx.AsyncClient(
            transport=MockTransport(self.handle), base_url="https://solveit.test", **kwargs
        )

    def add_json(self, status_code: int, payload: object) -> None:
        self.replies.append(lambda request: Response(status_code, json=payload, request=request))

    def add_content(
        self,
        status_code: int,
        content: bytes,
        *,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.replies.append(
            lambda request: Response(
                status_code,
                content=content,
                headers=headers,
                request=request,
            )
        )

    def add_exception(self, error: BaseException) -> None:
        self.replies.append(error)


@pytest.fixture
def solveit_settings(monkeypatch: pytest.MonkeyPatch) -> Settings:
    settings = Settings(
        _env_file=None,
        app_env="test",
        secret_key="test-secret-key-for-testing-only",
        solveit_base_url="https://solveit.test",
        solveit_intake_key=SecretStr("intake-test-secret"),
    )
    monkeypatch.setitem(app.dependency_overrides, get_settings, lambda: settings)
    return settings


@pytest.fixture
def intake_mock(monkeypatch: pytest.MonkeyPatch) -> IntakeMock:
    mock = IntakeMock()
    monkeypatch.setattr(feedback_service, "AsyncClient", mock.client)
    return mock


@pytest.fixture
async def auth_context(db_session: AsyncSession) -> AuthContext:
    tenant = Customer(
        id=uuid.uuid4(),
        name="Feedback Test Tenant",
        slug=f"feedback-{uuid.uuid4().hex}",
        status="active",
    )
    user = User(
        id=uuid.uuid4(),
        email=f"feedback-{uuid.uuid4().hex}@example.com",
        hashed_password="unused-test-password-hash",
        full_name="Feedback Test User",
        role="recruiter",
        tenant_id=tenant.id,
        is_active=True,
        is_verified=True,
    )
    db_session.add_all([tenant, user])
    await db_session.flush()
    token = create_access_token({"sub": user.email})
    return AuthContext(user=user, headers=auth_headers(token))


def _request_json(request: Request) -> dict[str, object]:
    return json.loads(request.content)


def _request_header(request: Request, name: str) -> str:
    value = request.headers.get(name)
    assert value is not None
    return value


async def test_feedback_requires_authentication(
    client: AsyncClient, intake_mock: IntakeMock
) -> None:
    response = await client.post(
        "/feedback",
        json={"category": "general", "message": "Eine authentisierte Meldung."},
    )

    assert response.status_code == 401
    assert intake_mock.calls == []


@pytest.mark.parametrize("category", ["bug", "feature", "general", "ux"])
async def test_feedback_all_categories_are_forwarded_with_authenticated_identity(
    client: AsyncClient,
    auth_context: AuthContext,
    intake_mock: IntakeMock,
    solveit_settings: Settings,
    category: Literal["bug", "feature", "general", "ux"],
) -> None:
    del solveit_settings
    intake_mock.add_json(201, RECEIPT)
    key = str(uuid.uuid4())

    response = await client.post(
        "/feedback",
        headers={**auth_context.headers, "Idempotency-Key": key},
        json={
            "category": category,
            "message": f"Feedback für Kategorie {category}.",
            "email": "spoofed-client@example.invalid",
            "page_url": "/jobs?tab=all#feedback",
        },
    )

    assert response.status_code == 201
    assert response.json() == {
        "id": "8402",
        "status": "received",
        "reference": "SOL-7301",
    }
    assert len(intake_mock.calls) == 1
    request = intake_mock.calls[0]
    payload = _request_json(request)
    expected_subject = {
        "bug": "PalmScout: Fehlermeldung",
        "feature": "PalmScout: Funktionswunsch",
        "general": "PalmScout: Rückmeldung",
        "ux": "PalmScout: Bedienung und Gestaltung",
    }[category]
    assert payload == {
        "subject": expected_subject,
        "description": f"Feedback für Kategorie {category}.",
        "category": "bug" if category == "bug" else "feedback",
        "environment": "development",
        "page_path": "/jobs",
        "reporter": {
            "user_id": str(auth_context.user.id),
            "tenant_id": str(auth_context.user.tenant_id),
        },
    }
    assert "email" not in payload
    assert _request_header(request, "Authorization") == "Bearer intake-test-secret"
    remote_key = _request_header(request, "Idempotency-Key")
    assert remote_key == f"palmscout:{auth_context.user.id}:{key}"
    assert len(intake_mock.client_kwargs) == 1
    client_kwargs = intake_mock.client_kwargs[0]
    assert client_kwargs["follow_redirects"] is False
    assert client_kwargs["trust_env"] is False
    assert isinstance(client_kwargs["timeout"], httpx.Timeout)


async def test_feedback_rejects_non_uuid_idempotency_header(
    client: AsyncClient,
    auth_context: AuthContext,
    intake_mock: IntakeMock,
    solveit_settings: Settings,
) -> None:
    del solveit_settings
    response = await client.post(
        "/feedback",
        headers={**auth_context.headers, "Idempotency-Key": "definitely-not-a-uuid"},
        json={"message": "Eine Meldung mit einem falschen Schlüssel."},
    )

    assert response.status_code == 422
    assert intake_mock.calls == []


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("reporter", {"user_id": "attacker", "tenant_id": "foreign-tenant"}),
        ("user_id", "attacker"),
        ("tenant_id", "foreign-tenant"),
    ],
)
async def test_feedback_rejects_client_identity_fields(
    client: AsyncClient,
    auth_context: AuthContext,
    intake_mock: IntakeMock,
    solveit_settings: Settings,
    field: str,
    value: object,
) -> None:
    del solveit_settings
    response = await client.post(
        "/feedback",
        headers={**auth_context.headers, "Idempotency-Key": str(uuid.uuid4())},
        json={"message": "Die Identität kommt ausschließlich aus dem Token.", field: value},
    )

    assert response.status_code == 422
    assert intake_mock.calls == []


@pytest.mark.parametrize("intake_key", [None, SecretStr("")], ids=["missing", "empty"])
async def test_feedback_without_intake_configuration_returns_generic_503(
    client: AsyncClient,
    auth_context: AuthContext,
    intake_mock: IntakeMock,
    solveit_settings: Settings,
    intake_key: SecretStr | None,
) -> None:
    solveit_settings.solveit_intake_key = intake_key

    response = await client.post(
        "/feedback",
        headers={**auth_context.headers, "Idempotency-Key": str(uuid.uuid4())},
        json={"message": "Die Konfiguration fehlt im Test."},
    )

    assert response.status_code == 503
    assert response.json() == {"detail": GENERIC_UNAVAILABLE}
    assert "intake-test-secret" not in response.text
    assert intake_mock.calls == []


async def test_feedback_uses_authenticated_user_and_tenant_after_lost_response(
    client: AsyncClient,
    auth_context: AuthContext,
    intake_mock: IntakeMock,
    solveit_settings: Settings,
) -> None:
    del solveit_settings
    intake_mock.add_exception(httpx.ReadError("response lost; intake-test-secret"))
    intake_mock.add_json(201, RECEIPT)
    key = str(uuid.uuid4())
    body = {
        "category": "general",
        "message": "Die identische Rückmeldung wird erneut versucht.",
        "email": "forged@example.invalid",
        "page_url": "/feedback?from=dashboard#retry",
    }

    first = await client.post(
        "/feedback", headers={**auth_context.headers, "Idempotency-Key": key}, json=body
    )
    second = await client.post(
        "/feedback", headers={**auth_context.headers, "Idempotency-Key": key}, json=body
    )

    assert first.status_code == 503
    assert first.json() == {"detail": GENERIC_UNAVAILABLE}
    assert second.status_code == 201
    assert second.json()["reference"] == "SOL-7301"
    assert len(intake_mock.calls) == 2

    first_request, second_request = intake_mock.calls
    assert first_request.content == second_request.content
    assert _request_header(first_request, "Authorization") == _request_header(
        second_request, "Authorization"
    )
    assert _request_header(first_request, "Idempotency-Key") == _request_header(
        second_request, "Idempotency-Key"
    )
    for request in intake_mock.calls:
        payload = _request_json(request)
        assert payload["page_path"] == "/feedback"
        assert payload["reporter"] == {
            "user_id": str(auth_context.user.id),
            "tenant_id": str(auth_context.user.tenant_id),
        }
        assert "forged@example.invalid" not in request.content.decode()


@pytest.mark.parametrize(
    "failure",
    [
        "conflict",
        "unauthorized",
        "forbidden",
        "server_error",
        "malformed",
        "redirect",
        "timeout",
        "oversized",
        "ticket_mismatch",
        "wrong_application",
    ],
)
async def test_feedback_remote_failures_are_generic_and_never_expose_secrets(
    client: AsyncClient,
    auth_context: AuthContext,
    intake_mock: IntakeMock,
    solveit_settings: Settings,
    failure: str,
) -> None:
    del solveit_settings
    secret = b"intake-test-secret remote body"
    if failure == "conflict":
        intake_mock.add_content(409, secret)
    elif failure == "unauthorized":
        intake_mock.add_content(401, secret)
    elif failure == "forbidden":
        intake_mock.add_content(403, secret)
    elif failure == "server_error":
        intake_mock.add_content(500, secret)
    elif failure == "malformed":
        intake_mock.add_content(201, b'{"data":{"reference":"SECRET-LEAK"}}')
    elif failure == "redirect":
        intake_mock.add_content(
            307,
            secret,
            headers={"Location": "https://evil.example.invalid/SECRET-LEAK"},
        )
    elif failure == "timeout":
        intake_mock.add_exception(httpx.ReadTimeout("SECRET-LEAK"))
    elif failure == "ticket_mismatch":
        receipt = {**RECEIPT, "data": {**RECEIPT["data"], "reference": "SOL-9999"}}
        intake_mock.add_json(201, receipt)
    elif failure == "wrong_application":
        receipt = {**RECEIPT, "data": {**RECEIPT["data"], "application": "other-app"}}
        intake_mock.add_json(201, receipt)
    else:
        intake_mock.add_content(201, b"x" * 8193)

    response = await client.post(
        "/feedback",
        headers={**auth_context.headers, "Idempotency-Key": str(uuid.uuid4())},
        json={"message": f"Remote failure case: {failure}."},
    )

    assert response.status_code == (409 if failure == "conflict" else 503)
    assert "intake-test-secret" not in response.text
    assert "SECRET-LEAK" not in response.text
    if failure == "conflict":
        assert response.json()["detail"] == (
            "Diese Rückmeldung wurde mit anderem Inhalt gesendet. Bitte neu formulieren."
        )
    else:
        assert response.json() == {"detail": GENERIC_UNAVAILABLE}


@pytest.mark.parametrize(
    "page_url",
    ["https://evil.example.invalid/path", "//evil.example.invalid/path", "/bad\\path"],
)
async def test_feedback_rejects_non_local_page_paths(
    client: AsyncClient,
    auth_context: AuthContext,
    intake_mock: IntakeMock,
    solveit_settings: Settings,
    page_url: str,
) -> None:
    del solveit_settings
    response = await client.post(
        "/feedback",
        headers={**auth_context.headers, "Idempotency-Key": str(uuid.uuid4())},
        json={"message": "Die Seitenadresse ist nicht lokal.", "page_url": page_url},
    )

    assert response.status_code == 422
    assert intake_mock.calls == []


async def test_feedback_rejects_message_above_maximum(
    client: AsyncClient,
    auth_context: AuthContext,
    intake_mock: IntakeMock,
    solveit_settings: Settings,
) -> None:
    del solveit_settings
    response = await client.post(
        "/feedback",
        headers={**auth_context.headers, "Idempotency-Key": str(uuid.uuid4())},
        json={"message": "x" * 2001},
    )

    assert response.status_code == 422
    assert intake_mock.calls == []


async def test_feedback_rejects_message_below_minimum(
    client: AsyncClient,
    auth_context: AuthContext,
    intake_mock: IntakeMock,
    solveit_settings: Settings,
) -> None:
    del solveit_settings
    response = await client.post(
        "/feedback",
        headers={**auth_context.headers, "Idempotency-Key": str(uuid.uuid4())},
        json={"message": "kurz"},
    )

    assert response.status_code == 422
    assert intake_mock.calls == []
