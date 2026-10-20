import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.core.security import hash_password
from app.models.user import User
from tests.conftest import TestingSessionLocal

def test_first_run_flow_and_guards():
    client = TestClient(app)

    # 1. Needs setup is true initially
    res = client.get("/api/v1/auth/status")
    assert res.status_code == 200
    assert res.json() == {"needs_setup": True}

    # 2. Setup first admin
    res = client.post("/api/v1/auth/setup", json={
        "name": "Super Admin",
        "username": "admin",
        "password": "AdminPassword123!"
    })
    assert res.status_code == 200
    admin_data = res.json()
    assert admin_data["role"] == "admin"
    assert admin_data["username"] == "admin"
    assert "session_token" in client.cookies

    # 3. Needs setup is now false
    res = client.get("/api/v1/auth/status")
    assert res.status_code == 200
    assert res.json() == {"needs_setup": False}

    # 4. Cannot run setup twice
    res = client.post("/api/v1/auth/setup", json={
        "name": "Another Admin",
        "username": "admin2",
        "password": "AdminPassword123!"
    })
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "setup_completed"

    # 5. /auth/me returns admin
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 200
    assert res.json()["username"] == "admin"

    # 6. Admin creates regular user
    res = client.post("/api/v1/users", json={
        "name": "Normal User",
        "username": "testuser",
        "role": "user",
        "password": "UserPassword123!"
    })
    assert res.status_code == 201
    user_data = res.json()
    assert user_data["username"] == "testuser"
    assert user_data["role"] == "user"

    # 7. Login as regular user
    user_client = TestClient(app)
    res = user_client.post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "UserPassword123!"
    })
    assert res.status_code == 200
    assert res.json()["role"] == "user"

    # 8. Regular user receives 403 on admin routes
    res = user_client.get("/api/v1/users")
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "forbidden"

    res = user_client.get("/api/v1/admin/audit")
    assert res.status_code == 403

    # 9. Admin cannot delete self
    admin_id = admin_data["id"]
    res = client.delete(f"/api/v1/users/{admin_id}")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "cannot_delete_self"

    # 10. Admin cannot disable self
    res = client.patch(f"/api/v1/users/{admin_id}", json={"is_active": False})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "cannot_disable_self"

    # 11. Last active admin cannot be demoted
    res = client.patch(f"/api/v1/users/{admin_id}", json={"role": "user"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "last_admin"

    # 12. Password change works
    res = user_client.post("/api/v1/auth/change-password", json={
        "current_password": "UserPassword123!",
        "new_password": "NewUserPassword456!"
    })
    assert res.status_code == 200

    # Old password no longer works
    res = TestClient(app).post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "UserPassword123!"
    })
    assert res.status_code == 401

    # New password works
    res = TestClient(app).post("/api/v1/auth/login", json={
        "username": "testuser",
        "password": "NewUserPassword456!"
    })
    assert res.status_code == 200

def test_login_failed_lockout():
    client = TestClient(app)
    # Setup admin
    client.post("/api/v1/auth/setup", json={
        "name": "Super Admin",
        "username": "admin",
        "password": "AdminPassword123!"
    })

    bad_client = TestClient(app)
    # 4 wrong attempts
    for _ in range(4):
        res = bad_client.post("/api/v1/auth/login", json={
            "username": "admin",
            "password": "wrongpassword"
        })
        assert res.status_code == 401
        assert res.json()["error"]["code"] == "invalid_credentials"

    # 5th wrong attempt triggers lockout
    res = bad_client.post("/api/v1/auth/login", json={
        "username": "admin",
        "password": "wrongpassword"
    })
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "locked_out"
