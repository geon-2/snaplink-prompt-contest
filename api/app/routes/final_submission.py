from __future__ import annotations

import mimetypes
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.auth import validate_admin_key
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.models.final_prompt_submission import FinalPromptSubmission
from app.services.gemini import GeminiImageEvent, GeminiService, get_gemini_service
from app.services.storage import S3StorageService, get_storage_service
from app.services.usage import hash_api_key


router = APIRouter(tags=["final-submission"])

FINAL_STATUS_SUBMITTED = "submitted"
FINAL_STATUS_GENERATING = "generating"
FINAL_STATUS_COMPLETED = "completed"
FINAL_STATUS_FAILED = "failed"
FINAL_IMAGE_COUNT = 2


class FinalPromptSubmissionRequest(BaseModel):
    api_key: str = Field(..., min_length=1)
    prompt: str = Field(..., min_length=1)


class FinalPromptSubmissionAccepted(BaseModel):
    submission_id: int
    api_key_hash: str
    api_key_preview: str
    status: str


class AdminFinalGenerateRequest(BaseModel):
    api_key: str = Field(..., min_length=1)


class AdminFinalSubmissionResponse(BaseModel):
    submission_id: int
    api_key_hash: str
    api_key_preview: str
    prompt: str
    status: str
    image_s3_keys: list[str]
    image_urls: list[str]
    error_detail: str | None
    created_at: datetime
    updated_at: datetime
    generated_at: datetime | None


@router.post(
    "/final-submissions",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=FinalPromptSubmissionAccepted,
)
def submit_final_prompt(
    payload: FinalPromptSubmissionRequest,
    db_session: Session = Depends(get_db_session),
) -> FinalPromptSubmissionAccepted:
    api_key = _normalize_required(payload.api_key, "api_key")
    prompt = _normalize_required(payload.prompt, "prompt")
    api_key_hash = hash_api_key(api_key)

    existing_id = db_session.scalar(
        select(FinalPromptSubmission.id).where(FinalPromptSubmission.api_key_hash == api_key_hash)
    )
    if existing_id is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="api key already submitted")

    submission = FinalPromptSubmission(
        api_key_hash=api_key_hash,
        api_key_preview=_api_key_preview(api_key),
        prompt=prompt,
        status=FINAL_STATUS_SUBMITTED,
    )
    db_session.add(submission)
    db_session.commit()
    db_session.refresh(submission)
    return FinalPromptSubmissionAccepted(
        submission_id=submission.id,
        api_key_hash=submission.api_key_hash,
        api_key_preview=submission.api_key_preview,
        status=submission.status,
    )


@router.get("/admin/final-submissions", response_model=list[AdminFinalSubmissionResponse])
def list_final_submissions_for_admin(
    request: Request,
    db_session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    storage_service: S3StorageService = Depends(get_storage_service),
) -> list[AdminFinalSubmissionResponse]:
    validate_admin_key(request, settings)

    submissions = db_session.scalars(
        select(FinalPromptSubmission).order_by(
            FinalPromptSubmission.created_at.desc(),
            FinalPromptSubmission.id.desc(),
        )
    ).all()
    return [_admin_final_submission_response(row, storage_service) for row in submissions]


@router.post(
    "/admin/final-submissions/generate",
    status_code=status.HTTP_202_ACCEPTED,
    response_model=AdminFinalSubmissionResponse,
)
def generate_final_submission_images(
    request: Request,
    payload: AdminFinalGenerateRequest,
    background_tasks: BackgroundTasks,
    db_session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    gemini_service: GeminiService = Depends(get_gemini_service),
    storage_service: S3StorageService = Depends(get_storage_service),
) -> AdminFinalSubmissionResponse:
    validate_admin_key(request, settings)
    api_key = _normalize_required(payload.api_key, "api_key")
    submission = db_session.scalar(
        select(FinalPromptSubmission).where(FinalPromptSubmission.api_key_hash == hash_api_key(api_key))
    )
    if submission is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="final submission not found")
    if submission.status == FINAL_STATUS_GENERATING:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="image generation already in progress")

    submission.status = FINAL_STATUS_GENERATING
    submission.image_1_s3_key = None
    submission.image_2_s3_key = None
    submission.error_detail = None
    submission.generated_at = None
    db_session.add(submission)
    db_session.commit()
    db_session.refresh(submission)

    response = _admin_final_submission_response(submission, storage_service)
    engine = db_session.get_bind()
    db_session.close()
    worker_session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    background_tasks.add_task(
        _generate_images_for_submission,
        worker_session_factory,
        submission.id,
        api_key,
        settings,
        gemini_service,
        storage_service,
    )
    return response


