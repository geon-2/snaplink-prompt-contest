from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/snaplink"
    cookie_secure: bool = False
    cookie_max_age: int = 604800
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    gemini_base_url: str = "https://generativelanguage.googleapis.com"
    gemini_model: str = "gemini-3.1-pro-preview"
    gemini_image_model: str = "gemini-3.1-flash-image-preview"
    aws_region: str = "ap-northeast-2"
    s3_bucket: str = "snaplink"
    s3_prefix: str = "snaplink"
    temp_upload_dir: Path = Path(".tmp/uploads")
    usage_limit_usd: float = 10.0

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: object) -> object:
        if value is None:
            return ["http://localhost:3000"]
        if isinstance(value, str):
            raw_value = value.strip()
            if not raw_value:
                return []
            if raw_value.startswith("["):
                parsed = json.loads(raw_value)
                if not isinstance(parsed, list):
                    raise ValueError("CORS_ORIGINS must be a list or comma-separated string.")
                return parsed
            return [item.strip() for item in raw_value.split(",") if item.strip()]
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()
