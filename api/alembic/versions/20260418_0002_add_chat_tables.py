"""Add chat, message, and history tables."""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260418_0002"
down_revision = "20260415_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "chat",
        sa.Column("chat_id", sa.Uuid(), primary_key=True),
        sa.Column("user_uuid", sa.Uuid(), sa.ForeignKey("user.uuid"), nullable=False),
        sa.Column("last_message_preview", sa.Text(), nullable=True),
        sa.Column("last_message_type", sa.String(length=16), nullable=True),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_chat_user_uuid", "chat", ["user_uuid"], unique=False)

    op.create_table(
        "message",
        sa.Column("message_id", sa.Uuid(), primary_key=True),
        sa.Column("chat_id", sa.Uuid(), sa.ForeignKey("chat.chat_id"), nullable=False),
        sa.Column("user_uuid", sa.Uuid(), sa.ForeignKey("user.uuid"), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column("image_s3_key", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_message_chat_id", "message", ["chat_id"], unique=False)
    op.create_index("ix_message_user_uuid", "message", ["user_uuid"], unique=False)

    op.create_table(
        "history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("chat_id", sa.Uuid(), sa.ForeignKey("chat.chat_id"), nullable=False),
        sa.Column("message_id", sa.Uuid(), sa.ForeignKey("message.message_id"), nullable=False),
        sa.Column("user_uuid", sa.Uuid(), sa.ForeignKey("user.uuid"), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("part_type", sa.String(length=16), nullable=False),
        sa.Column("text_content", sa.Text(), nullable=True),
        sa.Column("image_s3_key", sa.Text(), nullable=True),
        sa.Column("mime_type", sa.String(length=255), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_history_chat_id", "history", ["chat_id"], unique=False)
    op.create_index("ix_history_message_id", "history", ["message_id"], unique=False)
    op.create_index("ix_history_user_uuid", "history", ["user_uuid"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_history_user_uuid", table_name="history")
    op.drop_index("ix_history_message_id", table_name="history")
    op.drop_index("ix_history_chat_id", table_name="history")
    op.drop_table("history")

    op.drop_index("ix_message_user_uuid", table_name="message")
    op.drop_index("ix_message_chat_id", table_name="message")
    op.drop_table("message")

    op.drop_index("ix_chat_user_uuid", table_name="chat")
    op.drop_table("chat")
