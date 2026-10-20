import uuid
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict

class SetupRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    username: str = Field(min_length=3, max_length=60)
    password: str = Field(min_length=8, max_length=128)

class LoginRequest(BaseModel):
    username: str
    password: str

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)

class AuthStatusResponse(BaseModel):
    needs_setup: bool

class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    name: str
    username: str
    role: str
    is_active: bool
    last_login_at: Optional[datetime] = None
    created_at: datetime
