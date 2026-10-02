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
