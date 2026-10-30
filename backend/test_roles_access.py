import sys
import os

# Add backend to sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.security import (
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

def test_normalization():
    print("Testing Role Normalization...")
    assert normalize_role("Super Admin") == ROLE_SUPER_ADMIN
    assert normalize_role("super_admin") == ROLE_SUPER_ADMIN
    assert normalize_role("admin") == ROLE_SUPER_ADMIN
    assert normalize_role("Admin with Pre-Underwriter") == ROLE_ADMIN_PRE_UW
    assert normalize_role("admin with pre-underwrite") == ROLE_ADMIN_PRE_UW
    assert normalize_role("Admin with Junior-Underwriter") == ROLE_ADMIN_JUNIOR_UW
    assert normalize_role("admin with junior-underwrite") == ROLE_ADMIN_JUNIOR_UW
    assert normalize_role("Pre Underwriter") == ROLE_PRE_UW
    assert normalize_role("pre underwrite") == ROLE_PRE_UW
    assert normalize_role("Junior underwriter") == ROLE_JUNIOR_UW
    assert normalize_role("junior underwrite") == ROLE_JUNIOR_UW
    assert normalize_role("--selected--") == "--selected--"
    print("[OK] Normalization passed!")

def test_role_checkers():
    print("Testing Role Checkers...")
    assert is_super_admin("Super Admin") is True
    assert is_super_admin("admin") is True
    assert is_super_admin("Admin with Pre-Underwriter") is False

    assert is_admin_pre_underwriter("Admin with Pre-Underwriter") is True
    assert is_admin_pre_underwriter("Admin with Junior-Underwriter") is False
    assert is_admin_pre_underwriter("Pre Underwriter") is False

    assert is_admin_junior_underwriter("Admin with Junior-Underwriter") is True
    assert is_admin_junior_underwriter("Admin with Pre-Underwriter") is False
    assert is_admin_junior_underwriter("Junior underwriter") is False

    assert is_any_admin("Super Admin") is True
    assert is_any_admin("Admin with Pre-Underwriter") is True
    assert is_any_admin("Admin with Junior-Underwriter") is True
    assert is_any_admin("Pre Underwriter") is False
    assert is_any_admin("Junior underwriter") is False
    print("[OK] Role checkers passed!")

def test_package_access_matrix():
    print("Testing Package Access Matrix...")
    super_admin_uid = 1
    admin_pre_uid = 2
    admin_jun_uid = 3
    pre_uw_uid = 4
    jun_uw_uid = 5

    # 1. Super Admin sees ALL packages
    assert check_package_access("Super Admin", super_admin_uid, super_admin_uid, "Super Admin") is True
    assert check_package_access("Super Admin", super_admin_uid, admin_pre_uid, "Admin with Pre-Underwriter") is True
    assert check_package_access("Super Admin", super_admin_uid, pre_uw_uid, "Pre Underwriter") is True
    assert check_package_access("Super Admin", super_admin_uid, jun_uw_uid, "Junior underwriter") is True

    # 2. Admin with Pre-Underwriter sees own + Pre Underwriter packages
    # Own package:
    assert check_package_access("Admin with Pre-Underwriter", admin_pre_uid, admin_pre_uid, "Admin with Pre-Underwriter") is True
    # Pre Underwriter package:
    assert check_package_access("Admin with Pre-Underwriter", admin_pre_uid, pre_uw_uid, "Pre Underwriter") is True
    # Junior Underwriter package: CANNOT SEE
    assert check_package_access("Admin with Pre-Underwriter", admin_pre_uid, jun_uw_uid, "Junior underwriter") is False
    # Super Admin package: CANNOT SEE
    assert check_package_access("Admin with Pre-Underwriter", admin_pre_uid, super_admin_uid, "Super Admin") is False
    # Another admin's package: CANNOT SEE
    assert check_package_access("Admin with Pre-Underwriter", admin_pre_uid, admin_jun_uid, "Admin with Junior-Underwriter") is False

    # 3. Admin with Junior-Underwriter sees own + Junior Underwriter packages
    # Own package:
    assert check_package_access("Admin with Junior-Underwriter", admin_jun_uid, admin_jun_uid, "Admin with Junior-Underwriter") is True
    # Junior Underwriter package:
    assert check_package_access("Admin with Junior-Underwriter", admin_jun_uid, jun_uw_uid, "Junior underwriter") is True
    # Pre Underwriter package: CANNOT SEE
    assert check_package_access("Admin with Junior-Underwriter", admin_jun_uid, pre_uw_uid, "Pre Underwriter") is False
    # Super Admin package: CANNOT SEE
    assert check_package_access("Admin with Junior-Underwriter", admin_jun_uid, super_admin_uid, "Super Admin") is False

    # 4. Pre Underwriter only sees own
    assert check_package_access("Pre Underwriter", pre_uw_uid, pre_uw_uid, "Pre Underwriter") is True
    assert check_package_access("Pre Underwriter", pre_uw_uid, 99, "Pre Underwriter") is False
    assert check_package_access("Pre Underwriter", pre_uw_uid, admin_pre_uid, "Admin with Pre-Underwriter") is False
    assert check_package_access("Pre Underwriter", pre_uw_uid, super_admin_uid, "Super Admin") is False

    # 5. Junior Underwriter only sees own
    assert check_package_access("Junior underwriter", jun_uw_uid, jun_uw_uid, "Junior underwriter") is True
    assert check_package_access("Junior underwriter", jun_uw_uid, 99, "Junior underwriter") is False
    assert check_package_access("Junior underwriter", jun_uw_uid, admin_jun_uid, "Admin with Junior-Underwriter") is False
    assert check_package_access("Junior underwriter", jun_uw_uid, super_admin_uid, "Super Admin") is False

    print("[OK] Package access matrix passed completely!")

def test_user_management_access():
    print("Testing User Management Access...")
    # Permitted roles
    assert is_any_admin("Super Admin") is True
    assert is_any_admin("Admin with Pre-Underwriter") is True
    assert is_any_admin("Admin with Junior-Underwriter") is True
    assert is_any_admin("admin with pre-underwriter") is True
    assert is_any_admin("admin with junior-underwriter") is True

    # Denied roles
    assert is_any_admin("Pre Underwriter") is False
    assert is_any_admin("Junior underwriter") is False
    assert is_any_admin("--selected--") is False
    assert is_any_admin(None) is False
    print("[OK] User Management access passed!")

if __name__ == "__main__":
    test_normalization()
    test_role_checkers()
    test_package_access_matrix()
    test_user_management_access()
    print("\nALL ROLE-BASED ACCESS CONTROL TESTS PASSED SUCCESSFULLY!")
