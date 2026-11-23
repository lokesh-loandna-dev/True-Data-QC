"""
Configuration module for QC Feedback Extraction and Excel Reporting.
Keeps mailbox credentials, recipient emails, SMTP settings, and search filters centralized.
"""

import os
from pathlib import Path

# Paths
CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
ENV_PATH = BACKEND_DIR / ".env"

# Safe loader for .env without requiring third-party libraries
if ENV_PATH.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(ENV_PATH)
    except ImportError:
        try:
            with open(ENV_PATH, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip("\"' ")
                        if k and k not in os.environ:
                            os.environ[k] = v
        except Exception:
            pass

# ==============================================================================
# 1. MAILBOX CONFIGURATION (Reading Emails)
# ==============================================================================
# The email mailbox account to read QC feedback from
MAILBOX_USER = os.getenv("QC_MAILBOX_USER", os.getenv("EMAIL_USER", "AppDevNotification@LoanDNA.com")).strip("\"' ")
MAILBOX_PASS = os.getenv("QC_MAILBOX_PASS", os.getenv("EMAIL_PASS", "#Thor!2rLDraC")).strip("\"' ")

# IMAP Settings (Office 365 default)
IMAP_SERVER = os.getenv("QC_IMAP_SERVER", "outlook.office365.com").strip("\"' ")
IMAP_PORT = int(os.getenv("QC_IMAP_PORT", "993"))
IMAP_USE_SSL = True

# Mailbox Folder to search (e.g., "INBOX", "QC Feedback", "Archive")
MAILBOX_FOLDER = os.getenv("QC_MAILBOX_FOLDER", "INBOX")

# Extraction mode: 'auto' (tries IMAP then Outlook COM), 'imap', or 'outlook'
EXTRACTION_MODE = os.getenv("QC_EXTRACTION_MODE", "auto")

# Keywords in subject line to identify QC feedback emails
SUBJECT_FILTER_KEYWORDS = [
    "QC Feedback",
    "QC Review",
    "Feedback",
    "QC Discrepancy",
    "Audit Feedback",
    "TrueData QC",
    "QC Status"
]

# Days back to search for emails (0 = today only, 7 = last 7 days)
DEFAULT_DAYS_BACK = int(os.getenv("QC_DAYS_BACK", "7"))

# Max number of emails to fetch per run
MAX_EMAILS_FETCH = int(os.getenv("QC_MAX_EMAILS", "100"))

# Whether to mark emails as read (Seen) after processing
MARK_AS_READ = os.getenv("QC_MARK_AS_READ", "False").lower() in ("true", "1", "yes")


# ==============================================================================
# 2. RECIPIENT CONFIGURATION (Sending Generated Excel Report)
# ==============================================================================
# Specified email addresses that will receive the generated QC Feedback Excel
RECIPIENT_EMAILS = [
    "manager@loandna.com",
    "lsaravanan@loandna.com",
    "qc-team@loandna.com",
]

# Allow overriding recipients via environment variable (comma-separated)
_env_recipients = os.getenv("QC_RECIPIENT_EMAILS", "")
if _env_recipients.strip():
    RECIPIENT_EMAILS = [e.strip() for e in _env_recipients.split(",") if e.strip()]


# ==============================================================================
# 3. SMTP CONFIGURATION (Dispatching the Excel Report Email)
# ==============================================================================
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.office365.com").strip("\"' ")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("EMAIL_USER", MAILBOX_USER).strip("\"' ")
SMTP_PASS = os.getenv("EMAIL_PASS", MAILBOX_PASS).strip("\"' ")
SMTP_USE_TLS = True
SENDER_DISPLAY_NAME = "True Data QC Automated Reporting"


# ==============================================================================
# 4. EXCEL EXPORT SETTINGS
# ==============================================================================
OUTPUT_DIR = CURRENT_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

EXCEL_FILENAME_PREFIX = "QC_Feedback_Report"
