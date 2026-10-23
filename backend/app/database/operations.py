import json
import time
from datetime import datetime, timedelta
from sqlalchemy import text
from app.database.connection import engine

def get_user_by_email(email: str):
    if not engine:
        return None
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT id, username, email, password_hash, role, COALESCE(status, 'active') AS status FROM users WHERE email = :email"),
            {"email": email.lower()}
        ).fetchone()
        return dict(result._mapping) if result else None

def get_user_by_username(username: str):
    if not engine:
        return None
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT id, username, email, password_hash, role, COALESCE(status, 'active') AS status FROM users WHERE username = :username"),
            {"username": username}
        ).fetchone()
        return dict(result._mapping) if result else None

def get_user_by_id(user_id: int):
    if not engine:
        return None
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT id, username, email, role, COALESCE(status, 'active') AS status FROM users WHERE id = :id"),
            {"id": user_id}
        ).fetchone()
        return dict(result._mapping) if result else None

def create_user(username: str, email: str, password_hash: str, role: str = "--selected--", status: str = "inactive"):
    if not engine:
        raise Exception("Database engine not initialized")
    with engine.begin() as connection:
        result = connection.execute(
            text("INSERT INTO users (username, email, password_hash, role, status) OUTPUT INSERTED.id VALUES (:username, :email, :password_hash, :role, :status)"),
            {"username": username, "email": email.lower(), "password_hash": password_hash, "role": role, "status": status}
        )
        inserted_id = result.fetchone()[0]
        return {"id": inserted_id, "username": username, "email": email.lower(), "role": role, "status": status}

def get_all_users():
    if not engine:
        return []
    with engine.connect() as connection:
        result = connection.execute(
            text("SELECT id, username, email, role, COALESCE(status, 'active') AS status, created_at FROM users ORDER BY created_at DESC, id DESC")
        ).fetchall()
        return [dict(row._mapping) for row in result]

def update_user_role(user_id: int, role: str):
    if not engine:
        raise Exception("Database engine not initialized")
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE users SET role = :role WHERE id = :id"),
            {"role": role, "id": user_id}
        )
        return True

def update_user_status(user_id: int, status: str):
    if not engine:
        raise Exception("Database engine not initialized")
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE users SET status = :status WHERE id = :id"),
            {"status": status, "id": user_id}
        )
        return True

def update_user_password(email: str, password_hash: str):
    if not engine:
        raise Exception("Database engine not initialized")
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE users SET password_hash = :password_hash WHERE email = :email"),
            {"password_hash": password_hash, "email": email.lower()}
        )
        return True


def create_audit_log(log_level: str, action: str, username: str, email: str, issue: str):
    if not engine:
        return False
    try:
        with engine.begin() as connection:
            connection.execute(
                text("""
                    INSERT INTO audit_logs (timestamp, log_level, action, username, email, issue)
                    VALUES (SYSUTCDATETIME(), :log_level, :action, :username, :email, :issue)
                """),
                {
                    "log_level": log_level,
                    "action": action,
                    "username": username or "N/A",
                    "email": email or "N/A",
                    "issue": issue
                }
            )
            return True
    except Exception:
        return False

def get_audit_logs(limit: int = 100):
    if not engine:
        return []
    try:
        with engine.connect() as connection:
            result = connection.execute(
                text("SELECT TOP (:limit) id, timestamp, log_level, action, username, email, issue FROM audit_logs ORDER BY id DESC"),
                {"limit": limit}
            ).fetchall()
            return [dict(row._mapping) for row in result]
    except Exception:
        return []

def purge_old_audit_logs(retention_days: int = 3):
    if not engine:
        return False
    try:
        with engine.begin() as connection:
            connection.execute(
                text("DELETE FROM audit_logs WHERE timestamp < DATEADD(day, -:days, GETUTCDATE())"),
                {"days": retention_days}
            )
            return True
    except Exception:
        return False

# ============================================================================
# USER COLUMN PREFERENCES
# ============================================================================

def get_user_column_preferences(user_id: int, table_key: str):
    """
    Retrieve saved column selection for a user and table_key.
    Returns list of column strings, or None if not configured.
    """
    if not engine or not user_id:
        return None
    try:
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT selected_columns FROM dbo.user_column_preferences WHERE user_id = :uid AND table_key = :key"),
                {"uid": user_id, "key": table_key}
            ).fetchone()
            if row and row[0]:
                data = json.loads(row[0])
                if isinstance(data, list):
                    return data
    except Exception as e:
        print(f"Error fetching user column preferences: {e}")
    return None

def save_user_column_preferences(user_id: int, table_key: str, selected_columns: list):
    """
    Upsert user column selection for a specific table_key into database.
    """
    if not engine or not user_id or not selected_columns:
        return False
    try:
        cols_json = json.dumps(list(selected_columns))
        with engine.begin() as conn:
            conn.execute(
                text("""
                MERGE dbo.user_column_preferences AS target
                USING (SELECT :uid AS user_id, :key AS table_key) AS source
                ON (target.user_id = source.user_id AND target.table_key = source.table_key)
                WHEN MATCHED THEN
                    UPDATE SET selected_columns = :cols, updated_at = SYSUTCDATETIME()
                WHEN NOT MATCHED THEN
                    INSERT (user_id, table_key, selected_columns, updated_at)
                    VALUES (:uid, :key, :cols, SYSUTCDATETIME());
                """),
                {"uid": user_id, "key": table_key, "cols": cols_json}
            )
            return True
    except Exception as e:
        print(f"Error saving user column preferences: {e}")
        return False

