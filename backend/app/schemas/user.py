from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.models.user import UserRole


# Group Schemas
class GroupBase(BaseModel):
    name: str


class GroupCreate(GroupBase):
    pass


class GroupUpdate(BaseModel):
    name: str


class GroupResponse(GroupBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime
    updated_at: datetime


# User Schemas
class UserBase(BaseModel):
    username: str
    real_name: str
    role: UserRole = UserRole.employee
    group_id: int | None = None


class UserCreate(UserBase):
    password: str = "123456"


class UserUpdate(BaseModel):
    real_name: str | None = None
    role: UserRole | None = None
    group_id: int | None = None
    is_active: bool | None = None


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime


class UserWithPassword(UserResponse):
    password_hash: str


# Auth Schemas
class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    username: str
    password: str
    full_name: str | None = None
