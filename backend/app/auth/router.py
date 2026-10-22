import secrets
from fastapi import APIRouter, HTTPException, Depends
from app.config import EMAIL_REGEX
from app.database.connection import db_status
from app.auth.schemas import (
    UserRegisterRequest,
    UserLoginRequest,
    ForgotPasswordRequest,
    SendOtpRequest,
    VerifyOtpRequest,
    ResetPasswordRequest,
)
from app.auth.security import (
    hash_password,
    verify_password,
    generate_token,
    get_current_user_id,
    generate_reset_token,
    verify_reset_token,
)
from app.database.operations import (
    get_user_by_email,
    get_user_by_id,
    create_user,
    update_user_password,
    get_audit_logs,
    save_password_reset_otp,
    verify_password_reset_otp,
    consume_password_reset_otp,
)
from app.services.email_service import send_otp_email
from app.logger import log_event

router = APIRouter(prefix="/api/auth", tags=["authentication"])

def _require_admin(user_id: int = Depends(get_current_user_id)):
    user = get_user_by_id(user_id)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user

@router.post("/register")
def register_user(req: UserRegisterRequest):
    # Validations
    username = req.username.strip()
    email = req.email.strip()
    password = req.password

    if len(username) < 3:
        issue = "Registration failed: Username must be at least 3 characters long"
        log_event("WARNING", "REGISTER_FAILED", issue, username=username, email=email)
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
        
    if not EMAIL_REGEX.match(email):
        issue = f"Registration failed: Invalid email format '{email}'"
        log_event("WARNING", "REGISTER_FAILED", issue, username=username, email=email)
        raise HTTPException(status_code=400, detail="Invalid email address")
        
    if len(password) < 6:
        issue = "Registration failed: Password must be at least 6 characters long"
        log_event("WARNING", "REGISTER_FAILED", issue, username=username, email=email)
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

    # Check database status
    if not db_status["connected"]:
        issue = f"Registration failed: Database not connected. Error details: {db_status.get('error')}"
        log_event("ERROR", "REGISTER_FAILED", issue, username=username, email=email)
        raise HTTPException(status_code=503, detail=f"Database not connected. Error: {db_status['error']}")

    # Only email must be unique; usernames may be shared across accounts
    if get_user_by_email(email):
        issue = f"Registration failed: Email '{email}' already registered"
        log_event("WARNING", "REGISTER_FAILED", issue, username=username, email=email)
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    try:
        pwd_hash = hash_password(password)
        created = create_user(username, email, pwd_hash, role="user", status="inactive")
        log_event("INFO", "REGISTER_SUCCESS", "User registered successfully, pending admin approval", username=username, email=email)
        return {
            "status": "success",
            "message": "Registration submitted successfully. Your account is pending admin approval and will be activated once reviewed.",
            "user": {
                "id": created["id"],
                "username": created["username"],
                "email": created["email"],
                "role": created["role"],
                "status": created["status"]
            }
        }
    except Exception as e:
        issue = f"Registration failed: Error inserting user into database - {str(e)}"
        log_event("ERROR", "REGISTER_FAILED", issue, username=username, email=email)
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")

