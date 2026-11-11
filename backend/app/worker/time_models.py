"""ORM models for worker time tracking (Sprint 4.2)."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import UUID, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base_model import UUIDBase

TIME_ENTRY_STATUSES = ("draft", "submitted", "approved", "rejected", "correction_requested")
CORRECTION_STATUSES = ("pending", "approved", "rejected")


class TimeEntry(UUIDBase):
    __tablename__ = "time_entries"

    worker_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("work_assignments.id", ondelete="SET NULL"), nullable=True
    )
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    clock_in: Mapped[datetime] = mapped_column(nullable=False)
    clock_out: Mapped[datetime | None] = mapped_column(nullable=True)
    break_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="draft", nullable=False)
    location_note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    project_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    cost_center: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gps_lat: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    gps_lon: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(nullable=True)
    rejection_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    worker_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    @property
    def net_minutes(self) -> int | None:
        """Worked minutes minus break."""
        if self.clock_out is None:
            return None
        total = int((self.clock_out - self.clock_in).total_seconds() / 60)
        return max(0, total - self.break_minutes)


class TimeEntryCorrection(UUIDBase):
    __tablename__ = "time_entry_corrections"

    entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("time_entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    requested_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    old_values: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    new_values: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(nullable=True)
