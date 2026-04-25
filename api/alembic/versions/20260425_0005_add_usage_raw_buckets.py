"""Add raw usage bucket columns to usage_ledger."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260425_0005"
down_revision = "20260425_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("usage_ledger", sa.Column("chat_input_tokens_le_200k", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledger", sa.Column("chat_input_tokens_gt_200k", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledger", sa.Column("chat_output_tokens_le_200k", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledger", sa.Column("chat_output_tokens_gt_200k", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledger", sa.Column("image_input_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledger", sa.Column("image_text_output_tokens", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("usage_ledger", sa.Column("image_output_tokens", sa.Integer(), nullable=False, server_default="0"))

    op.execute(
        """
        UPDATE usage_ledger
        SET
            chat_input_tokens_le_200k = CASE
                WHEN request_type = 'chat' AND prompt_tokens <= 200000 THEN prompt_tokens
                ELSE 0
            END,
            chat_input_tokens_gt_200k = CASE
                WHEN request_type = 'chat' AND prompt_tokens > 200000 THEN prompt_tokens
                ELSE 0
            END,
            chat_output_tokens_le_200k = CASE
                WHEN request_type = 'chat' AND prompt_tokens <= 200000 THEN candidate_tokens
                ELSE 0
            END,
            chat_output_tokens_gt_200k = CASE
                WHEN request_type = 'chat' AND prompt_tokens > 200000 THEN candidate_tokens
                ELSE 0
            END,
            image_input_tokens = CASE
                WHEN request_type = 'image' THEN prompt_tokens
                ELSE 0
            END,
            image_text_output_tokens = CASE
                WHEN request_type = 'image' THEN CAST(ROUND(COALESCE(output_cost_usd, 0) / 0.000003) AS INTEGER)
                ELSE 0
            END,
            image_output_tokens = CASE
                WHEN request_type = 'image' THEN GREATEST(
                    candidate_tokens - CAST(ROUND(COALESCE(output_cost_usd, 0) / 0.000003) AS INTEGER),
                    0
                )
                ELSE 0
            END
        """
    )

    op.alter_column("usage_ledger", "chat_input_tokens_le_200k", server_default=None)
    op.alter_column("usage_ledger", "chat_input_tokens_gt_200k", server_default=None)
    op.alter_column("usage_ledger", "chat_output_tokens_le_200k", server_default=None)
    op.alter_column("usage_ledger", "chat_output_tokens_gt_200k", server_default=None)
    op.alter_column("usage_ledger", "image_input_tokens", server_default=None)
    op.alter_column("usage_ledger", "image_text_output_tokens", server_default=None)
    op.alter_column("usage_ledger", "image_output_tokens", server_default=None)


def downgrade() -> None:
    op.drop_column("usage_ledger", "image_output_tokens")
    op.drop_column("usage_ledger", "image_text_output_tokens")
    op.drop_column("usage_ledger", "image_input_tokens")
    op.drop_column("usage_ledger", "chat_output_tokens_gt_200k")
    op.drop_column("usage_ledger", "chat_output_tokens_le_200k")
    op.drop_column("usage_ledger", "chat_input_tokens_gt_200k")
    op.drop_column("usage_ledger", "chat_input_tokens_le_200k")
