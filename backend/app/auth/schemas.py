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

class UserStatusUpdateRequest(BaseModel):
    status: str
    role: str | None = None

class ForgotPasswordRequest(BaseModel):
    email: str
    password: str
    confirm_password: str
    reset_token: str | None = None

class SendOtpRequest(BaseModel):
    email: str

class VerifyOtpRequest(BaseModel):
    email: str
    otp: str

class ResetPasswordRequest(BaseModel):
    email: str
    reset_token: str
    password: str
    confirm_password: str

