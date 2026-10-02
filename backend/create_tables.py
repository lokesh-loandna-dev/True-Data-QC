import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables from .env
load_dotenv()

SQL_FILE_PATH = os.path.join(os.path.dirname(__file__), "sql", "create_tables.sql")

def get_database_url():
    url = os.getenv("DATABASE_URL")
    if not url:
        raise ValueError("DATABASE_URL environment variable is not set in .env")
    return url

def create_tables(engine_instance=None):
    """
    Connects to the target database and executes table creation queries from sql/create_tables.sql.
    """
    if not os.path.exists(SQL_FILE_PATH):
        raise FileNotFoundError(f"SQL file not found at: {SQL_FILE_PATH}")

    with open(SQL_FILE_PATH, "r", encoding="utf-8") as f:
        sql_script = f.read()

    db_url = get_database_url()
    target_engine = engine_instance or create_engine(db_url)

    print("Executing table creation queries from sql/create_tables.sql...")
    try:
        with target_engine.connect() as conn:
            # SQL Server batch execution: Split on 'GO' if present, otherwise execute non-empty statements safely
            import re
            raw_batches = re.split(r'^\s*GO\s*$', sql_script, flags=re.MULTILINE | re.IGNORECASE)
            
            for batch in raw_batches:
                cleaned_batch = batch.strip()
                if not cleaned_batch:
                    continue
                # If there are no GO statements and script contains semicolons at top level,
                # remove individual block semicolons or run batch as a single execution
                conn.execute(text(cleaned_batch))
            conn.commit()
        print("All tables created / verified successfully!")
        return True
    except Exception as e:
        print(f"Error creating tables: {e}")
        return False
    finally:
        if not engine_instance:
            target_engine.dispose()

if __name__ == "__main__":
    create_tables()
