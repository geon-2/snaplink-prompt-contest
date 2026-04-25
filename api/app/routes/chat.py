from __future__ import annotations

import base64
import json
import mimetypes
import re
import shutil
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.auth import authenticate_session_from_cookies, authenticate_user_request
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.chat import Chat
from app.models.history import History
from app.models.message import Message
from app.models.usage_ledger import UsageLedger
from app.schemas.chat import (
    ChatCompletionForm,
    ChatCompletionType,
    ChatDetailResponse,
    ChatImageSize,
    ChatMessageResponse,
    ChatSummaryResponse,
    GeneratedImagePageResponse,
    GeneratedImageResponse,
    MessageRole,
    MessageType,
)
from app.services.gemini import (
    GeminiImageEvent,
    GeminiService,
    GeminiTextEvent,
    GeminiUsageEvent,
    GeminiUsageMetadata,
    get_gemini_service,
)
from app.services.storage import S3StorageService, get_storage_service
from app.services.usage import (
    UsageCostBreakdown,
    build_usage_snapshot,
    calculate_usage_cost,
    get_ledger_usage_total,
    hash_api_key,
)


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
    api_key_hash = hash_api_key(user.api_key)
    chat = _get_or_create_chat(db_session=db_session, user_uuid=payload.uuid, chat_id=payload.chat_id)
    request_id = uuid4()

    user_message = _create_user_message(
        db_session=db_session,
        storage_service=storage_service,
        settings=settings,
        uploads=uploads,
        user_api_key=user.api_key,
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
        usage_metadata = GeminiUsageMetadata()

        try:
            for event in gemini_service.stream_generate_content(
                api_key=user.api_key,
                model=model_name,
                payload=response_payload,
            ):
                if isinstance(event, GeminiUsageEvent):
                    usage_metadata = event.metadata
                    continue
                if isinstance(event, GeminiTextEvent):
                    assistant_text_chunks.append(event.text)
                    yield _sse_event("text_delta", {"text": event.text})
                    continue

                image_message_id = uuid4()
                image_key = _build_output_s3_key(
                    settings=settings,
                    user_api_key=user.api_key,
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
                yield _sse_event("image", {
                    "s3_key": image_key,
                    "data": base64.b64encode(event.data).decode(),
                    "mime_type": event.mime_type,
                })

            _create_assistant_messages(
                db_session=db_session,
                chat=chat,
                user_uuid=payload.uuid,
                text_content="".join(assistant_text_chunks).strip() or None,
                generated_images=assistant_images,
            )
            cost_breakdown = calculate_usage_cost(
                request_type=payload.type.value,
                prompt_tokens=usage_metadata.prompt_token_count,
                candidate_tokens=usage_metadata.candidates_token_count,
                generated_image_count=len(assistant_images),
                image_size=payload.image_size.value,
            )
            _create_usage_ledger(
                db_session=db_session,
                request_id=request_id,
                chat_id=chat.chat_id,
                user_uuid=payload.uuid,
                api_key_hash=api_key_hash,
                model=model_name,
                request_type=payload.type.value,
                status="success",
                image_size=payload.image_size if payload.type is ChatCompletionType.IMAGE else None,
                cost_breakdown=cost_breakdown,
            )
            db_session.flush()
            usage_snapshot = build_usage_snapshot(
                used_usd=get_ledger_usage_total(db_session=db_session, api_key_hash=api_key_hash),
                usage_limit_usd=Decimal(str(settings.usage_limit_usd)),
            )
            db_session.commit()
            yield _sse_event(
                "done",
                {
                    "chat_id": str(chat.chat_id),
                    "cost_usd": str(cost_breakdown.total_cost_usd),
                    "used_usd": str(usage_snapshot.used_usd),
                    "remaining_usd": str(usage_snapshot.remaining_usd),
                    "limit_usd": str(usage_snapshot.limit_usd),
                    "quota_exceeded": usage_snapshot.quota_exceeded,
                },
            )
        except Exception as exc:
            db_session.rollback()
            _create_usage_ledger(
                db_session=db_session,
                request_id=request_id,
                chat_id=chat.chat_id,
                user_uuid=payload.uuid,
                api_key_hash=api_key_hash,
                model=model_name,
                request_type=payload.type.value,
                status="failed",
                image_size=payload.image_size if payload.type is ChatCompletionType.IMAGE else None,
                cost_breakdown=UsageCostBreakdown(
                    prompt_tokens=usage_metadata.prompt_token_count,
                    candidate_tokens=usage_metadata.candidates_token_count,
                    generated_image_count=len(assistant_images),
                    input_cost_usd=_zero_cost(),
                    output_cost_usd=_zero_cost(),
                    image_cost_usd=_zero_cost(),
                    total_cost_usd=_zero_cost(),
                ),
            )
            db_session.commit()
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


@router.get("/images/generated", response_model=GeneratedImagePageResponse)
def list_generated_images(
    request: Request,
    uuid: UUID = Query(...),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db_session: Session = Depends(get_db_session),
) -> GeneratedImagePageResponse:
    authenticate_user_request(request=request, requested_uuid=uuid, db_session=db_session)

    filters = (
        Message.user_uuid == uuid,
        Message.role == MessageRole.ASSISTANT.value,
        Message.type == MessageType.IMAGE.value,
        Message.image_s3_key.is_not(None),
    )
    total = db_session.scalar(select(func.count()).select_from(Message).where(*filters)) or 0
    offset = (page - 1) * page_size
    messages = db_session.scalars(
        select(Message)
        .where(*filters)
        .order_by(Message.created_at.desc(), Message.message_id.desc())
        .offset(offset)
        .limit(page_size)
    ).all()

    return GeneratedImagePageResponse(
        items=[
            GeneratedImageResponse(
                message_id=message.message_id,
                chat_id=message.chat_id,
                image_s3_key=message.image_s3_key or "",
                created_at=message.created_at,
            )
            for message in messages
        ],
        page=page,
        page_size=page_size,
        total=total,
        has_next=offset + len(messages) < total,
    )


@router.get("/images/{s3_key:path}")
def get_image(
    s3_key: str,
    request: Request,
    db_session: Session = Depends(get_db_session),
    storage_service: S3StorageService = Depends(get_storage_service),
) -> Response:
    authenticate_session_from_cookies(request=request, db_session=db_session)
    try:
        data, content_type = storage_service.download_object(s3_key)
    except Exception:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="image not found")
    return Response(content=data, media_type=content_type or "image/png")


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
    user_api_key: str,
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
            user_api_key=user_api_key,
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
    db_session.flush()

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
        message = Message(
            message_id=message_id,
            chat_id=chat.chat_id,
            user_uuid=user_uuid,
            role=MessageRole.ASSISTANT.value,
            type=MessageType.CHAT.value,
            text_content=text_content,
            created_at=created_at,
        )
        db_session.add(message)
        db_session.flush()
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
        message = Message(
            message_id=generated_image.message_id,
            chat_id=chat.chat_id,
            user_uuid=user_uuid,
            role=MessageRole.ASSISTANT.value,
            type=MessageType.IMAGE.value,
            image_s3_key=generated_image.s3_key,
            created_at=created_at,
        )
        db_session.add(message)
        db_session.flush()
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


def _create_usage_ledger(
    *,
    db_session: Session,
    request_id: UUID,
    chat_id: UUID,
    user_uuid: UUID,
    api_key_hash: str,
    model: str,
    request_type: str,
    status: str,
    image_size: ChatImageSize | None,
    cost_breakdown: UsageCostBreakdown,
) -> None:
    db_session.add(
        UsageLedger(
            request_id=request_id,
            chat_id=chat_id,
            user_uuid=user_uuid,
            api_key_hash=api_key_hash,
            model=model,
            request_type=request_type,
            status=status,
            image_size=image_size.value if image_size else None,
            prompt_tokens=cost_breakdown.prompt_tokens,
            candidate_tokens=cost_breakdown.candidate_tokens,
            generated_image_count=cost_breakdown.generated_image_count,
            input_cost_usd=cost_breakdown.input_cost_usd,
            output_cost_usd=cost_breakdown.output_cost_usd,
            image_cost_usd=cost_breakdown.image_cost_usd,
            total_cost_usd=cost_breakdown.total_cost_usd,
        )
    )


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


def _safe_s3_segment(value: str | None, fallback: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", value or "")
    return sanitized or fallback


def _join_s3_key(*parts: str) -> str:
    return "/".join(part.strip("/") for part in parts if part and part.strip("/"))


def _build_input_s3_key(
    *,
    settings: Settings,
    user_api_key: str,
    chat_id: UUID,
    message_id: UUID,
    index: int,
    filename: str | None,
) -> str:
    safe_name = _safe_filename(filename, f"upload-{index}")
    safe_api_key = _safe_s3_segment(user_api_key, "anonymous")
    return _join_s3_key(
        settings.s3_prefix,
        safe_api_key,
        "chats",
        str(chat_id),
        "input",
        str(message_id),
        safe_name,
    )


def _build_output_s3_key(
    *,
    settings: Settings,
    user_api_key: str,
    chat_id: UUID,
    message_id: UUID,
    index: int,
    mime_type: str,
) -> str:
    extension = _extension_from_mime_type(mime_type)
    safe_api_key = _safe_s3_segment(user_api_key, "anonymous")
    return _join_s3_key(
        settings.s3_prefix,
        safe_api_key,
        "chats",
        str(chat_id),
        "output",
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


def _zero_cost():
    from decimal import Decimal

    return Decimal("0")
