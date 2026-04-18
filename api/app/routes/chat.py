from __future__ import annotations

import json
import mimetypes
import re
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import authenticate_user_request
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.chat import Chat
from app.models.history import History
from app.models.message import Message
from app.schemas.chat import (
    ChatCompletionForm,
    ChatCompletionType,
    ChatDetailResponse,
    ChatMessageResponse,
    ChatSummaryResponse,
    MessageRole,
    MessageType,
)
from app.services.gemini import GeminiImageEvent, GeminiService, GeminiTextEvent, get_gemini_service
from app.services.storage import S3StorageService, get_storage_service


router = APIRouter(tags=["chat"])

IMAGE_PREVIEW_TEXT = "[image]"


@dataclass(slots=True)
class UploadedInputImage:
    s3_key: str
    mime_type: str


@dataclass(slots=True)
class GeneratedAssistantImage:
    message_id: UUID
    s3_key: str
    mime_type: str


@router.post("/chat/completion")
def chat_completion(
    request: Request,
    payload: ChatCompletionForm = Depends(ChatCompletionForm.as_form),
    files: list[UploadFile] | None = File(default=None),
    db_session: Session = Depends(get_db_session),
    gemini_service: GeminiService = Depends(get_gemini_service),
    storage_service: S3StorageService = Depends(get_storage_service),
) -> StreamingResponse:
    settings = get_settings()
    normalized_text = _normalize_text(payload.text)
    uploads = list(files or [])
    _validate_completion_request(payload.type, normalized_text, uploads)

    user = authenticate_user_request(
        request=request,
        requested_uuid=payload.uuid,
        db_session=db_session,
    )
    chat = _get_or_create_chat(db_session=db_session, user_uuid=payload.uuid, chat_id=payload.chat_id)

    user_message = _create_user_message(
        db_session=db_session,
        storage_service=storage_service,
        settings=settings,
        uploads=uploads,
        user_uuid=payload.uuid,
        chat=chat,
        message_type=payload.type.value,
        text_content=normalized_text,
    )

    try:
        contents = _build_gemini_contents(
            db_session=db_session,
            chat_id=chat.chat_id,
            user_api_key=user.api_key,
            settings=settings,
            gemini_service=gemini_service,
            storage_service=storage_service,
        )
    except Exception:
        db_session.rollback()
        raise

    response_payload = {"contents": contents}
    model_name = gemini_service.model
    if payload.type is ChatCompletionType.IMAGE:
        model_name = gemini_service.image_model
        response_payload["generationConfig"] = {"responseModalities": ["TEXT", "IMAGE"]}

    def stream_events() -> object:
        yield _sse_event(
            "meta",
            {
                "chat_id": str(chat.chat_id),
                "user_message_id": str(user_message.message_id),
            },
        )

        assistant_text_chunks: list[str] = []
        assistant_images: list[GeneratedAssistantImage] = []

        try:
            for event in gemini_service.stream_generate_content(
                api_key=user.api_key,
                model=model_name,
                payload=response_payload,
            ):
                if isinstance(event, GeminiTextEvent):
                    assistant_text_chunks.append(event.text)
                    yield _sse_event("text_delta", {"text": event.text})
                    continue

                image_message_id = uuid4()
                image_key = _build_output_s3_key(
                    settings=settings,
                    user_uuid=payload.uuid,
                    chat_id=chat.chat_id,
                    message_id=image_message_id,
                    index=len(assistant_images),
                    mime_type=event.mime_type,
                )
                storage_service.upload_bytes(event.data, image_key, event.mime_type)
                assistant_images.append(
                    GeneratedAssistantImage(
                        message_id=image_message_id,
                        s3_key=image_key,
                        mime_type=event.mime_type,
                    )
                )
                yield _sse_event("image", {"s3_key": image_key})

            _create_assistant_messages(
                db_session=db_session,
                chat=chat,
                user_uuid=payload.uuid,
                text_content="".join(assistant_text_chunks).strip() or None,
                generated_images=assistant_images,
            )
            yield _sse_event("done", {"chat_id": str(chat.chat_id)})
        except Exception as exc:
            db_session.rollback()
            yield _sse_event("error", {"detail": str(exc)})

    return StreamingResponse(
        stream_events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache"},
    )


