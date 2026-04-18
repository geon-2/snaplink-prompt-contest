# Snaplink API

FastAPI + PostgreSQL based signup and chat API.

## Setup

```powershell
py -m pip install -e .[dev]
Copy-Item .env.example .env
```

Update `.env` with real values for `DATABASE_URL`, `S3_BUCKET`, and the Gemini model settings.

## Run

```powershell
py -m alembic upgrade head
py -m uvicorn app.main:app --reload
```

## Signup API

```http
POST /signup
Content-Type: application/json

{
  "uuid": "0f7a4fdf-9130-4b1c-aa83-2f037d2f5e59",
  "api_key": "your-api-key"
}
```

Success returns `201 Created` and sets `user_uuid` and `user_api_key` cookies. Both cookies are readable from the frontend because they are not `HttpOnly`.

## Chat API

`POST /chat/completion` uses `multipart/form-data`.

- `uuid`: user UUID
- `chat_id`: existing chat UUID, optional for a new chat
- `type`: `chat` or `image`
- `text`: prompt text
- `files[]`: optional image files

Responses use `text/event-stream` with `meta`, `text_delta`, `image`, `done`, and `error` events.

All user-uploaded images and AI-generated images are stored in AWS S3, and the API returns `s3_key` values instead of direct URLs.
