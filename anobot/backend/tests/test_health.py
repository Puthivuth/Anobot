from fastapi.testclient import TestClient
from app.main import app

def test_health_endpoint():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "anobot-api"}

def test_first_run_status_shape():
    response = TestClient(app).get("/api/v1/auth/status")
    assert response.status_code == 200
    assert response.json() == {"needs_setup": True}