@router.get("/chats", response_model=list[ChatSummaryResponse])
def list_chats(
    request: Request,
    uuid: UUID = Query(...),
    db_session: Session = Depends(get_db_session),
) -> list[ChatSummaryResponse]:
    authenticate_user_request(request=request, requested_uuid=uuid, db_session=db_session)

    chats = db_session.scalars(
        select(Chat)
        .where(Chat.user_uuid == uuid)
        .order_by(Chat.updated_at.desc(), Chat.created_at.desc())
    ).all()
    return [
        ChatSummaryResponse(
            chat_id=chat.chat_id,
            last_message_preview=chat.last_message_preview,
            last_message_type=MessageType(chat.last_message_type) if chat.last_message_type else None,
            last_message_at=chat.last_message_at,
            created_at=chat.created_at,
            updated_at=chat.updated_at,
        )
        for chat in chats
    ]


@router.get("/chats/{chat_id}", response_model=ChatDetailResponse)
def get_chat_detail(
    request: Request,
    chat_id: UUID,
    uuid: UUID = Query(...),
    db_session: Session = Depends(get_db_session),
) -> ChatDetailResponse:
    authenticate_user_request(request=request, requested_uuid=uuid, db_session=db_session)
    chat = db_session.scalar(select(Chat).where(Chat.chat_id == chat_id, Chat.user_uuid == uuid))
    if chat is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="chat not found")

    messages = db_session.scalars(
        select(Message)
        .where(Message.chat_id == chat_id, Message.user_uuid == uuid)
        .order_by(Message.created_at.asc(), Message.message_id.asc())
    ).all()

    return ChatDetailResponse(
        chat_id=chat.chat_id,
        created_at=chat.created_at,
        updated_at=chat.updated_at,
        last_message_preview=chat.last_message_preview,
        last_message_type=MessageType(chat.last_message_type) if chat.last_message_type else None,
        last_message_at=chat.last_message_at,
        messages=[
            ChatMessageResponse(
                message_id=message.message_id,
                role=MessageRole(message.role),
                type=MessageType(message.type),
                text_content=message.text_content,
                image_s3_key=message.image_s3_key,
                created_at=message.created_at,
            )
            for message in messages
        ],
    )


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _validate_completion_request(
    completion_type: ChatCompletionType,
    text_content: str | None,
    uploads: list[UploadFile],
) -> None:
    if completion_type is ChatCompletionType.CHAT and not text_content and not uploads:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="chat requests require text or at least one image",
        )
    if completion_type is ChatCompletionType.IMAGE and not text_content:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="image requests require text",
        )


def _get_or_create_chat(*, db_session: Session, user_uuid: UUID, chat_id: UUID | None) -> Chat:
    if chat_id is not None:
        chat = db_session.scalar(select(Chat).where(Chat.chat_id == chat_id, Chat.user_uuid == user_uuid))
        if chat is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="chat not found")
        return chat

    now = _utcnow()
    chat = Chat(chat_id=uuid4(), user_uuid=user_uuid, created_at=now, updated_at=now)
    db_session.add(chat)
    db_session.flush()
    return chat


