from sqlalchemy import create_engine, text
from app.config import DATABASE_URL

# Thread-safe global DB connection status
db_status = {"connected": False, "error": None}

engine = None
if DATABASE_URL:
    try:
        engine = create_engine(
            DATABASE_URL,
            pool_size=5,          # 8 workers × 5 = 40 idle connections
            max_overflow=5,       # burst to 10 per worker → 80 total, well under GP Gen5 2vCore limit (420)
            pool_timeout=30,      # queue for up to 30s before raising; covers 300-400 user peak
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
                try:
                    connection.execute(text("""
                        IF EXISTS (SELECT * FROM sysobjects WHERE name='loan_packages' AND xtype='U')
                        BEGIN
                            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('loan_packages') AND name = 'review_required')
                            BEGIN
                                ALTER TABLE loan_packages ADD review_required INT NULL DEFAULT 0;
                            END
                        END
                    """))
                    connection.commit()
                except Exception as migration_err:
                    print(f"Warning: review_required column migration check skipped: {migration_err}")

                try:
                    connection.execute(text("""
                        IF EXISTS (SELECT * FROM sysobjects WHERE name='users' AND xtype='U')
                        BEGIN
                            IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'status')
                            BEGIN
                                ALTER TABLE users ADD status VARCHAR(50) NOT NULL DEFAULT 'inactive';
                                EXEC('UPDATE users SET status = ''active'' WHERE status = ''inactive''');
                            END
                        END
                    """))
                    connection.commit()
                except Exception as user_migration_err:
                    print(f"Warning: users status column migration check skipped: {user_migration_err}")
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

