"""Add usage ledger table."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260420_0003"
down_revision = "20260418_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "usage_ledger",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("request_id", sa.Uuid(), nullable=False, unique=True),
        sa.Column("chat_id", sa.Uuid(), sa.ForeignKey("chat.chat_id"), nullable=True),
        sa.Column("user_uuid", sa.Uuid(), sa.ForeignKey("user.uuid"), nullable=False),
        sa.Column("api_key_hash", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=128), nullable=False),
        sa.Column("request_type", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("image_size", sa.String(length=8), nullable=True),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("candidate_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("generated_image_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("input_cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("output_cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("image_cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("total_cost_usd", sa.Numeric(12, 6), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_usage_ledger_api_key_hash", "usage_ledger", ["api_key_hash"], unique=False)
    op.create_index("ix_usage_ledger_user_uuid", "usage_ledger", ["user_uuid"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_usage_ledger_user_uuid", table_name="usage_ledger")
    op.drop_index("ix_usage_ledger_api_key_hash", table_name="usage_ledger")
    op.drop_table("usage_ledger")
