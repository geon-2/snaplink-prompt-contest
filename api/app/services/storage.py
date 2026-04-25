from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import boto3

from app.core.config import get_settings


class S3StorageService:
    def __init__(
        self,
        *,
        bucket: str,
        region: str,
        aws_access_key_id: str | None = None,
        aws_secret_access_key: str | None = None,
    ) -> None:
        self.bucket = bucket
        self.region = region
        client_kwargs: dict[str, str] = {"region_name": region}
        if aws_access_key_id and aws_secret_access_key:
            client_kwargs["aws_access_key_id"] = aws_access_key_id
            client_kwargs["aws_secret_access_key"] = aws_secret_access_key
        self._client = boto3.client("s3", **client_kwargs)

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

    def generate_presigned_url(self, key: str, expires_in: int = 3600) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=expires_in,
        )


@lru_cache
def get_storage_service() -> S3StorageService:
    settings = get_settings()
    return S3StorageService(
        bucket=settings.s3_bucket,
        region=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
    )
