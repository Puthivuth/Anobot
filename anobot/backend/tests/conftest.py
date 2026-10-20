import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from app.main import app as fastapi_app
from app.core.db import Base, get_db
from app.core.security import clear_failed_attempts
from app.services import storage
# Import models to register tables
import app.models.user
import app.models.project
import app.models.ml

import os

# File-backed SQLite for reliable multi-threaded worker test execution
SQLALCHEMY_DATABASE_URL = "sqlite:////tmp/anobot_test.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

fastapi_app.dependency_overrides[get_db] = override_get_db

class FakeStorage:
    def __init__(self):
        self.data = {}
    def upload_bytes(self, key: str, data: bytes, content_type: str = "image/jpeg"):
        self.data[key] = (data, content_type)
        return key
    def get_object(self, key: str):
        return self.data.get(key, (None, None))
    def delete_object(self, key: str):
        self.data.pop(key, None)

@pytest.fixture(autouse=True)
def setup_database(monkeypatch):
    clear_failed_attempts("user:admin")
    clear_failed_attempts("user:testuser")
    clear_failed_attempts("ip:testclient")
    fake_s3 = FakeStorage()
    monkeypatch.setattr(storage, "get_storage", lambda: fake_s3)
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def client():
    return TestClient(app)
