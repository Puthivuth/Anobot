import uuid
from datetime import datetime, timezone
from sqlalchemy import create_engine, DateTime
from sqlalchemy.orm import declarative_base, sessionmaker, scoped_session
from sqlalchemy.dialects.postgresql import UUID
from app.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