def _create_user_message(
    *,
    db_session: Session,
    storage_service: S3StorageService,
    settings: Settings,
    uploads: list[UploadFile],
    user_uuid: UUID,
    chat: Chat,
    message_type: str,
    text_content: str | None,
) -> Message:
    now = _utcnow()
    message_id = uuid4()
    uploaded_images: list[UploadedInputImage] = []

    for index, upload in enumerate(uploads):
        temp_path = _write_upload_to_temp(upload, settings.temp_upload_dir)
        mime_type = upload.content_type or "application/octet-stream"
        key = _build_input_s3_key(
            settings=settings,
            user_uuid=user_uuid,
            chat_id=chat.chat_id,
            message_id=message_id,
            index=index,
            filename=upload.filename,
        )
        try:
            storage_service.upload_file(temp_path, key, mime_type)
        finally:
            _remove_temp_file(temp_path)
        uploaded_images.append(UploadedInputImage(s3_key=key, mime_type=mime_type))

    message = Message(
        message_id=message_id,
        chat_id=chat.chat_id,
        user_uuid=user_uuid,
        role=MessageRole.USER.value,
        type=message_type,
        text_content=text_content,
        image_s3_key=uploaded_images[0].s3_key if uploaded_images else None,
        created_at=now,
    )
    db_session.add(message)

    sequence = 0
    if text_content:
        db_session.add(
            History(
                chat_id=chat.chat_id,
                message_id=message_id,
                user_uuid=user_uuid,
                role=MessageRole.USER.value,
                part_type="text",
                text_content=text_content,
                sequence=sequence,
                created_at=now,
            )
        )
        sequence += 1

    for uploaded_image in uploaded_images:
        db_session.add(
            History(
                chat_id=chat.chat_id,
                message_id=message_id,
                user_uuid=user_uuid,
                role=MessageRole.USER.value,
                part_type="image",
                image_s3_key=uploaded_image.s3_key,
                mime_type=uploaded_image.mime_type,
                sequence=sequence,
                created_at=now,
            )
        )
        sequence += 1

    _update_chat_metadata(chat, message.type, message.text_content, now)
    db_session.commit()
    db_session.refresh(message)
    db_session.refresh(chat)
    return message


def _build_gemini_contents(
    *,
    db_session: Session,
    chat_id: UUID,
    user_api_key: str,
    settings: Settings,
    gemini_service: GeminiService,
    storage_service: S3StorageService,
) -> list[dict[str, object]]:
    history_rows = db_session.scalars(
        select(History)
        .where(History.chat_id == chat_id)
        .order_by(History.created_at.asc(), History.id.asc(), History.sequence.asc())
    ).all()

    contents: list[dict[str, object]] = []
    current_message_id: UUID | None = None
    current_role: str | None = None
    current_parts: list[dict[str, object]] = []

    for row in history_rows:
        if current_message_id is not None and row.message_id != current_message_id:
            contents.append({"role": _gemini_role(current_role), "parts": current_parts})
            current_parts = []

        if row.message_id != current_message_id:
            current_message_id = row.message_id
            current_role = row.role

        if row.part_type == "text" and row.text_content:
            current_parts.append({"text": row.text_content})
            continue

        if row.part_type == "image" and row.image_s3_key:
            file_bytes, content_type = storage_service.download_object(row.image_s3_key)
            resolved_mime_type = row.mime_type or content_type or "application/octet-stream"
            temp_path = _write_bytes_to_temp(
                data=file_bytes,
                temp_upload_dir=settings.temp_upload_dir,
                suffix=_extension_from_mime_type(resolved_mime_type),
            )
            try:
                uploaded_file = gemini_service.upload_file(
                    api_key=user_api_key,
                    file_path=temp_path,
                    mime_type=resolved_mime_type,
                    display_name=Path(row.image_s3_key).name,
                )
            finally:
                _remove_temp_file(temp_path)
            current_parts.append(gemini_service.build_file_part(uploaded_file))

    if current_parts:
        contents.append({"role": _gemini_role(current_role), "parts": current_parts})

    return contents


