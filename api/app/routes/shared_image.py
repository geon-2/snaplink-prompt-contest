from __future__ import annotations

import mimetypes

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import authenticate_session_from_cookies, validate_admin_key
from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.services.storage import S3StorageService, get_storage_service


router = APIRouter(tags=["shared-image"])

SHARED_IMAGE_DOWNLOAD_PATH = "/shared-image"
SHARED_IMAGE_FILENAME_BASE = "admin-shared-image"


class SharedImageUploadResponse(BaseModel):
    image_s3_key: str
    content_type: str
    download_path: str


@router.post("/admin/shared-image", response_model=SharedImageUploadResponse)
def upload_shared_image(
    request: Request,
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    storage_service: S3StorageService = Depends(get_storage_service),
) -> SharedImageUploadResponse:
    validate_admin_key(request, settings)

    content_type = _resolve_image_content_type(file)
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="image file is empty")

    image_s3_key = _shared_image_s3_key(settings)
    storage_service.upload_bytes(data, image_s3_key, content_type)
    return SharedImageUploadResponse(
        image_s3_key=image_s3_key,
        content_type=content_type,
        download_path=SHARED_IMAGE_DOWNLOAD_PATH,
    )


@router.get(SHARED_IMAGE_DOWNLOAD_PATH)
def download_shared_image(
    request: Request,
    db_session: Session = Depends(get_db_session),
    settings: Settings = Depends(get_settings),
    storage_service: S3StorageService = Depends(get_storage_service),
) -> Response:
    authenticate_session_from_cookies(request=request, db_session=db_session)

    try:
        data, content_type = storage_service.download_object(_shared_image_s3_key(settings))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="shared image not found") from exc

    resolved_content_type = content_type or "application/octet-stream"
    filename = f"{SHARED_IMAGE_FILENAME_BASE}{_extension_from_mime_type(resolved_content_type)}"
    return Response(
        content=data,
        media_type=resolved_content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Content-Type-Options": "nosniff",
        },
    )


def _shared_image_s3_key(settings: Settings) -> str:
    prefix = settings.s3_prefix.strip("/")
    key = "admin/shared-image/latest"
    return f"{prefix}/{key}" if prefix else key


def _resolve_image_content_type(file: UploadFile) -> str:
    guessed_content_type = mimetypes.guess_type(file.filename or "")[0]
    content_type = file.content_type
    if not content_type or content_type == "application/octet-stream":
        content_type = guessed_content_type
    content_type = content_type or "application/octet-stream"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="file must be an image")
    return content_type


def _extension_from_mime_type(mime_type: str) -> str:
    return mimetypes.guess_extension(mime_type) or ".bin"
