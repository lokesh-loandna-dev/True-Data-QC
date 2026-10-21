import os
import uvicorn
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

BACKEND_PORT = int(os.getenv("BACKEND_PORT", 8001))

if __name__ == "__main__":
    print(f"Starting Uvicorn server on port {BACKEND_PORT}...")
    # Run the restructured app
    uvicorn.run("app.main:app", host="0.0.0.0", port=BACKEND_PORT, workers=8)