def _create_assistant_messages(
    *,
    db_session: Session,
    chat: Chat,
    user_uuid: UUID,
    text_content: str | None,
    generated_images: list[GeneratedAssistantImage],
) -> None:
    last_event_time: datetime | None = None
    last_type: str | None = None
    last_preview: str | None = None

    if text_content:
        created_at = _utcnow()
        message_id = uuid4()
        db_session.add(
            Message(
                message_id=message_id,
                chat_id=chat.chat_id,
                user_uuid=user_uuid,
                role=MessageRole.ASSISTANT.value,
                type=MessageType.CHAT.value,
                text_content=text_content,
                created_at=created_at,
            )
        )
        db_session.add(
            History(
                chat_id=chat.chat_id,
                message_id=message_id,
                user_uuid=user_uuid,
                role=MessageRole.ASSISTANT.value,
                part_type="text",
                text_content=text_content,
                sequence=0,
                created_at=created_at,
            )
        )
        last_event_time = created_at
        last_type = MessageType.CHAT.value
        last_preview = _build_message_preview(MessageType.CHAT.value, text_content)

    for generated_image in generated_images:
        created_at = _utcnow()
        db_session.add(
            Message(
                message_id=generated_image.message_id,
                chat_id=chat.chat_id,
                user_uuid=user_uuid,
                role=MessageRole.ASSISTANT.value,
                type=MessageType.IMAGE.value,
                image_s3_key=generated_image.s3_key,
                created_at=created_at,
            )
        )
        db_session.add(
            History(
                chat_id=chat.chat_id,
                message_id=generated_image.message_id,
                user_uuid=user_uuid,
                role=MessageRole.ASSISTANT.value,
                part_type="image",
                image_s3_key=generated_image.s3_key,
                mime_type=generated_image.mime_type,
                sequence=0,
                created_at=created_at,
            )
        )
        last_event_time = created_at
        last_type = MessageType.IMAGE.value
        last_preview = IMAGE_PREVIEW_TEXT

    if last_event_time is not None and last_type is not None:
        chat.last_message_preview = last_preview
        chat.last_message_type = last_type
        chat.last_message_at = last_event_time
        chat.updated_at = last_event_time
        db_session.add(chat)
        db_session.commit()


def _gemini_role(role: str | None) -> str:
    return "model" if role == MessageRole.ASSISTANT.value else "user"


def _build_message_preview(message_type: str, text_content: str | None) -> str:
    if message_type == MessageType.IMAGE.value and not text_content:
        return IMAGE_PREVIEW_TEXT

    if text_content:
        return text_content[:120]

    return IMAGE_PREVIEW_TEXT


def _update_chat_metadata(chat: Chat, message_type: str, text_content: str | None, timestamp: datetime) -> None:
    chat.last_message_preview = _build_message_preview(message_type, text_content)
    chat.last_message_type = message_type
    chat.last_message_at = timestamp
    chat.updated_at = timestamp


def _sse_event(event: str, payload: dict[str, object]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _safe_filename(filename: str | None, fallback: str) -> str:
    raw_name = Path(filename or fallback).name
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", raw_name)
    return sanitized or fallback


def _join_s3_key(*parts: str) -> str:
    return "/".join(part.strip("/") for part in parts if part and part.strip("/"))


def _build_input_s3_key(
    *,
    settings: Settings,
    user_uuid: UUID,
    chat_id: UUID,
    message_id: UUID,
    index: int,
    filename: str | None,
) -> str:
    safe_name = _safe_filename(filename, f"upload-{index}")
    return _join_s3_key(
        settings.s3_prefix,
        "users",
        str(user_uuid),
        "chats",
        str(chat_id),
        "inputs",
        str(message_id),
        safe_name,
    )


def _build_output_s3_key(
    *,
    settings: Settings,
    user_uuid: UUID,
    chat_id: UUID,
    message_id: UUID,
    index: int,
    mime_type: str,
) -> str:
    extension = _extension_from_mime_type(mime_type)
    return _join_s3_key(
        settings.s3_prefix,
        "users",
        str(user_uuid),
        "chats",
        str(chat_id),
        "outputs",
        str(message_id),
        f"{index}{extension}",
    )


def _write_upload_to_temp(upload: UploadFile, temp_upload_dir: Path) -> Path:
    temp_upload_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(upload.filename or "").suffix or ""
    with tempfile.NamedTemporaryFile(delete=False, dir=temp_upload_dir, suffix=suffix) as temp_file:
        upload.file.seek(0)
        shutil.copyfileobj(upload.file, temp_file)
        return Path(temp_file.name)


def _write_bytes_to_temp(*, data: bytes, temp_upload_dir: Path, suffix: str) -> Path:
    temp_upload_dir.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(delete=False, dir=temp_upload_dir, suffix=suffix) as temp_file:
        temp_file.write(data)
        return Path(temp_file.name)


def _remove_temp_file(temp_path: Path) -> None:
    try:
        temp_path.unlink(missing_ok=True)
    except OSError:
        pass


def _extension_from_mime_type(mime_type: str) -> str:
    guessed_extension = mimetypes.guess_extension(mime_type)
    return guessed_extension or ".bin"
