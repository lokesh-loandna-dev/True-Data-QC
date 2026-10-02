import os
import re
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
BACKEND_PORT = int(os.getenv("BACKEND_PORT", 5000))
SECRET_KEY = os.getenv("SECRET_KEY", "ops_qc_secret_key_2026")

EMAIL_REGEX = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
