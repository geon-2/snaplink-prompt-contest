from __future__ import annotations

from uuid import uuid4


def test_usage_and_chat_endpoints_accept_non_ascii_api_key(client) -> None:
    user_uuid = str(uuid4())
    api_key = "gemini-한글-🔑"

    signup_response = client.post("/signup", json={"uuid": user_uuid, "api_key": api_key})
    assert signup_response.status_code == 201

    usage_response = client.get("/usage/me")
    assert usage_response.status_code == 200

    chats_response = client.get("/chats", params={"uuid": user_uuid})
    assert chats_response.status_code == 200
