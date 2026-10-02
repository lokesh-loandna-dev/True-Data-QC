import os
from urllib.parse import urlparse, urlunparse
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables from .env
load_dotenv()

def get_database_url():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise ValueError("DATABASE_URL environment variable is not set in .env")
    return url

def create_db():
    """
    Reads DATABASE_URL from .env, extracts the target database name,
    connects to the master/system database, and creates the database if it doesn't exist.
    """
    db_url = get_database_url()
    
    # SQLite local dev check
    if db_url.startswith("sqlite"):
        print("SQLite detected. Database file is auto-created on connection.")
        return True

    parsed = urlparse(db_url)
    db_name = parsed.path.lstrip('/')

    if not db_name or db_name.lower() == 'master':
        print("Target database is master or empty. Skipping creation.")
        return True

    # Build master URL for connecting to system DB to issue CREATE DATABASE
    master_url = urlunparse(parsed._replace(path='/master'))
    print(f"Checking existence of database '{db_name}' using system connection...")

    try:
        engine = create_engine(master_url)
        with engine.connect() as conn:
            conn = conn.execution_options(isolation_level="AUTOCOMMIT")
            
            check_sql = text("SELECT database_id FROM sys.databases WHERE name = :dbname")
            result = conn.execute(check_sql, {"dbname": db_name}).fetchone()
            
            if not result:
                print(f"Database '{db_name}' does not exist. Creating database...")
                conn.execute(text(f"CREATE DATABASE [{db_name}]"))
                print(f"Database '{db_name}' created successfully!")
            else:
                print(f"Database '{db_name}' already exists.")
                
        engine.dispose()
        return True
    except Exception as e:
        print(f"Error creating database '{db_name}': {e}")
        return False

if __name__ == "__main__":
    create_db()
