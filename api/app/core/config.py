from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://postgres:postgres@localhost:5432/snaplink"
    cookie_secure: bool = False
    cookie_max_age: int = 604800
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])
    gemini_base_url: str = "https://generativelanguage.googleapis.com"
    gemini_model: str = "gemini-3.1-pro-preview"
    gemini_image_model: str = "gemini-3-pro-image-preview"
    aws_region: str = "ap-northeast-2"
    aws_access_key_id: str | None = None
    aws_secret_access_key: str | None = None
    s3_bucket: str = "revede"
    s3_prefix: str = "prompt"
    temp_upload_dir: Path = Path(".tmp/uploads")
    usage_limit_krw: int = 12500

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

    @model_validator(mode="after")
    def validate_aws_credentials(self) -> "Settings":
        has_access_key = bool(self.aws_access_key_id)
        has_secret_key = bool(self.aws_secret_access_key)
        if has_access_key != has_secret_key:
            raise ValueError(
                "AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set together."
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
