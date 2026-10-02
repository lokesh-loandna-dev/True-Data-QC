from fastapi import APIRouter, HTTPException, Depends
from app.schemas import UserRoleUpdateRequest, UserColumnPreferencesRequest
from app.security import get_current_user_id
from app.database.operations import (
    get_all_users, update_user_role, get_user_by_id,
    get_user_column_preferences, save_user_column_preferences, delete_user_column_preferences
)

router = APIRouter(prefix="/api/users", tags=["users"])

def require_admin(user_id: int = Depends(get_current_user_id)):
    user = get_user_by_id(user_id)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
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
    
    update_user_role(user_id, req.role)
    return {"status": "success", "message": "Role updated successfully"}

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

