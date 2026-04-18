from __future__ import annotations

from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.models.chat import Chat
from app.models.history import History
from app.models.message import Message
from app.models.user import User
from app.services.gemini import GeminiImageEvent, GeminiTextEvent


def test_signup_creates_user_and_sets_plain_cookies(
    client,
    session_factory: sessionmaker[Session],
) -> None:
    user_uuid = uuid4()
    response = client.post(
        "/signup",
        json={"uuid": str(user_uuid), "api_key": "test-api-key"},
    )

    assert response.status_code == 201
    assert response.json() == {"uuid": str(user_uuid), "message": "signup completed"}
    assert response.cookies["user_uuid"] == str(user_uuid)
    assert response.cookies["user_api_key"] == "test-api-key"

    set_cookie = response.headers["set-cookie"]
    assert "HttpOnly" not in set_cookie
    assert "SameSite=lax" in set_cookie
    assert "Path=/" in set_cookie
    assert "Max-Age=604800" in set_cookie

    with session_factory() as session:
        saved_user = session.scalar(select(User).where(User.uuid == user_uuid))
        assert saved_user is not None
        assert saved_user.api_key == "test-api-key"


def test_chat_completion_streams_text_and_persists_history(
    client,
    session_factory: sessionmaker[Session],
    fake_gemini_service,
) -> None:
    user_uuid = str(uuid4())
    signup_response = client.post("/signup", json={"uuid": user_uuid, "api_key": "user-api-key"})
    assert signup_response.status_code == 201

    fake_gemini_service.next_events = [GeminiTextEvent(text="hello "), GeminiTextEvent(text="world")]

    response = client.post(
        "/chat/completion",
        data={"uuid": user_uuid, "type": "chat", "text": "say hello"},
    )

    assert response.status_code == 200
    assert "event: meta" in response.text
    assert "event: text_delta" in response.text
    assert "hello " in response.text
    assert "world" in response.text
    assert "event: done" in response.text

    with session_factory() as session:
        chats = session.scalars(select(Chat)).all()
        messages = session.scalars(select(Message).order_by(Message.created_at.asc())).all()
        history_rows = session.scalars(select(History).order_by(History.created_at.asc(), History.id.asc())).all()

        assert len(chats) == 1
        assert len(messages) == 2
        assert messages[0].role == "user"
        assert messages[0].type == "chat"
        assert messages[0].text_content == "say hello"
        assert messages[1].role == "assistant"
        assert messages[1].type == "chat"
        assert messages[1].text_content == "hello world"
        assert len(history_rows) == 2
        assert history_rows[0].part_type == "text"
        assert history_rows[1].part_type == "text"

    assert fake_gemini_service.last_payload is not None
    payload_text = fake_gemini_service.last_payload["contents"][0]["parts"][0]["text"]
    assert payload_text == "say hello"


def test_image_completion_uploads_to_storage_and_returns_s3_keys(
    client,
    session_factory: sessionmaker[Session],
    fake_gemini_service,
    fake_storage_service,
) -> None:
    user_uuid = str(uuid4())
    signup_response = client.post("/signup", json={"uuid": user_uuid, "api_key": "user-api-key"})
    assert signup_response.status_code == 201

    fake_gemini_service.next_events = [GeminiImageEvent(data=b"generated-image", mime_type="image/png")]

    response = client.post(
        "/chat/completion",
        data={"uuid": user_uuid, "type": "image", "text": "make an image"},
        files={"files": ("input.png", b"input-image", "image/png")},
    )

    assert response.status_code == 200
    assert "event: image" in response.text

    with session_factory() as session:
        chat = session.scalar(select(Chat))
        assert chat is not None

        messages = session.scalars(select(Message).order_by(Message.created_at.asc())).all()
        assert len(messages) == 2
        assert messages[0].role == "user"
        assert messages[0].image_s3_key is not None
        assert messages[1].role == "assistant"
        assert messages[1].type == "image"
        assert messages[1].image_s3_key is not None

        detail_response = client.get(f"/chats/{chat.chat_id}", params={"uuid": user_uuid})
        assert detail_response.status_code == 200
        detail_payload = detail_response.json()
        assert detail_payload["messages"][1]["image_s3_key"] == messages[1].image_s3_key

        list_response = client.get("/chats", params={"uuid": user_uuid})
        assert list_response.status_code == 200
        list_payload = list_response.json()
        assert len(list_payload) == 1
        assert list_payload[0]["last_message_type"] == "image"

    stored_keys = set(fake_storage_service.objects.keys())
    assert any("/inputs/" in key for key in stored_keys)
    assert any("/outputs/" in key for key in stored_keys)
    assert fake_gemini_service.last_payload is not None
    parts = fake_gemini_service.last_payload["contents"][0]["parts"]
    assert any("fileData" in part for part in parts)
