"""Structured recruiting drafts and provider-reported token usage."""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "054"
down_revision = "053"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("agent_runs", sa.Column("structured_output", postgresql.JSONB(), nullable=True))
    op.add_column("agent_runs", sa.Column("prompt_version", sa.String(80), nullable=True))
    op.add_column("agent_runs", sa.Column("input_tokens", sa.Integer(), nullable=True))
    op.add_column("agent_runs", sa.Column("output_tokens", sa.Integer(), nullable=True))


def downgrade() -> None:
    for name in ("output_tokens", "input_tokens", "prompt_version", "structured_output"):
        op.drop_column("agent_runs", name)
