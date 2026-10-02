from fastapi import APIRouter, HTTPException, Depends
from app.config import EMAIL_REGEX
from app.database.connection import db_status
from app.auth.schemas import UserRegisterRequest, UserLoginRequest
from app.auth.security import hash_password, verify_password, generate_token, get_current_user_id
from app.database.operations import get_user_by_email, get_user_by_username, get_user_by_id, create_user, get_audit_logs
from app.logger import log_event

router = APIRouter(prefix="/api/auth", tags=["authentication"])

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

    # Check duplicates
    if get_user_by_username(username):
        issue = f"Registration failed: Username '{username}' already registered"
        log_event("WARNING", "REGISTER_FAILED", issue, username=username, email=email)
        raise HTTPException(status_code=400, detail="Username already registered")
        
    if get_user_by_email(email):
        issue = f"Registration failed: Email '{email}' already registered"
        log_event("WARNING", "REGISTER_FAILED", issue, username=username, email=email)
        raise HTTPException(status_code=400, detail="Email already registered")

    # Create user
    try:
        pwd_hash = hash_password(password)
        created = create_user(username, email, pwd_hash)
        token = generate_token(created["id"])
        log_event("INFO", "REGISTER_SUCCESS", "User registered successfully", username=username, email=email)
        return {
            "status": "success",
            "message": "User registered successfully",
            "token": token,
            "user": created
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
            "role": user["role"]
        }
    }

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
def fetch_audit_logs(limit: int = 100):
    """
    Returns recent audit logs stored in backend database/memory.
    """
    logs = get_audit_logs(limit=limit)
    return {
        "status": "success",
        "count": len(logs),
        "logs": logs
    }
