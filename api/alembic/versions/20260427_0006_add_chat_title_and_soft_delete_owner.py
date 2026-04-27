"""Add chat title and nullable ownership for soft delete."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260427_0006"
down_revision = "20260425_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chat", sa.Column("title", sa.String(length=255), nullable=True))
    op.alter_column("chat", "user_uuid", existing_type=sa.Uuid(), nullable=True)
    op.alter_column("message", "user_uuid", existing_type=sa.Uuid(), nullable=True)
    op.alter_column("history", "user_uuid", existing_type=sa.Uuid(), nullable=True)


def downgrade() -> None:
    op.alter_column("history", "user_uuid", existing_type=sa.Uuid(), nullable=False)
    op.alter_column("message", "user_uuid", existing_type=sa.Uuid(), nullable=False)
    op.alter_column("chat", "user_uuid", existing_type=sa.Uuid(), nullable=False)
    op.drop_column("chat", "title")
