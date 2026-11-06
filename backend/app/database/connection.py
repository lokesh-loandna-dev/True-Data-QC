from sqlalchemy import create_engine, text
from app.config import DATABASE_URL

# Thread-safe global DB connection status
db_status = {"connected": False, "error": None}

engine = None
if DATABASE_URL:
    try:
        _engine_kwargs = dict(
            pool_size=5,          # 8 workers × 5 = 40 idle connections
            max_overflow=5,       # burst to 10 per worker → 80 total, well under GP Gen5 2vCore limit (420)
            pool_timeout=30,      # queue for up to 30s before raising; covers 300-400 user peak
            pool_pre_ping=True,   # detects stale connections before use
            pool_recycle=1800,    # 30 min — GP Gen5 idles out connections at ~30 min
        )
        # fast_executemany is a pyodbc-only optimisation: batch executemany into a single
        # round-trip instead of one TDS call per row. Silently not applicable on pymssql.
        if "pyodbc" in DATABASE_URL:
            _engine_kwargs["fast_executemany"] = True
        engine = create_engine(DATABASE_URL, **_engine_kwargs)
    except Exception as e:
        db_status["error"] = str(e)

def init_db():
    global db_status
    print("Testing connection to database...")

    if engine:
        try:
            with engine.begin() as connection:
                connection.execute(text("SELECT 1"))
                # DML-only migration: normalise legacy role value written by older code.
                # Safe to re-run; becomes a no-op once all rows are updated.
                try:
                    connection.execute(text("""
                        IF EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
                        BEGIN
                            UPDATE users SET role = 'Pre Underwriter' WHERE LOWER(role) = 'pre underwrite';
                        END
                    """))
                except Exception as role_err:
                    print(f"Warning: role migration check skipped: {role_err}")
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

