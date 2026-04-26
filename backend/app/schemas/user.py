import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    timezone: str
    role: str
    is_active: bool
    last_login: datetime | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str = "user"


# Profile editing (by the user themselves)
class UserProfileUpdate(BaseModel):
    email: str | None = Field(None, max_length=255)
    full_name: str | None = Field(None, max_length=255)
    timezone: str | None = Field(None, max_length=50)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=6)


# Admin operations
class AdminUserCreate(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(min_length=6)
    full_name: str = Field(max_length=255)
    timezone: str = "America/Bogota"
    role: str = "user"


class AdminUserUpdate(BaseModel):
    is_active: bool | None = None
    role: str | None = None


class UserListItem(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str
    role: str
    is_active: bool
    last_login: datetime | None = None
    created_at: datetime
    bill_count: int = 0

    model_config = {"from_attributes": True}
