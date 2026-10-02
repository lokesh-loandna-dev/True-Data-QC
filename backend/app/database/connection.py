from sqlalchemy import create_engine, text
from app.config import DATABASE_URL
from create_db import create_db
from create_tables import create_tables

# Thread-safe global DB connection status
db_status = {"connected": False, "error": None}

engine = None
if DATABASE_URL:
    try:
        engine = create_engine(
            DATABASE_URL,
            pool_size=5,          # 16 workers × 5 = 80 idle connections max
            max_overflow=5,       # burst to 10 per worker → 160 total, well under GP Gen5 2vCore limit (420)
            pool_timeout=30,      # fail fast if no connection available
            pool_pre_ping=True,   # detects stale connections before use
            pool_recycle=1800     # 30 min — GP Gen5 idles out connections at ~30 min
        )
    except Exception as e:
        db_status["error"] = str(e)

def init_db():
    global db_status
    print("Testing connection to database...")
    
    if engine:
        try:
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
                connection.commit()
            db_status["connected"] = True
            db_status["error"] = None
            print("Successfully connected to the database!")
        except Exception as e:
            db_status["connected"] = False
            db_status["error"] = str(e)
            print(f"Database connection failed: {e}")
    else:
        db_status["connected"] = False
        if not db_status["error"]:
            db_status["error"] = "DATABASE_URL environment variable is missing or invalid"
        print(db_status["error"])

