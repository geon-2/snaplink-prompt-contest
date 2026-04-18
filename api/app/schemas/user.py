from uuid import UUID

from pydantic import BaseModel, Field, UUID4


class SignupRequest(BaseModel):
    uuid: UUID4
    api_key: str = Field(min_length=1)


class SignupResponse(BaseModel):
    uuid: UUID
    message: str

