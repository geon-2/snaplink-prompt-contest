"""Add history image lookup index."""

from __future__ import annotations

from alembic import op


revision = "20260513_0008"
down_revision = "20260509_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_history_role_part_type_created_at",
        "history",
        ["role", "part_type", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_history_role_part_type_created_at", table_name="history")
