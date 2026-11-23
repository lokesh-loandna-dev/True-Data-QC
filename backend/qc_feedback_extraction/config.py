"""
Configuration module for QC Feedback Extraction and Excel Reporting.
Keeps mailbox credentials, recipient emails, SMTP settings, and search filters centralized.
All sensitive settings are loaded strictly from backend/.env.
"""

import os
import re
from pathlib import Path
from typing import List

# Paths
CURRENT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = CURRENT_DIR.parent
ENV_PATH = BACKEND_DIR / ".env"
DEFAULT_SAMPLE_EMAIL_DIR = CURRENT_DIR / "sample_emails"


def load_env_vars():
    """Loads environment variables safely without third-party library dependency."""
    if not ENV_PATH.exists():
        return
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


load_env_vars()


def get_recipients_from_env() -> List[str]:
    """
    Parses RECIPIENT_EMAILS strictly from backend/.env.
    Supports single-line, comma-separated, quoted, or multi-line bracketed formats like:
      RECIPIENT_EMAILS = [
          "user1@company.com",
          user2@company.com
      ]
    """
    recipients = []
    if ENV_PATH.exists():
        try:
            with open(ENV_PATH, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            # Find RECIPIENT_EMAILS definition block
            match = re.search(r"RECIPIENT_EMAILS\s*=\s*(\[[\s\S]*?\]|[^\n\r]+)", content, re.IGNORECASE)
            if match:
                block = match.group(1)
                # Extract all email addresses found within the block
                found = re.findall(r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", block)
                for email_addr in found:
                    cleaned = email_addr.strip().lower()
                    if cleaned and cleaned not in recipients:
                        recipients.append(cleaned)
        except Exception as e:
            print(f"[Config] Notice reading recipients from .env: {e}")

    return recipients


# ==============================================================================
# 1. RECIPIENT EMAILS (Strictly loaded from .env)
# ==============================================================================
RECIPIENT_EMAILS = get_recipients_from_env()


# ==============================================================================
# 2. SMTP CONFIGURATION (Strictly loaded from .env)
# ==============================================================================
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.office365.com").strip("\"' ")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("EMAIL_USER", "").strip("\"' ")
SMTP_PASS = os.getenv("EMAIL_PASS", "").strip("\"' ")
SMTP_USE_TLS = True
SENDER_DISPLAY_NAME = "True Data QC Automated Reporting"


# ==============================================================================
# 3. EXCEL EXPORT SETTINGS
# ==============================================================================
OUTPUT_DIR = CURRENT_DIR / "output"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
EXCEL_FILENAME_PREFIX = "QC_Feedback_Report"


# ==============================================================================
# 4. OPTIONAL MAILBOX CONFIGURATION (If IMAP is ever used)
# ==============================================================================
MAILBOX_USER = os.getenv("QC_MAILBOX_USER", SMTP_USER).strip("\"' ")
MAILBOX_PASS = os.getenv("QC_MAILBOX_PASS", SMTP_PASS).strip("\"' ")
IMAP_SERVER = os.getenv("QC_IMAP_SERVER", "outlook.office365.com").strip("\"' ")
IMAP_PORT = int(os.getenv("QC_IMAP_PORT", "993"))
MAILBOX_FOLDER = os.getenv("QC_MAILBOX_FOLDER", "INBOX")
SUBJECT_FILTER_KEYWORDS = [
    "QC Feedback",
    "QC Review",
    "Feedback",
    "QC Discrepancy",
    "Audit Feedback",
    "TrueData QC",
    "QC Status"
]
DEFAULT_DAYS_BACK = int(os.getenv("QC_DAYS_BACK", "7"))
MAX_EMAILS_FETCH = int(os.getenv("QC_MAX_EMAILS", "100"))
MARK_AS_READ = False
