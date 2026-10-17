from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.config import DATABASE_URL, BACKEND_PORT
from app.database.connection import engine, db_status, init_db
from app.database.operations import purge_old_audit_logs
from app.auth import router as auth_router
from app.routers.users import router as users_router
from app.routers.data_dictionary import router as data_dictionary_router
from app.routers.loans import router as loans_router
from app.logger import log_event, cleanup_old_logs

from prohance.app.main import router as prohance_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Purge file and database logs older than 3 days
    cleanup_old_logs(retention_days=3)
    purge_old_audit_logs(retention_days=3)

    # Startup logic
    log_event("INFO", "SERVER_STARTUP", f"Starting OPS_QC Backend API on port {BACKEND_PORT}")
    init_db()
    if db_status["connected"]:
        log_event("INFO", "DB_CONNECT", "Successfully connected to SQL database")
    else:
        log_event("ERROR", "DB_CONNECT_FAILED", f"Database connection issue: {db_status.get('error')}")
    yield
    # Shutdown logic
    if engine:
        engine.dispose()
        log_event("INFO", "SERVER_SHUTDOWN", "Database engine disposed and server shut down cleanly")


app = FastAPI(
    title="OPS_QC Backend API",
    description="FastAPI backend connected to Microsoft SQL Server via pymssql.",
    version="1.0.0",
    lifespan=lifespan
)

# Exception handling middleware to clearly log any unhandled server errors
@app.middleware("http")
async def log_requests_and_exceptions(request: Request, call_next):
    try:
        response = await call_next(request)
        return response
    except Exception as exc:
        issue = f"Unhandled Exception on {request.method} {request.url.path}: {str(exc)}"
        log_event("ERROR", "UNHANDLED_EXCEPTION", issue)
        return JSONResponse(
            status_code=500,
            content={"status": "error", "detail": "Internal Server Error"}
        )

# Enable CORS middleware — restrict to known origins only.
# allow_origins=["*"] + allow_credentials=True is browser-rejected; never combine them.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)

# Include Routers
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(data_dictionary_router)
app.include_router(loans_router)
app.include_router(prohance_router)

@app.get("/")
def read_root():
    return {
        "status": "success",
        "message": "Uvicorn server is running successfully!",
        "port": BACKEND_PORT
    }

@app.get("/db-status")
def get_db_status():
    """
    Checks connection to the SQL Server database and returns status.
    """
    if not engine:
        issue = f"DB status check failed: Database engine not initialized. {db_status.get('error')}"
        log_event("WARNING", "DB_STATUS_CHECK", issue)
        return {
            "status": "disconnected",
            "error": db_status["error"] or "Database engine not initialized"
        }
        
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        
        # Obfuscate credentials before returning the URL
        masked_url = DATABASE_URL
        if "@" in DATABASE_URL:
            prefix, host_part = DATABASE_URL.split("@", 1)
            protocol = prefix.split("//", 1)[0] + "//" if "//" in prefix else ""
            masked_url = f"{protocol}***@{host_part}"
            
        return {
            "status": "connected",
            "database_url": masked_url,
            "error": None
        }
    except Exception as e:
        issue = f"DB status check query failed: {str(e)}"
        log_event("ERROR", "DB_STATUS_CHECK", issue)
        return {
            "status": "disconnected",
            "error": str(e)
        }
