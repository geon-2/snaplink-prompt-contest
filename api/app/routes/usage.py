from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.auth import authenticate_session_from_cookies
from app.core.config import get_settings
from app.db.session import get_db_session
from app.schemas.usage import UsageQuotaResponse
from app.services.usage import get_usage_snapshot, hash_api_key


router = APIRouter(tags=["usage"])


@router.get("/usage/me", response_model=UsageQuotaResponse)
def get_my_usage(
    request: Request,
    db_session: Session = Depends(get_db_session),
) -> UsageQuotaResponse:
    settings = get_settings()
    user = authenticate_session_from_cookies(request=request, db_session=db_session)
    snapshot = get_usage_snapshot(
        db_session=db_session,
        api_key_hash=hash_api_key(user.api_key),
        usage_limit_usd=Decimal(str(settings.usage_limit_usd)),
    )
    return UsageQuotaResponse(
        used_usd=snapshot.used_usd,
        remaining_usd=snapshot.remaining_usd,
        limit_usd=snapshot.limit_usd,
        quota_exceeded=snapshot.quota_exceeded,
    )
