from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import validate_admin_key
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.chat import Chat
from app.models.message import Message
from app.models.user import User
from app.schemas.chat import ChatMessageResponse, MessageRole, MessageType

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminChatSummary(BaseModel):
    chat_id: UUID
    title: str | None
    last_message_preview: str | None
    last_message_type: str | None
    last_message_at: datetime | None
    created_at: datetime
    updated_at: datetime
    user_uuid: UUID
    user_api_key: str


class AdminChatDetail(BaseModel):
    chat_id: UUID
    title: str | None
    type: str
    created_at: datetime
    updated_at: datetime
    last_message_preview: str | None
    last_message_type: str | None
    last_message_at: datetime | None
    user_uuid: UUID
    user_api_key: str
    messages: list[ChatMessageResponse]


@router.get("/chats", response_model=list[AdminChatSummary])
def list_all_chats(
    request: Request,
    db_session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> list[AdminChatSummary]:
    validate_admin_key(request, settings)

    rows = db_session.execute(
        select(Chat, User)
        .join(User, Chat.user_uuid == User.uuid)
        .where(Chat.user_uuid.is_not(None))
        .order_by(Chat.last_message_at.desc().nullslast(), Chat.created_at.desc())
    ).all()

    return [
        AdminChatSummary(
            chat_id=chat.chat_id,
            title=chat.title,
            last_message_preview=chat.last_message_preview,
            last_message_type=chat.last_message_type,
            last_message_at=chat.last_message_at,
            created_at=chat.created_at,
            updated_at=chat.updated_at,
            user_uuid=user.uuid,
            user_api_key=user.api_key,
        )
        for chat, user in rows
    ]


@router.get("/chats/{chat_id}", response_model=AdminChatDetail)
def get_admin_chat_detail(
    request: Request,
    chat_id: UUID,
    db_session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
) -> AdminChatDetail:
    validate_admin_key(request, settings)

    row = db_session.execute(
        select(Chat, User)
        .join(User, Chat.user_uuid == User.uuid)
        .where(Chat.chat_id == chat_id, Chat.user_uuid.is_not(None))
    ).first()

    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="chat not found")

    chat, user = row

    messages = db_session.scalars(
        select(Message)
        .where(Message.chat_id == chat_id)
        .order_by(Message.created_at.asc(), Message.message_id.asc())
    ).all()

    has_image = any(m.type == "image" for m in messages)

    return AdminChatDetail(
        chat_id=chat.chat_id,
        title=chat.title,
        type="image" if has_image else "chat",
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        last_message_preview=chat.last_message_preview,
        last_message_type=chat.last_message_type,
        last_message_at=chat.last_message_at,
        user_uuid=user.uuid,
        user_api_key=user.api_key,
        messages=[
            ChatMessageResponse(
                message_id=message.message_id,
                role=MessageRole(message.role),
                type=MessageType(message.type),
                text_content=message.text_content,
                image_s3_key=message.image_s3_key,
                image_url=None,
                attached_images=None,
                created_at=message.created_at,
            )
            for message in messages
        ],
    )