def _generate_images_for_submission(
    worker_session_factory: sessionmaker[Session],
    submission_id: int,
    api_key: str,
    settings: Settings,
    gemini_service: GeminiService,
    storage_service: S3StorageService,
) -> None:
    with worker_session_factory() as session:
        submission = session.get(FinalPromptSubmission, submission_id)
        if submission is None:
            return

        try:
            run_id = uuid4().hex
            image_keys: list[str] = []
            for index in range(1, FINAL_IMAGE_COUNT + 1):
                image_event = _generate_single_image(
                    api_key=api_key,
                    prompt=submission.prompt,
                    gemini_service=gemini_service,
                )
                image_key = _build_final_submission_image_s3_key(
                    settings=settings,
                    api_key_hash=submission.api_key_hash,
                    run_id=run_id,
                    index=index,
                    mime_type=image_event.mime_type,
                )
                storage_service.upload_bytes(image_event.data, image_key, image_event.mime_type)
                image_keys.append(image_key)

            submission.image_1_s3_key = image_keys[0]
            submission.image_2_s3_key = image_keys[1]
            submission.status = FINAL_STATUS_COMPLETED
            submission.error_detail = None
            submission.generated_at = datetime.now(timezone.utc)
        except Exception as exc:
            submission.status = FINAL_STATUS_FAILED
            submission.error_detail = str(exc)
        finally:
            session.add(submission)
            session.commit()


def _generate_single_image(
    *,
    api_key: str,
    prompt: str,
    gemini_service: GeminiService,
) -> GeminiImageEvent:
    events = gemini_service.generate_content(
        api_key=api_key,
        model=gemini_service.image_model,
        payload={
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"responseModalities": ["TEXT", "IMAGE"]},
        },
    )
    for event in events:
        if isinstance(event, GeminiImageEvent):
            return event
    raise RuntimeError("Gemini did not return an image")


def _admin_final_submission_response(
    submission: FinalPromptSubmission,
    storage_service: S3StorageService,
) -> AdminFinalSubmissionResponse:
    image_s3_keys = [key for key in (submission.image_1_s3_key, submission.image_2_s3_key) if key]
    return AdminFinalSubmissionResponse(
        submission_id=submission.id,
        api_key_hash=submission.api_key_hash,
        api_key_preview=submission.api_key_preview,
        prompt=submission.prompt,
        status=submission.status,
        image_s3_keys=image_s3_keys,
        image_urls=[storage_service.generate_presigned_url(key) for key in image_s3_keys],
        error_detail=submission.error_detail,
        created_at=submission.created_at,
        updated_at=submission.updated_at,
        generated_at=submission.generated_at,
    )


def _build_final_submission_image_s3_key(
    *,
    settings: Settings,
    api_key_hash: str,
    run_id: str,
    index: int,
    mime_type: str,
) -> str:
    prefix = settings.s3_prefix.strip("/")
    key = "/".join(
        [
            "final-submissions",
            api_key_hash,
            run_id,
            f"image-{index}{_extension_from_mime_type(mime_type)}",
        ]
    )
    return f"{prefix}/{key}" if prefix else key


def _api_key_preview(api_key: str) -> str:
    if len(api_key) <= 10:
        return "*" * len(api_key)
    return f"{api_key[:6]}...{api_key[-4:]}"


def _normalize_required(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} is required",
        )
    return normalized


def _extension_from_mime_type(mime_type: str) -> str:
    return mimetypes.guess_extension(mime_type) or ".bin"
