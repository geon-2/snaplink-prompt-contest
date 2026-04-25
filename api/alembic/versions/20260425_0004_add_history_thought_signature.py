"""Add thought_signature to history."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260425_0004"
down_revision = "20260420_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("history", sa.Column("thought_signature", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("history", "thought_signature")
