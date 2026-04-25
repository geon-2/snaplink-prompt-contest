from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class History(Base):
    __tablename__ = "history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    chat_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("chat.chat_id"), index=True, nullable=False)
    message_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("message.message_id"),
        index=True,
        nullable=False,
    )
    user_uuid: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("user.uuid"), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(16), nullable=False)
    part_type: Mapped[str] = mapped_column(String(16), nullable=False)
    text_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_s3_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    thought_signature: Mapped[str | None] = mapped_column(Text, nullable=True)
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
