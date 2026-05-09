"""Add final prompt submission table."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260509_0007"
down_revision = "20260427_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "final_prompt_submission",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("api_key_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("api_key_preview", sa.String(length=64), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("image_1_s3_key", sa.Text(), nullable=True),
        sa.Column("image_2_s3_key", sa.Text(), nullable=True),
        sa.Column("error_detail", sa.Text(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index(
        "ix_final_prompt_submission_api_key_hash",
        "final_prompt_submission",
        ["api_key_hash"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_final_prompt_submission_api_key_hash", table_name="final_prompt_submission")
    op.drop_table("final_prompt_submission")
