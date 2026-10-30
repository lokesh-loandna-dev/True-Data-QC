from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from app.schemas import UserRoleUpdateRequest, UserStatusUpdateRequest, UserColumnPreferencesRequest
from app.security import (
    get_current_user_id,
    is_super_admin,
    is_any_admin,
    normalize_role,
    ALLOWED_ROLES,
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN_PRE_UW,
    ROLE_ADMIN_JUNIOR_UW,
    ROLE_PRE_UW,
    ROLE_JUNIOR_UW,
)
from app.database.operations import (
    get_all_users, update_user_role, update_user_status, get_user_by_id,
    get_user_column_preferences, save_user_column_preferences, delete_user_column_preferences
)
from app.services.email_service import send_account_approved_email, send_account_rejected_email
from app.logger import log_event

router = APIRouter(prefix="/api/users", tags=["users"])

def require_admin(user_id: int = Depends(get_current_user_id)):
    user = get_user_by_id(user_id)
    if not user or not is_any_admin(user.get("role")):
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user

def require_super_admin(user_id: int = Depends(get_current_user_id)):
    user = get_user_by_id(user_id)
    if not user or not is_super_admin(user.get("role")):
        raise HTTPException(status_code=403, detail="Super Admin privileges required")
    return user

@router.get("/")
def get_users(admin_user: dict = Depends(require_admin)):
    users = get_all_users()
    return {"status": "success", "users": users}

@router.put("/{user_id}/role")
def change_user_role(user_id: int, req: UserRoleUpdateRequest, admin_user: dict = Depends(require_admin)):
    target_user = get_user_by_id(user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    role_to_set = req.role.strip()
    if role_to_set.lower() not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=400,
            detail="Invalid role. Allowed roles: 'Super Admin', 'Admin with Pre-Underwriter', 'Admin with Junior-Underwriter', 'Pre Underwriter', 'Junior underwriter'"
        )
    
    normalized = normalize_role(role_to_set)
    update_user_role(user_id, normalized)
    return {"status": "success", "message": "Role updated successfully", "role": normalized}

@router.put("/{user_id}/status")
def change_user_status(
    user_id: int,
    req: UserStatusUpdateRequest,
    background_tasks: BackgroundTasks,
    admin_user: dict = Depends(require_admin)
):
    target_user = get_user_by_id(user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    new_status = req.status.strip().lower()
    if new_status not in ["active", "inactive", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status. Allowed values: 'active', 'inactive', 'rejected'")
    
    # Safeguard: prevent admin from deactivating or rejecting their own account
    if admin_user.get("id") == user_id and new_status != "active":
        raise HTTPException(status_code=400, detail="Administrators cannot deactivate or reject their own account")
    
    old_status = (target_user.get("status") or "active").strip().lower()

    # If role is provided or user is being activated
    if req.role:
        role_to_set = req.role.strip()
        if role_to_set.lower() not in ALLOWED_ROLES or role_to_set.lower() == "--selected--":
            raise HTTPException(
                status_code=400,
                detail="Invalid role. Allowed roles: 'Super Admin', 'Admin with Pre-Underwriter', 'Admin with Junior-Underwriter', 'Pre Underwriter', 'Junior underwriter'"
            )
        normalized = normalize_role(role_to_set)
        update_user_role(user_id, normalized)
        target_user["role"] = normalized
    elif new_status == "active":
        # Enforce that activating a user requires an assigned role
        current_role = (target_user.get("role") or "").strip()
        if current_role in ["--selected--", "", "None"]:
            raise HTTPException(
                status_code=400,
                detail="A valid role must be selected to approve this account."
            )

    update_user_status(user_id, new_status)
    admin_role = admin_user.get("role", "Admin")
    log_event("INFO", "USER_STATUS_UPDATED", f"{admin_role} '{admin_user.get('email')}' updated user '{target_user.get('email')}' status to '{new_status}' (role: '{target_user.get('role')}')")

    # Send notification emails for status transitions
    user_email = target_user.get("email")
    username = target_user.get("username", "User")
    if user_email:
        if new_status == "active" and old_status != "active":
            background_tasks.add_task(send_account_approved_email, user_email, username)
        elif new_status == "rejected" and old_status != "rejected":
            background_tasks.add_task(send_account_rejected_email, user_email, username)

    return {
        "status": "success",
        "message": f"User status updated to {new_status}",
        "role": target_user.get("role")
    }

# ============================================================================
# Column Preferences Endpoints (Any authenticated user for their own account)
# ============================================================================

@router.get("/preferences/columns/{table_key}")
def get_column_preferences(table_key: str, user_id: int = Depends(get_current_user_id)):
    columns = get_user_column_preferences(user_id, table_key)
    return {
        "status": "success",
        "table_key": table_key,
        "selected_columns": columns
    }

@router.post("/preferences/columns")
def save_column_preferences(req: UserColumnPreferencesRequest, user_id: int = Depends(get_current_user_id)):
    if not req.selected_columns:
        raise HTTPException(status_code=400, detail="selected_columns cannot be empty")
    ok = save_user_column_preferences(user_id, req.table_key, req.selected_columns)
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to save column preferences")
    return {
        "status": "success",
        "table_key": req.table_key,
        "selected_columns": req.selected_columns
    }

@router.delete("/preferences/columns/{table_key}")
def reset_column_preferences(table_key: str, user_id: int = Depends(get_current_user_id)):
    delete_user_column_preferences(user_id, table_key)
    return {
        "status": "success",
        "message": f"Preferences reset for {table_key}"
    }
