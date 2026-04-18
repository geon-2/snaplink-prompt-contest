from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from fastapi import Form
from pydantic import BaseModel, UUID4


class ChatCompletionType(str, Enum):
    CHAT = "chat"
    IMAGE = "image"


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


class MessageType(str, Enum):
    CHAT = "chat"
    IMAGE = "image"


class ChatCompletionForm(BaseModel):
    uuid: UUID4
    chat_id: UUID | None = None
    type: ChatCompletionType
    text: str | None = None

    @classmethod
    def as_form(
        cls,
        uuid: UUID4 = Form(...),
        chat_id: UUID | None = Form(default=None),
        type: ChatCompletionType = Form(...),
        text: str | None = Form(default=None),
    ) -> "ChatCompletionForm":
        return cls(uuid=uuid, chat_id=chat_id, type=type, text=text)


class ChatSummaryResponse(BaseModel):
    chat_id: UUID
    last_message_preview: str | None
    last_message_type: MessageType | None
    last_message_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ChatMessageResponse(BaseModel):
    message_id: UUID
    role: MessageRole
    type: MessageType
    text_content: str | None
    image_s3_key: str | None
    created_at: datetime


class ChatDetailResponse(BaseModel):
    chat_id: UUID
    created_at: datetime
    updated_at: datetime
    last_message_preview: str | None
    last_message_type: MessageType | None
    last_message_at: datetime | None
    messages: list[ChatMessageResponse]
