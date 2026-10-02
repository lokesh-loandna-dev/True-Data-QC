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
    finally:
        db.close()


def init_db(target_engine=None) -> None:
    """Create all Prohance tables if they don't already exist."""
    from . import models  # noqa: F401  (ensures models are registered on Base)

    eng = target_engine or engine
    Base.metadata.create_all(bind=eng)