@router.post("/login")
def login_user(req: UserLoginRequest):
    email = req.email.strip()
    password = req.password

    # Check database status
    if not db_status["connected"]:
        issue = f"Login failed: Database connection inactive. Error details: {db_status.get('error')}"
        log_event("ERROR", "LOGIN_FAILED", issue, email=email)
        raise HTTPException(status_code=503, detail="Database not connected")

    # Retrieve user
    user = get_user_by_email(email)
    if not user:
        issue = f"Login failed: Account with email '{email}' does not exist"
        log_event("WARNING", "LOGIN_FAILED", issue, email=email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    username = user.get("username", "N/A")

    if not verify_password(password, user["password_hash"]):
        issue = f"Login failed: Incorrect password attempt for user '{username}' with email '{email}'"
        log_event("WARNING", "LOGIN_FAILED", issue, username=username, email=email)
        raise HTTPException(status_code=401, detail="Invalid email or password")

    # Check account status - must be active
    user_status = user.get("status", "active")
    if user_status == "rejected":
        issue = f"Login rejected: User '{username}' with email '{email}' account registration has been rejected"
        log_event("WARNING", "LOGIN_REJECTED", issue, username=username, email=email)
        raise HTTPException(
            status_code=403,
            detail="Your account registration has been rejected. Please contact an administrator."
        )
    elif user_status != "active":
        issue = f"Login rejected: User '{username}' with email '{email}' account status is '{user_status}'"
        log_event("WARNING", "LOGIN_INACTIVE", issue, username=username, email=email)
        raise HTTPException(
            status_code=403,
            detail="Your account is pending admin approval. You will be able to log in once an administrator approves your account."
        )

    token = generate_token(user["id"])
    log_event("INFO", "LOGIN_SUCCESS", "User logged in successfully", username=username, email=email)
    return {
        "status": "success",
        "message": "Login successful",
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "role": user["role"],
            "status": user_status
        }
    }

@router.post("/forgot-password/send-otp")
def send_forgot_password_otp(req: SendOtpRequest):
    email = req.email.strip().lower()

    if not email:
        raise HTTPException(status_code=400, detail="Email address is required")

    if not EMAIL_REGEX.match(email):
        issue = f"OTP request failed: Invalid email format '{email}'"
        log_event("WARNING", "OTP_REQUEST_FAILED", issue, email=email)
        raise HTTPException(status_code=400, detail="Invalid email address")

    if not db_status["connected"]:
        issue = f"OTP request failed: Database not connected. Details: {db_status.get('error')}"
        log_event("ERROR", "OTP_REQUEST_FAILED", issue, email=email)
        raise HTTPException(status_code=503, detail="Database not connected")

    user = get_user_by_email(email)
    if not user:
        issue = f"OTP request failed: No account registered with email '{email}'"
        log_event("WARNING", "OTP_REQUEST_FAILED", issue, email=email)
        raise HTTPException(status_code=404, detail="No account registered with this email address")

    user_status = user.get("status", "active")
    if user_status == "rejected":
        issue = f"OTP request failed: Account '{email}' registration has been rejected"
        log_event("WARNING", "OTP_REQUEST_FAILED", issue, email=email)
        raise HTTPException(
            status_code=403,
            detail="Your account registration has been rejected. Password reset is not available."
        )
    elif user_status != "active":
        issue = f"OTP request failed: Account '{email}' is inactive/pending approval"
        log_event("WARNING", "OTP_REQUEST_FAILED", issue, email=email)
        raise HTTPException(
            status_code=403,
            detail="Your account is pending admin approval. Password reset is not available."
        )

    # Generate 6-digit cryptographic OTP
    otp_code = f"{secrets.randbelow(900000) + 100000}"

    try:
        # Save OTP to database (valid for 10 minutes)
        save_password_reset_otp(email, otp_code, expiry_minutes=10)

        # Dispatch email via Office 365 SMTP
        send_otp_email(email, otp_code, expiry_minutes=10)

        username = user.get("username", "N/A")
        log_event("INFO", "OTP_SENT_SUCCESS", f"Password reset OTP sent to '{email}'", username=username, email=email)
        return {
            "status": "success",
            "message": f"Verification code has been sent to {email}"
        }
    except HTTPException:
        raise
    except Exception as e:
        issue = f"Failed to process or send OTP to '{email}': {str(e)}"
        log_event("ERROR", "OTP_SEND_ERROR", issue, email=email)
        raise HTTPException(status_code=500, detail=f"Failed to send verification email: {str(e)}")

