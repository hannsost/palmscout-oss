"""Shared FastAPI dependencies.

Usage in routers:
    from app.dependencies import CurrentUser, DBSession, TenantDB, AdminUser

    @router.get("/me")
    async def me(user: CurrentUser, db: DBSession) -> UserRead: ...

    @router.get("/admin/customers")
    async def list_customers(user: AdminUser, db: DBSession) -> ...: ...
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Annotated, Any

from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import get_redis
from app.database import get_db
from app.tenant_context import set_tenant_context
from app.users.models import User

# ── Database ──────────────────────────────────────────────────────────────────
DBSession = Annotated[AsyncSession, Depends(get_db)]

# ── Cache ─────────────────────────────────────────────────────────────────────
CacheClient = Annotated[Any, Depends(get_redis)]

# ── Auth ──────────────────────────────────────────────────────────────────────
from app.security import get_current_user  # noqa: E402

CurrentUser = Annotated[Any, Depends(get_current_user)]


# ── Tenant-aware DB session (sets PostgreSQL RLS context) ─────────────────────


async def _get_tenant_db(
    db: Annotated[AsyncSession, Depends(get_db)],
    current_user: Annotated[Any, Depends(get_current_user)],
) -> AsyncGenerator[AsyncSession, None]:
    """Use the same authenticated Session context as ordinary get_db routes."""
    await set_tenant_context(db, tenant_id=current_user.tenant_id, role=current_user.role)
    yield db


TenantDB = Annotated[AsyncSession, Depends(_get_tenant_db)]


# ── Role-gated current user shortcuts ─────────────────────────────────────────


async def _require_admin(user: Annotated[Any, Depends(get_current_user)]) -> Any:
    from app.security import require_admin

    return require_admin(user)


async def _require_platform_admin(user: Annotated[User, Depends(_require_admin)]) -> User:
    if user.tenant_id is not None:
        raise HTTPException(status_code=403, detail="Nur die Plattformadministration hat Zugriff.")
    return user


async def _require_recruiter(user: Annotated[Any, Depends(get_current_user)]) -> Any:
    from app.security import require_recruiter

    return require_recruiter(user)


async def _require_tenant_recruiter(user: Annotated[Any, Depends(_require_recruiter)]) -> Any:
    if user.tenant_id is None:
        raise HTTPException(status_code=403, detail="Keine Organisation zugewiesen.")
    return user


async def _require_worker(user: Annotated[Any, Depends(get_current_user)], db: DBSession) -> Any:
    from sqlalchemy import select

    from app.security import require_worker
    from app.worker.models import WorkerSettings

    require_worker(user)
    settings = await db.scalar(select(WorkerSettings).where(WorkerSettings.user_id == user.id))
    if (
        settings is None
        or not settings.is_active
        or user.tenant_id is None
        or settings.tenant_id != user.tenant_id
    ):
        raise HTTPException(
            status_code=403, detail="Der Zugang zum Mitarbeiterportal ist deaktiviert."
        )
    return user


AdminUser = Annotated[Any, Depends(_require_admin)]
PlatformAdminUser = Annotated[User, Depends(_require_platform_admin)]
RecruiterUser = Annotated[Any, Depends(_require_recruiter)]
TenantRecruiterUser = Annotated[Any, Depends(_require_tenant_recruiter)]
WorkerUser = Annotated[Any, Depends(_require_worker)]
