from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.auth import set_user_session_cookies
from app.core.config import get_settings
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.user import SignupRequest, SignupResponse


router = APIRouter(tags=["signup"])


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_200_OK)
def signup(
    payload: SignupRequest,
    response: Response,
    db_session: Session = Depends(get_db_session),
) -> SignupResponse:
    settings = get_settings()

    existing = db_session.scalar(select(User).where(User.uuid == payload.uuid))
    if existing:
        existing.api_key = payload.api_key
    else:
        db_session.add(User(uuid=payload.uuid, api_key=payload.api_key))

    db_session.commit()

    set_user_session_cookies(
        response,
        user_uuid=payload.uuid,
        api_key=payload.api_key,
        settings=settings,
    )

    return SignupResponse(uuid=payload.uuid, message="signup completed")
