"""Authenticated feedback with durable, idempotent receipt from SolveIT."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, status

from app.config import Settings, get_settings
from app.feedback.service import (
    FeedbackConflict,
    FeedbackCreate,
    FeedbackReceipt,
    FeedbackUnavailable,
    send_feedback,
)
from app.security import get_current_user
from app.users.models import User

router = APIRouter()


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    response_model=FeedbackReceipt,
    summary="Feedback authentisiert an den Support senden",
)
async def submit_feedback(
    data: FeedbackCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    settings: Annotated[Settings, Depends(get_settings)],
    idempotency_key: Annotated[UUID | None, Header()] = None,
) -> FeedbackReceipt:
    try:
        return await send_feedback(data, current_user, idempotency_key or uuid4(), settings)
    except FeedbackConflict:
        raise HTTPException(
            status_code=409,
            detail="Diese Rückmeldung wurde mit anderem Inhalt gesendet. Bitte neu formulieren.",
        ) from None
    except FeedbackUnavailable:
        raise HTTPException(
            status_code=503,
            detail="Feedback konnte nicht bestätigt werden. Bitte dieselbe Rückmeldung erneut senden.",
        ) from None
