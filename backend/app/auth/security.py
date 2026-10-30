import hashlib
import uuid
from datetime import datetime, timedelta, timezone
import jwt
from fastapi import HTTPException, Header
from app.config import SECRET_KEY
from app.logger import log_event

ALGORITHM = "HS256"

def hash_password(password: str) -> str:
    salt = uuid.uuid4().hex
    hashed = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
    return f"{salt}:{hashed}"

def verify_password(password: str, hashed_password: str) -> bool:
    try:
        salt, hashed = hashed_password.split(":", 1)
        test_hashed = hashlib.sha256((password + salt).encode('utf-8')).hexdigest()
        return test_hashed == hashed
    except Exception as e:
        log_event("WARNING", "PASSWORD_VERIFY_ERROR", f"Error evaluating password hash: {str(e)}")
        return False

def generate_token(user_id: int, expires_delta: timedelta | None = None) -> str:
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=24)
    payload = {
        "sub": str(user_id),
        "user_id": user_id,
        "iat": now,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_token(token: str) -> int | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        if user_id is None:
            sub = payload.get("sub")
            user_id = int(sub) if sub else None
        return user_id
    except jwt.ExpiredSignatureError:
        log_event("WARNING", "TOKEN_EXPIRED", "Provided JWT token has expired")
        return None
    except jwt.InvalidTokenError as e:
        log_event("WARNING", "TOKEN_INVALID", f"Provided JWT token is invalid: {str(e)}")
        return None
    except (ValueError, TypeError) as e:
        log_event("WARNING", "TOKEN_DECODE_ERROR", f"Error decoding token payload: {str(e)}")
        return None

def get_current_user_id(authorization: str = Header(None)):
    if not authorization:
        log_event("WARNING", "AUTH_HEADER_MISSING", "Authorization request header was not provided")
        raise HTTPException(status_code=401, detail="Authorization header missing")
    try:
        token_type, token = authorization.split(" ", 1)
        if token_type.lower() != "bearer":
            issue = f"Authorization header format invalid: Expected 'Bearer', received '{token_type}'"
            log_event("WARNING", "AUTH_HEADER_INVALID", issue)
            raise HTTPException(status_code=401, detail="Bearer token format required")
        
        user_id = verify_token(token)
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid or expired token")
        return user_id
    except HTTPException:
        raise
    except Exception as e:
        issue = f"Failed to parse authorization header: {str(e)}"
        log_event("WARNING", "AUTH_HEADER_PARSE_ERROR", issue)
        raise HTTPException(status_code=401, detail="Invalid authorization header format")

def generate_reset_token(email: str, expires_minutes: int = 15) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=expires_minutes)
    payload = {
        "sub": email.lower(),
        "email": email.lower(),
        "purpose": "password_reset",
        "iat": now,
        "exp": expire
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def verify_reset_token(token: str, expected_email: str) -> bool:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "password_reset":
            return False
        token_email = payload.get("email") or payload.get("sub")
        return bool(token_email and token_email.lower() == expected_email.lower())
    except Exception as e:
        log_event("WARNING", "RESET_TOKEN_INVALID", f"Invalid reset token: {str(e)}")
        return False


ROLE_SUPER_ADMIN = "Super Admin"
ROLE_ADMIN_PRE_UW = "Admin with Pre-Underwriter"
ROLE_ADMIN_JUNIOR_UW = "Admin with Junior-Underwriter"
ROLE_PRE_UW = "Pre Underwriter"
ROLE_JUNIOR_UW = "Junior underwriter"

ALLOWED_ROLES = {
    "super admin",
    "admin",
    "admin with pre-underwriter",
    "admin with pre-underwrite",
    "admin with pre underwriter",
    "admin with pre underwrite",
    "admin with junior-underwriter",
    "admin with junior-underwrite",
    "admin with junior underwriter",
    "admin with junior underwrite",
    "pre underwriter",
    "pre underwrite",
    "junior underwriter",
    "junior underwrite",
    "--selected--"
}

def is_super_admin(role: str | None) -> bool:
    r = (role or "").strip().lower()
    return r in ("super admin", "super_admin", "admin")

def is_admin_pre_underwriter(role: str | None) -> bool:
    r = (role or "").strip().lower()
    return "admin" in r and "pre" in r

def is_admin_junior_underwriter(role: str | None) -> bool:
    r = (role or "").strip().lower()
    return "admin" in r and "junior" in r

def is_any_admin(role: str | None) -> bool:
    return is_super_admin(role) or is_admin_pre_underwriter(role) or is_admin_junior_underwriter(role)

def normalize_role(role_str: str) -> str:
    cleaned = (role_str or "").strip()
    lower = cleaned.lower()
    if lower in ("super admin", "super_admin", "admin"):
        return ROLE_SUPER_ADMIN
    elif "admin" in lower and "pre" in lower:
        return ROLE_ADMIN_PRE_UW
    elif "admin" in lower and "junior" in lower:
        return ROLE_ADMIN_JUNIOR_UW
    elif lower in ("pre underwriter", "pre underwrite") or "pre" in lower:
        return ROLE_PRE_UW
    elif lower in ("junior underwriter", "junior underwrite") or "junior" in lower:
        return ROLE_JUNIOR_UW
    elif lower == "--selected--":
        return "--selected--"
    return cleaned

def check_package_access(
    current_user_role: str | None,
    current_user_id: int,
    package_user_id: int | None,
    uploader_role: str | None
) -> bool:
    """
    Evaluates whether the requesting user can access a package.
    - Super Admin: sees all packages.
    - Own package: always accessible.
    - Admin with Pre-Underwriter: sees own + packages uploaded by Pre-Underwriters.
    - Admin with Junior-Underwriter: sees own + packages uploaded by Junior-Underwriters.
    - Underwriters: see only own packages.
    """
    if is_super_admin(current_user_role):
        return True

    if package_user_id is not None and package_user_id == current_user_id:
        return True

    up_role = (uploader_role or "").strip().lower()

    if is_admin_pre_underwriter(current_user_role):
        return up_role in ("pre underwriter", "pre underwrite")

    if is_admin_junior_underwriter(current_user_role):
        return up_role in ("junior underwriter", "junior underwrite")

    return False
