from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Iterator

import httpx

from app.core.config import get_settings


@dataclass(slots=True)
class GeminiUploadedFile:
    uri: str
    mime_type: str


@dataclass(slots=True)
class GeminiTextEvent:
    text: str


@dataclass(slots=True)
class GeminiImageEvent:
    data: bytes
    mime_type: str


GeminiStreamEvent = GeminiTextEvent | GeminiImageEvent


class GeminiService:
    def __init__(self, *, base_url: str, model: str, image_model: str | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.image_model = image_model or model

    def upload_file(
        self,
        *,
        api_key: str,
        file_path: Path,
        mime_type: str,
        display_name: str,
    ) -> GeminiUploadedFile:
        upload_endpoint = f"{self.base_url}/upload/v1beta/files?key={api_key}"
        file_size = file_path.stat().st_size
        start_headers = {
            "X-Goog-Upload-Protocol": "resumable",
            "X-Goog-Upload-Command": "start",
            "X-Goog-Upload-Header-Content-Length": str(file_size),
            "X-Goog-Upload-Header-Content-Type": mime_type,
            "Content-Type": "application/json",
        }
        metadata = {"file": {"displayName": display_name}}

        with httpx.Client(timeout=120.0) as client:
            start_response = client.post(upload_endpoint, headers=start_headers, json=metadata)
            start_response.raise_for_status()
            upload_url = start_response.headers.get("X-Goog-Upload-URL")
            if upload_url is None:
                raise RuntimeError("Gemini file upload URL was not returned.")

            with file_path.open("rb") as file_handle:
                upload_response = client.post(
                    upload_url,
                    headers={
                        "Content-Length": str(file_size),
                        "X-Goog-Upload-Offset": "0",
                        "X-Goog-Upload-Command": "upload, finalize",
                    },
                    content=file_handle.read(),
                )
            upload_response.raise_for_status()

        payload = upload_response.json()
        file_info = payload.get("file", payload)
        return GeminiUploadedFile(
            uri=file_info["uri"],
            mime_type=file_info.get("mimeType", mime_type),
        )

    def stream_generate_content(
        self,
        *,
        api_key: str,
        model: str,
        payload: dict[str, object],
    ) -> Iterator[GeminiStreamEvent]:
        endpoint = f"{self.base_url}/v1beta/models/{model}:streamGenerateContent?alt=sse&key={api_key}"

        with httpx.Client(timeout=None) as client:
            with client.stream(
                "POST",
                endpoint,
                headers={"Content-Type": "application/json"},
                json=payload,
            ) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line:
                        continue
                    if isinstance(line, bytes):
                        decoded_line = line.decode("utf-8")
                    else:
                        decoded_line = line
                    if not decoded_line.startswith("data:"):
                        continue

                    raw_data = decoded_line[5:].strip()
                    if not raw_data or raw_data == "[DONE]":
                        continue

                    yield from self._parse_stream_chunk(json.loads(raw_data))

    @staticmethod
    def build_file_part(uploaded_file: GeminiUploadedFile) -> dict[str, object]:
        return {
            "fileData": {
                "fileUri": uploaded_file.uri,
                "mimeType": uploaded_file.mime_type,
            }
        }

    @staticmethod
    def _parse_stream_chunk(chunk: dict[str, object]) -> Iterator[GeminiStreamEvent]:
        candidates = chunk.get("candidates", [])
        if not isinstance(candidates, list):
            return

        for candidate in candidates:
            if not isinstance(candidate, dict):
                continue
            content = candidate.get("content", {})
            if not isinstance(content, dict):
                continue
            parts = content.get("parts", [])
            if not isinstance(parts, list):
                continue

            for part in parts:
                if not isinstance(part, dict):
                    continue

                text = part.get("text")
                if isinstance(text, str) and text:
                    yield GeminiTextEvent(text=text)

                inline_data = part.get("inlineData")
                if not isinstance(inline_data, dict):
                    continue

                data = inline_data.get("data")
                if not isinstance(data, str) or not data:
                    continue

                mime_type = inline_data.get("mimeType")
                resolved_mime_type = mime_type if isinstance(mime_type, str) else "image/png"
                yield GeminiImageEvent(
                    data=base64.b64decode(data),
                    mime_type=resolved_mime_type,
                )


@lru_cache
def get_gemini_service() -> GeminiService:
    settings = get_settings()
    return GeminiService(
        base_url=settings.gemini_base_url,
        model=settings.gemini_model,
        image_model=settings.gemini_image_model,
    )
