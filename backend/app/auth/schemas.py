from pydantic import BaseModel

class UserRegisterRequest(BaseModel):
    username: str
    email: str
    password: str

class UserLoginRequest(BaseModel):
    email: str
    password: str

class UserRoleUpdateRequest(BaseModel):
    role: str