def delete_user_column_preferences(user_id: int, table_key: str):
    if not engine or not user_id:
        return False
    try:
        with engine.begin() as conn:
            conn.execute(
                text("DELETE FROM dbo.user_column_preferences WHERE user_id = :uid AND table_key = :key"),
                {"uid": user_id, "key": table_key}
            )
            return True
    except Exception as e:
        print(f"Error deleting user column preferences: {e}")
        return False

# ============================================================================
# SYSTEM SETTINGS (MULTI-WORKER SYNCHRONIZATION)
# ============================================================================

def get_system_setting(setting_key: str, default=None):
    if not engine:
        return default
    try:
        with engine.connect() as conn:
            val = conn.execute(
                text("SELECT setting_value FROM dbo.system_settings WHERE setting_key = :key"),
                {"key": setting_key}
            ).scalar()
            return val if val is not None else default
    except Exception as e:
        print(f"Error reading system setting {setting_key}: {e}")
        return default

def set_system_setting(setting_key: str, setting_value: str):
    if not engine:
        return False
    try:
        with engine.begin() as conn:
            conn.execute(
                text("""
                MERGE dbo.system_settings AS target
                USING (SELECT :key AS setting_key) AS source
                ON (target.setting_key = source.setting_key)
                WHEN MATCHED THEN
                    UPDATE SET setting_value = :val, updated_at = SYSUTCDATETIME()
                WHEN NOT MATCHED THEN
                    INSERT (setting_key, setting_value, updated_at)
                    VALUES (:key, :val, SYSUTCDATETIME());
                """),
                {"key": setting_key, "val": str(setting_value)}
            )
            return True
    except Exception as e:
        print(f"Error writing system setting {setting_key}: {e}")
        return False

def get_data_dict_version() -> str:
    """Returns the current data dictionary schema/content version string."""
    v = get_system_setting("data_dictionary_version")
    if not v:
        v = "1"
        set_system_setting("data_dictionary_version", v)
    return str(v)

def bump_data_dict_version() -> str:
    """Increments the data dictionary version across all workers."""
    new_version = str(int(time.time() * 1000))
    set_system_setting("data_dictionary_version", new_version)
    return new_version

def save_password_reset_otp(email: str, otp_code: str, expiry_minutes: int = 10) -> bool:
    """
    Invalidates any previous pending OTPs for the email and creates a new OTP record.
    """
    if not engine:
        raise Exception("Database engine not initialized")
    clean_email = email.strip().lower()
    expires_at = datetime.utcnow() + timedelta(minutes=expiry_minutes)
    
    with engine.begin() as connection:
        # Invalidate previous unconsumed OTPs
        connection.execute(
            text("UPDATE password_reset_otps SET used = 1 WHERE email = :email AND used = 0"),
            {"email": clean_email}
        )
        # Insert fresh OTP
        connection.execute(
            text("""
                INSERT INTO password_reset_otps (email, otp_code, expires_at, verified, used, attempts, created_at)
                VALUES (:email, :otp_code, :expires_at, 0, 0, 0, SYSUTCDATETIME())
            """),
            {"email": clean_email, "otp_code": otp_code, "expires_at": expires_at}
        )
        return True

def verify_password_reset_otp(email: str, otp_code: str) -> dict:
    """
    Verifies an OTP entered for password reset.
    Returns a dict with 'valid': bool and 'reason': str.
    """
    if not engine:
        raise Exception("Database engine not initialized")
    clean_email = email.strip().lower()
    clean_otp = otp_code.strip()

    with engine.connect() as connection:
        result = connection.execute(
            text("""
                SELECT TOP 1 id, otp_code, expires_at, verified, used, attempts
                FROM password_reset_otps
                WHERE email = :email AND used = 0
                ORDER BY id DESC
            """),
            {"email": clean_email}
        ).fetchone()

        if not result:
            return {"valid": False, "reason": "No active OTP request found. Please request a new OTP."}

        record = dict(result._mapping)
        otp_id = record["id"]
        attempts = record.get("attempts", 0)

        # Check max attempts
        if attempts >= 5:
            return {"valid": False, "reason": "Too many failed attempts. Please request a new OTP."}

        # Check expiration
        expires_at = record["expires_at"]
        if expires_at and expires_at < datetime.utcnow():
            return {"valid": False, "reason": "OTP has expired. Please request a new OTP."}

        # Check code match
        if record["otp_code"] != clean_otp:
            # Increment attempts
            with engine.begin() as update_conn:
                update_conn.execute(
                    text("UPDATE password_reset_otps SET attempts = attempts + 1 WHERE id = :id"),
                    {"id": otp_id}
                )
            remaining = 5 - (attempts + 1)
            remaining_msg = f" ({remaining} attempts remaining)" if remaining > 0 else " (Maximum attempts reached)"
            return {"valid": False, "reason": f"Invalid verification code.{remaining_msg}"}

        # Code is correct: mark verified
        with engine.begin() as update_conn:
            update_conn.execute(
                text("UPDATE password_reset_otps SET verified = 1 WHERE id = :id"),
                {"id": otp_id}
            )
        return {"valid": True, "reason": "OTP verified successfully"}

def consume_password_reset_otp(email: str) -> bool:
    """
    Marks verified OTPs as used once password reset is completed.
    """
    if not engine:
        return False
    clean_email = email.strip().lower()
    with engine.begin() as connection:
        connection.execute(
            text("UPDATE password_reset_otps SET used = 1 WHERE email = :email"),
            {"email": clean_email}
        )
        return True

