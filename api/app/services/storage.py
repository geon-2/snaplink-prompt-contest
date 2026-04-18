from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import boto3

from app.core.config import get_settings


class S3StorageService:
    def __init__(self, *, bucket: str, region: str) -> None:
        self.bucket = bucket
        self.region = region
        self._client = boto3.client("s3", region_name=region)

    def upload_file(self, file_path: Path, key: str, content_type: str) -> str:
        self._client.upload_file(
            str(file_path),
            self.bucket,
            key,
            ExtraArgs={"ContentType": content_type},
        )
        return key

    def upload_bytes(self, data: bytes, key: str, content_type: str) -> str:
        self._client.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=data,
            ContentType=content_type,
        )
        return key

    def download_object(self, key: str) -> tuple[bytes, str | None]:
        response = self._client.get_object(Bucket=self.bucket, Key=key)
        body = response["Body"]
        try:
            return body.read(), response.get("ContentType")
        finally:
            body.close()


@lru_cache
def get_storage_service() -> S3StorageService:
    settings = get_settings()
    return S3StorageService(bucket=settings.s3_bucket, region=settings.aws_region)
