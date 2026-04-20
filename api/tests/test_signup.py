from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.models.chat import Chat
from app.models.history import History
from app.models.message import Message
from app.models.user import User
from app.models.usage_ledger import UsageLedger
from app.services.gemini import GeminiImageEvent, GeminiTextEvent, GeminiUsageEvent, GeminiUsageMetadata


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

    fake_gemini_service.next_events = [
        GeminiTextEvent(text="hello "),
        GeminiTextEvent(text="world"),
        GeminiUsageEvent(metadata=GeminiUsageMetadata(prompt_token_count=1_000, candidates_token_count=2_000)),
    ]

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
    assert '"cost_usd": "0.026000"' in response.text

    with session_factory() as session:
        chats = session.scalars(select(Chat)).all()
        messages = session.scalars(select(Message).order_by(Message.created_at.asc())).all()
        history_rows = session.scalars(select(History).order_by(History.created_at.asc(), History.id.asc())).all()
        ledger_rows = session.scalars(select(UsageLedger)).all()

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
        assert len(ledger_rows) == 1
        assert ledger_rows[0].request_type == "chat"
        assert ledger_rows[0].status == "success"
        assert ledger_rows[0].prompt_tokens == 1_000
        assert ledger_rows[0].candidate_tokens == 2_000
        assert ledger_rows[0].total_cost_usd == Decimal("0.026000")

    assert fake_gemini_service.last_payload is not None
    payload_text = fake_gemini_service.last_payload["contents"][0]["parts"][0]["text"]
    assert payload_text == "say hello"

    usage_response = client.get("/usage/me")
    assert usage_response.status_code == 200
    assert usage_response.json() == {
        "used_usd": "0.026000",
        "remaining_usd": "9.974000",
        "limit_usd": "10.000000",
        "quota_exceeded": False,
    }


def test_image_completion_uploads_to_storage_and_returns_s3_keys(
    client,
    session_factory: sessionmaker[Session],
    fake_gemini_service,
    fake_storage_service,
) -> None:
    user_uuid = str(uuid4())
    signup_response = client.post("/signup", json={"uuid": user_uuid, "api_key": "user-api-key"})
    assert signup_response.status_code == 201

    fake_gemini_service.next_events = [
        GeminiImageEvent(data=b"generated-image", mime_type="image/png"),
        GeminiUsageEvent(metadata=GeminiUsageMetadata(prompt_token_count=100, candidates_token_count=50)),
    ]

    response = client.post(
        "/chat/completion",
        data={"uuid": user_uuid, "type": "image", "text": "make an image", "image_size": "1k"},
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

        ledger = session.scalar(select(UsageLedger))
        assert ledger is not None
        assert ledger.request_type == "image"
        assert ledger.generated_image_count == 1
        assert ledger.image_size == "1k"
        assert ledger.total_cost_usd == Decimal("0.067200")

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


def test_generated_images_api_returns_paginated_user_gallery(
    client,
    session_factory: sessionmaker[Session],
    fake_gemini_service,
) -> None:
    first_user_uuid = uuid4()
    second_user_uuid = uuid4()

    first_signup = client.post("/signup", json={"uuid": str(first_user_uuid), "api_key": "first-api-key"})
    second_signup = client.post("/signup", json={"uuid": str(second_user_uuid), "api_key": "second-api-key"})
    assert first_signup.status_code == 201
    assert second_signup.status_code == 201

    first_user_cookies = {
        "user_uuid": str(first_user_uuid),
        "user_api_key": "first-api-key",
    }
    second_user_cookies = {
        "user_uuid": str(second_user_uuid),
        "user_api_key": "second-api-key",
    }

    for prompt in ("first image", "second image", "third image"):
        fake_gemini_service.next_events = [
            GeminiImageEvent(data=prompt.encode("utf-8"), mime_type="image/png"),
            GeminiUsageEvent(metadata=GeminiUsageMetadata(prompt_token_count=100, candidates_token_count=50)),
        ]
        response = client.post(
            "/chat/completion",
            data={"uuid": str(first_user_uuid), "type": "image", "text": prompt, "image_size": "1k"},
            cookies=first_user_cookies,
        )
        assert response.status_code == 200

    fake_gemini_service.next_events = [
        GeminiImageEvent(data=b"other-user-image", mime_type="image/png"),
        GeminiUsageEvent(metadata=GeminiUsageMetadata(prompt_token_count=100, candidates_token_count=50)),
    ]
    other_response = client.post(
        "/chat/completion",
        data={"uuid": str(second_user_uuid), "type": "image", "text": "other image", "image_size": "1k"},
        cookies=second_user_cookies,
    )
    assert other_response.status_code == 200

    with session_factory() as session:
        saved_messages = session.scalars(
            select(Message).where(
                Message.user_uuid == first_user_uuid,
                Message.role == "assistant",
                Message.type == "image",
            )
        ).all()

    expected_keys = {message.image_s3_key for message in saved_messages}
    assert len(expected_keys) == 3

    first_page = client.get(
        "/images/generated",
        params={"uuid": str(first_user_uuid), "page": 1, "page_size": 2},
        cookies=first_user_cookies,
    )
    assert first_page.status_code == 200
    first_page_payload = first_page.json()
    assert first_page_payload["page"] == 1
    assert first_page_payload["page_size"] == 2
    assert first_page_payload["total"] == 3
    assert first_page_payload["has_next"] is True
    assert len(first_page_payload["items"]) == 2

    second_page = client.get(
        "/images/generated",
        params={"uuid": str(first_user_uuid), "page": 2, "page_size": 2},
        cookies=first_user_cookies,
    )
    assert second_page.status_code == 200
    second_page_payload = second_page.json()
    assert second_page_payload["page"] == 2
    assert second_page_payload["page_size"] == 2
    assert second_page_payload["total"] == 3
    assert second_page_payload["has_next"] is False
    assert len(second_page_payload["items"]) == 1

    returned_keys = {
        item["image_s3_key"]
        for item in first_page_payload["items"] + second_page_payload["items"]
    }
    assert returned_keys == expected_keys

    other_user_page = client.get(
        "/images/generated",
        params={"uuid": str(second_user_uuid), "page": 1, "page_size": 10},
        cookies=second_user_cookies,
    )
    assert other_user_page.status_code == 200
    other_user_payload = other_user_page.json()
    assert other_user_payload["total"] == 1
    assert len(other_user_payload["items"]) == 1
    assert other_user_payload["items"][0]["image_s3_key"] not in expected_keys


def test_chat_completion_continues_even_when_usage_exceeds_limit(
    client,
    fake_gemini_service,
) -> None:
    user_uuid = str(uuid4())
    signup_response = client.post("/signup", json={"uuid": user_uuid, "api_key": "user-api-key"})
    assert signup_response.status_code == 201

    fake_gemini_service.next_events = [
        GeminiTextEvent(text="still allowed"),
        GeminiUsageEvent(metadata=GeminiUsageMetadata(prompt_token_count=1_000, candidates_token_count=1_000_000)),
    ]

    response = client.post(
        "/chat/completion",
        data={"uuid": user_uuid, "type": "chat", "text": "large request"},
    )

    assert response.status_code == 200
    assert '"quota_exceeded": true' in response.text

    usage_response = client.get("/usage/me")
    assert usage_response.status_code == 200
    assert usage_response.json() == {
        "used_usd": "12.002000",
        "remaining_usd": "0.000000",
        "limit_usd": "10.000000",
        "quota_exceeded": True,
    }
