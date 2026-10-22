import os
import re
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", 5000))
SECRET_KEY = os.getenv("SECRET_KEY", "ops_qc_secret_key_2026")

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")

# Email / SMTP Configuration
EMAIL_USER = (os.getenv("EMAIL_USER") or "").strip("\"' ")
EMAIL_PASS = (os.getenv("EMAIL_PASS") or "").strip("\"' ")
SMTP_SERVER = (os.getenv("SMTP_SERVER") or "smtp.office365.com").strip("\"' ")
SMTP_PORT = int(os.getenv("SMTP_PORT") or 587)
