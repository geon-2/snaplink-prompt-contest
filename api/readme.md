# Snaplink API

FastAPI + PostgreSQL based signup and chat API.

## Setup

```powershell
py -m pip install -e .[dev]
Copy-Item .env.example .env
```

Update `.env` with real values for `DATABASE_URL`, `S3_BUCKET`, Gemini model settings, and `USAGE_LIMIT_USD`.

For S3 credentials, either:

- set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` in `.env`, or
- rely on the AWS SDK default credential chain such as `~/.aws/credentials`, ECS task roles, or EC2 instance roles.

## PostgreSQL

The API already uses PostgreSQL as the default database.

Run a local database with Docker:

```powershell
docker compose up -d postgres
```

Default connection:

```text
postgresql+psycopg://postgres:postgres@localhost:5432/snaplink
```

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

By default, images are stored in bucket `revede` under keys shaped like `prompt/<api-key>/chats/...`.

`GET /images/generated` returns the authenticated user's generated image gallery with pagination.

- `uuid`: user UUID
- `page`: 1-based page number, default `1`
- `page_size`: items per page, default `20`, max `100`

## Usage API

`GET /usage/me` reads `user_api_key` from the cookie-backed session and returns the current spent amount, remaining budget, and configured limit for that key.

Usage is tracked in the database per request through `usage_ledger`. The API does not automatically block requests when the configured limit is exceeded; it only reports the current usage state.
