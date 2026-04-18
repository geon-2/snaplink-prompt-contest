from __future__ import annotations

from secrets import compare_digest
from uuid import UUID

from fastapi import HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.models.user import User


USER_UUID_COOKIE_NAME = "user_uuid"
USER_API_KEY_COOKIE_NAME = "user_api_key"


def set_user_session_cookies(
    response: Response,
    *,
    user_uuid: UUID,
    api_key: str,
    settings: Settings,
) -> None:
    cookie_options = {
        "max_age": settings.cookie_max_age,
        "secure": settings.cookie_secure,
        "httponly": False,
        "samesite": "lax",
        "path": "/",
    }
    response.set_cookie(USER_UUID_COOKIE_NAME, str(user_uuid), **cookie_options)
    response.set_cookie(USER_API_KEY_COOKIE_NAME, api_key, **cookie_options)


def authenticate_user_request(
    *,
    request: Request,
    requested_uuid: UUID,
    db_session: Session,
) -> User:
    uuid_cookie = request.cookies.get(USER_UUID_COOKIE_NAME)
    api_key_cookie = request.cookies.get(USER_API_KEY_COOKIE_NAME)

    if uuid_cookie != str(requested_uuid) or not api_key_cookie:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid session")

    user = db_session.scalar(select(User).where(User.uuid == requested_uuid))
    if user is None or not compare_digest(user.api_key, api_key_cookie):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid session")

    return user
