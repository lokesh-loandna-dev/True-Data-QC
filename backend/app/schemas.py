from pydantic import BaseModel
from typing import List
from app.auth.schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    UserRoleUpdateRequest,
)

class UserColumnPreferencesRequest(BaseModel):
    table_key: str
    selected_columns: List[str]

__all__ = [
    "UserRegisterRequest",
    "UserLoginRequest",
    "UserRoleUpdateRequest",
    "UserColumnPreferencesRequest",
]

