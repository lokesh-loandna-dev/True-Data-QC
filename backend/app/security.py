from app.auth.security import (
    ALGORITHM,
    hash_password,
    verify_password,
    generate_token,
    verify_token,
    get_current_user_id,
    ROLE_SUPER_ADMIN,
    ROLE_ADMIN_PRE_UW,
    ROLE_ADMIN_JUNIOR_UW,
    ROLE_PRE_UW,
    ROLE_JUNIOR_UW,
    ALLOWED_ROLES,
    is_super_admin,
    is_admin_pre_underwriter,
    is_admin_junior_underwriter,
    is_any_admin,
    normalize_role,
    check_package_access,
)

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
        # Can only see Pre-Underwriter role packages (not other admins or super admin)
        return up_role in ("pre underwriter", "pre underwrite")

    if is_admin_junior_underwriter(current_user_role):
        # Can only see Junior-Underwriter role packages (not other admins or super admin)
        return up_role in ("junior underwriter", "junior underwrite")

    return False

__all__ = [
    "ALGORITHM",
    "hash_password",
    "verify_password",
    "generate_token",
    "verify_token",
    "get_current_user_id",
    "ROLE_SUPER_ADMIN",
    "ROLE_ADMIN_PRE_UW",
    "ROLE_ADMIN_JUNIOR_UW",
    "ROLE_PRE_UW",
    "ROLE_JUNIOR_UW",
    "ALLOWED_ROLES",
    "is_super_admin",
    "is_admin_pre_underwriter",
    "is_admin_junior_underwriter",
    "is_any_admin",
    "normalize_role",
    "check_package_access",
]
