from __future__ import annotations

from datetime import datetime
from enum import Enum
from uuid import UUID

from fastapi import Form
from pydantic import BaseModel, UUID4, field_validator


class ChatCompletionType(str, Enum):
    CHAT = "chat"
    IMAGE = "image"


class ChatImageSize(str, Enum):
    SIZE_05K = "0.5k"
    SIZE_1K = "1k"
    SIZE_2K = "2k"
    SIZE_4K = "4k"


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
    image_size: ChatImageSize = ChatImageSize.SIZE_1K

    @classmethod
    def as_form(
        cls,
        uuid: UUID4 = Form(...),
        chat_id: UUID | None = Form(default=None),
        type: ChatCompletionType = Form(...),
        text: str | None = Form(default=None),
        image_size: ChatImageSize = Form(default=ChatImageSize.SIZE_1K),
    ) -> "ChatCompletionForm":
        return cls(uuid=uuid, chat_id=chat_id, type=type, text=text, image_size=image_size)


class ChatTitleUpdateRequest(BaseModel):
    uuid: UUID4
    title: str | None

    @field_validator("title", mode="before")
    @classmethod
    def normalize_title(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        stripped = value.strip()
        if not stripped:
            return None
        if len(stripped) > 255:
            raise ValueError("title must be 255 characters or fewer")
        return stripped


class ChatSummaryResponse(BaseModel):
    chat_id: UUID
    title: str | None
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
    image_url: str | None = None
    attached_images: list[str] | None = None
    created_at: datetime


class ChatDetailResponse(BaseModel):
    chat_id: UUID
    title: str | None
    created_at: datetime
    updated_at: datetime
    last_message_preview: str | None
    last_message_type: MessageType | None
    last_message_at: datetime | None
    messages: list[ChatMessageResponse]


class GeneratedImageResponse(BaseModel):
    message_id: UUID
    chat_id: UUID
    image_s3_key: str
    created_at: datetime


class GeneratedImagePageResponse(BaseModel):
    items: list[GeneratedImageResponse]
    page: int
    page_size: int
    total: int
    has_next: bool
