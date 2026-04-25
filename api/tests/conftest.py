from __future__ import annotations

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("COOKIE_SECURE", "false")
os.environ.setdefault("COOKIE_MAX_AGE", "604800")
os.environ.setdefault("CORS_ORIGINS", '["http://localhost:3000"]')
os.environ.setdefault("GEMINI_BASE_URL", "https://example.invalid")
os.environ.setdefault("GEMINI_MODEL", "gemini-test-chat")
os.environ.setdefault("GEMINI_IMAGE_MODEL", "gemini-test-image")
os.environ.setdefault("AWS_REGION", "ap-northeast-2")
os.environ.setdefault("S3_BUCKET", "test-bucket")
os.environ.setdefault("S3_PREFIX", "tests")
os.environ.setdefault("TEMP_UPLOAD_DIR", ".tmp/tests")
os.environ.setdefault("USAGE_LIMIT_KRW", "100000")

from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.services.gemini import (
    GeminiImageEvent,
    GeminiTextEvent,
    GeminiUploadedFile,
    GeminiUsageEvent,
    GeminiUsageMetadata,
    GeminiUsageTokenDetail,
    get_gemini_service,
)
from app.services.storage import get_storage_service


class FakeStorageService:
    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str | None]] = {}

    def upload_file(self, file_path: Path, key: str, content_type: str) -> str:
        self.objects[key] = (file_path.read_bytes(), content_type)
        return key

    def upload_bytes(self, data: bytes, key: str, content_type: str) -> str:
        self.objects[key] = (data, content_type)
        return key

    def download_object(self, key: str) -> tuple[bytes, str | None]:
        return self.objects[key]

    def generate_presigned_url(self, key: str, expires_in: int = 3600) -> str:
        return f"https://example.test/{key}?expires_in={expires_in}"


class FakeGeminiService:
    def __init__(self) -> None:
        self.model = "gemini-test-chat"
        self.image_model = "gemini-test-image"
        self.last_payload: dict[str, object] | None = None
        self.next_events: list[GeminiTextEvent | GeminiImageEvent | GeminiUsageEvent] = [
            GeminiTextEvent(text="hello from gemini"),
            GeminiUsageEvent(metadata=GeminiUsageMetadata(prompt_token_count=100, candidates_token_count=50)),
        ]

    def upload_file(
        self,
        *,
        api_key: str,
        file_path: Path,
        mime_type: str,
        display_name: str,
    ) -> GeminiUploadedFile:
        return GeminiUploadedFile(uri=f"gemini://{display_name}", mime_type=mime_type)

    def stream_generate_content(
        self,
        *,
        api_key: str,
        model: str,
        payload: dict[str, object],
    ) -> Iterator[GeminiTextEvent | GeminiImageEvent | GeminiUsageEvent]:
        self.last_payload = payload
        yield from self.next_events

    def generate_content(
        self,
        *,
        api_key: str,
        model: str,
        payload: dict[str, object],
    ) -> list[GeminiTextEvent | GeminiImageEvent | GeminiUsageEvent]:
        self.last_payload = payload
        return list(self.next_events)


@pytest.fixture()
def session_factory() -> Iterator[sessionmaker[Session]]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session_factory = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
        expire_on_commit=False,
    )
    Base.metadata.create_all(bind=engine)

    try:
        yield testing_session_factory
    finally:
        Base.metadata.drop_all(bind=engine)
        engine.dispose()


@pytest.fixture()
def fake_storage_service() -> FakeStorageService:
    return FakeStorageService()


@pytest.fixture()
def fake_gemini_service() -> FakeGeminiService:
    return FakeGeminiService()


@pytest.fixture()
def client(
    session_factory: sessionmaker[Session],
    fake_storage_service: FakeStorageService,
    fake_gemini_service: FakeGeminiService,
) -> Iterator[TestClient]:
    def override_get_db_session() -> Iterator[Session]:
        with session_factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db_session
    app.dependency_overrides[get_storage_service] = lambda: fake_storage_service
    app.dependency_overrides[get_gemini_service] = lambda: fake_gemini_service

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()
