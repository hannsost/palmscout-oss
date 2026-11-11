"""Transaction-local RLS context owned by one authenticated request Session."""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from sqlalchemy import event, text
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session, SessionTransaction

_INFO_KEY = "palmscout_authenticated_tenant_context"
_SET_CONTEXT = text(
    "SELECT set_config('app.current_tenant_id', :tenant_id, true), "
    "set_config('app.is_admin', :is_admin, true)"
)


@dataclass(frozen=True)
class TenantContext:
    tenant_id: UUID | None
    platform_admin: bool

    def parameters(self) -> dict[str, str]:
        return {
            "tenant_id": str(self.tenant_id) if self.tenant_id is not None else "",
            "is_admin": "true" if self.platform_admin else "false",
        }


_DENY_CONTEXT = TenantContext(tenant_id=None, platform_admin=False)


@event.listens_for(Session, "after_begin")
def restore_tenant_context(
    session: Session, transaction: SessionTransaction, connection: Connection
) -> None:
    """Reapply after commit/rollback, using the event's synchronous connection.

    No connection-wide/session SQL settings are retained: PostgreSQL resets both
    values when the transaction ends. Anonymous/new Sessions explicitly start
    with no tenant and no bypass, including when they reuse a pooled connection.
    """
    if connection.dialect.name != "postgresql":
        return
    context = session.info.get(_INFO_KEY, _DENY_CONTEXT)
    if not isinstance(context, TenantContext):
        raise RuntimeError("Invalid authenticated tenant context")
    connection.execute(_SET_CONTEXT, context.parameters())


async def clear_tenant_context(session: AsyncSession) -> None:
    """Remove a prior identity before authentication or an anonymous return."""
    session.info.pop(_INFO_KEY, None)
    if session.in_transaction():
        await session.execute(_SET_CONTEXT, _DENY_CONTEXT.parameters())


async def set_tenant_context(session: AsyncSession, *, tenant_id: UUID | None, role: str) -> None:
    """Call only with the currently validated database user's authorization.

    Tenant administrators are scoped exactly like other tenant users. Only an
    administrator without a tenant can use the platform-wide policy branch.
    The user lookup already began a transaction, so also set its current values.
    """
    context = TenantContext(
        tenant_id=tenant_id,
        platform_admin=role == "admin" and tenant_id is None,
    )
    session.info[_INFO_KEY] = context
    await session.execute(_SET_CONTEXT, context.parameters())
