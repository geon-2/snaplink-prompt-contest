from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import set_user_session_cookies
from app.core.config import get_settings
from app.db.session import get_db_session
from app.models.user import User
from app.schemas.user import SignupRequest, SignupResponse


router = APIRouter(tags=["signup"])


@router.post("/signup", response_model=SignupResponse, status_code=status.HTTP_201_CREATED)
def signup(
    payload: SignupRequest,
    response: Response,
    db_session: Session = Depends(get_db_session),
) -> SignupResponse:
    settings = get_settings()
    user = User(uuid=payload.uuid, api_key=payload.api_key)

    db_session.add(user)

    try:
        db_session.commit()
    except IntegrityError as exc:
        db_session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="user already exists",
        ) from exc

    set_user_session_cookies(
        response,
        user_uuid=payload.uuid,
        api_key=payload.api_key,
        settings=settings,
    )

    return SignupResponse(uuid=payload.uuid, message="signup completed")
