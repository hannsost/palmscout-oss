"""Server-only SolveIT intake transport; no local success before remote receipt."""

from __future__ import annotations

from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

from httpx import AsyncClient, HTTPError, Timeout
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator

from app.config import Settings
from app.feedback.models import FeedbackCategory
from app.users.models import User


class FeedbackCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    category: FeedbackCategory = FeedbackCategory.GENERAL
    message: str = Field(min_length=5, max_length=2000)
    # Compatibility with the previous client; identity always comes from auth.
    email: str | None = Field(default=None, max_length=255, exclude=True)
    page_url: str | None = Field(default=None, max_length=500)

    @field_validator("page_url", mode="before")
    @classmethod
    def local_path_only(cls, value: str | None) -> str:
        if value is None or value == "":
            return "/"
        if not isinstance(value, str) or (
            not value.startswith("/")
            or value.startswith("//")
            or len(value) > 500
            or any(ord(char) < 32 or ord(char) == 127 or char == "\\" for char in value)
        ):
            raise ValueError("Use a local page path without an origin.")
        return urlsplit(value).path or "/"


class FeedbackReceipt(BaseModel):
    id: str
    status: Literal["received"] = "received"
    reference: str


class IntakeReceipt(BaseModel):
    model_config = ConfigDict(strict=True)

    ticket_id: int = Field(gt=0)
    report_id: int = Field(gt=0)
    reference: str = Field(pattern=r"^SOL-[0-9]+$")
    application: Literal["palmscout"]


class IntakeResponse(BaseModel):
    data: IntakeReceipt


class FeedbackUnavailable(Exception):
    """No trustworthy receipt; caller may retry the identical request."""


class FeedbackConflict(Exception):
    """The logical report key was already used for different content."""


async def send_feedback(
    data: FeedbackCreate, user: User, request_id: UUID, settings: Settings
) -> FeedbackReceipt:
    key = settings.solveit_intake_key
    if not key or not key.get_secret_value():
        raise FeedbackUnavailable
    reporter = {"user_id": str(user.id)}
    if user.tenant_id:
        reporter["tenant_id"] = str(user.tenant_id)
    subjects = {
        FeedbackCategory.BUG: "PalmScout: Fehlermeldung",
        FeedbackCategory.FEATURE: "PalmScout: Funktionswunsch",
        FeedbackCategory.UX: "PalmScout: Bedienung und Gestaltung",
        FeedbackCategory.GENERAL: "PalmScout: Rückmeldung",
    }
    # Stable payload: no timestamp, release version or mutable email/name.
    payload = {
        "subject": subjects[data.category],
        "description": data.message,
        "category": "bug" if data.category == FeedbackCategory.BUG else "feedback",
        "environment": (
            settings.app_env if settings.app_env in {"production", "staging"} else "development"
        ),
        "page_path": data.page_url or "/",
        "reporter": reporter,
    }
    try:
        async with (
            AsyncClient(
                timeout=Timeout(8.0, connect=3.0), follow_redirects=False, trust_env=False
            ) as client,
            client.stream(
                "POST",
                settings.solveit_base_url + "/api/intake/v1/reports",
                headers={
                    "Authorization": "Bearer " + key.get_secret_value(),
                    "Idempotency-Key": f"palmscout:{user.id}:{request_id}",
                    "Accept": "application/json",
                },
                json=payload,
            ) as response,
        ):
            if response.status_code == 409:
                raise FeedbackConflict
            if response.status_code != 201:
                raise FeedbackUnavailable
            body = bytearray()
            async for chunk in response.aiter_bytes():
                body.extend(chunk)
                if len(body) > 8192:
                    raise FeedbackUnavailable
            receipt = IntakeResponse.model_validate_json(bytes(body)).data
            if int(receipt.reference[4:]) != receipt.ticket_id:
                raise FeedbackUnavailable
            return FeedbackReceipt(id=str(receipt.report_id), reference=receipt.reference)
    except (HTTPError, ValidationError, ValueError):
        # Never expose intake response bodies, credentials, or remote exception text.
        raise FeedbackUnavailable from None