@router.post("/forgot-password/verify-otp")
def verify_forgot_password_otp(req: VerifyOtpRequest):
    email = req.email.strip().lower()
    otp = req.otp.strip()

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if not otp:
        raise HTTPException(status_code=400, detail="Verification code is required")

    if not db_status["connected"]:
        raise HTTPException(status_code=503, detail="Database not connected")

    verification = verify_password_reset_otp(email, otp)
    if not verification.get("valid"):
        reason = verification.get("reason", "Invalid verification code.")
        log_event("WARNING", "OTP_VERIFY_FAILED", f"OTP verification failed for '{email}': {reason}", email=email)
        raise HTTPException(status_code=400, detail=reason)

    # Generate short-lived reset token (15 mins)
    reset_token = generate_reset_token(email, expires_minutes=15)
    log_event("INFO", "OTP_VERIFY_SUCCESS", f"OTP verified successfully for '{email}'", email=email)
    return {
        "status": "success",
        "message": "OTP verified successfully",
        "reset_token": reset_token
    }

@router.post("/forgot-password/reset-password")
def reset_password(req: ResetPasswordRequest):
    email = req.email.strip().lower()
    reset_token = req.reset_token.strip()
    password = req.password
    confirm_password = req.confirm_password

    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if not reset_token:
        raise HTTPException(status_code=400, detail="Reset token is required. Please verify OTP first.")
    if not password:
        raise HTTPException(status_code=400, detail="New password is required")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")
    if password != confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    if not db_status["connected"]:
        raise HTTPException(status_code=503, detail="Database not connected")

    # Verify reset token
    if not verify_reset_token(reset_token, email):
        log_event("WARNING", "RESET_TOKEN_REJECTED", f"Invalid or expired reset token for '{email}'", email=email)
        raise HTTPException(status_code=400, detail="Password reset session has expired or is invalid. Please request a new OTP.")

    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="No account registered with this email address")

    try:
        pwd_hash = hash_password(password)
        update_user_password(email, pwd_hash)
        consume_password_reset_otp(email)
        username = user.get("username", "N/A")
        log_event("INFO", "PASSWORD_RESET_SUCCESS", f"Password successfully reset for '{email}'", username=username, email=email)
        return {
            "status": "success",
            "message": "Password updated successfully. You can now login with your new password."
        }
    except HTTPException:
        raise
    except Exception as e:
        issue = f"Failed to reset password: {str(e)}"
        log_event("ERROR", "PASSWORD_RESET_FAILED", issue, email=email)
        raise HTTPException(status_code=500, detail=f"Failed to update password: {str(e)}")

@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest):
    if req.reset_token:
        return reset_password(
            ResetPasswordRequest(
                email=req.email,
                reset_token=req.reset_token,
                password=req.password,
                confirm_password=req.confirm_password,
            )
        )
    # If called without reset token, perform validation and prompt for OTP flow
    email = req.email.strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")
    if not EMAIL_REGEX.match(email):
        raise HTTPException(status_code=400, detail="Invalid email address")
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    if req.password != req.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="No account registered with this email address")

    pwd_hash = hash_password(req.password)
    update_user_password(email, pwd_hash)
    return {"status": "success", "message": "Password updated successfully"}

@router.get("/profile")
def get_profile(user_id: int = Depends(get_current_user_id)):
    user = get_user_by_id(user_id)
    if not user:
        issue = f"Profile fetch failed: User ID {user_id} not found in database"
        log_event("WARNING", "PROFILE_FAILED", issue)
        raise HTTPException(status_code=404, detail="User not found")
        
    log_event("INFO", "PROFILE_FETCHED", "User profile fetched successfully", username=user.get("username"), email=user.get("email"))
    return {
        "status": "success",
        "user": user
    }

@router.get("/logs")
def fetch_audit_logs(limit: int = 100, _: dict = Depends(_require_admin)):
    logs = get_audit_logs(limit=limit)
    return {
        "status": "success",
        "count": len(logs),
        "logs": logs
    }
