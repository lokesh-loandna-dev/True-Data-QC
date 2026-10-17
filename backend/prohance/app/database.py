"""
Database connectivity for the Prohance module.

Uses the same SQLAlchemy engine as the main ops_qc app — one engine,
one connection pool for the whole application.
"""

from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.database.connection import engine


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: yields a request-scoped ORM session."""
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def init_db(target_engine=None) -> None:
    """Tables are created via sql/create_tables.sql at deployment; nothing to do here."""
    pass
