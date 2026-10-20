import io
import json
import pytest
from fastapi.testclient import TestClient
from app.main import app

def create_admin_client():
    c = TestClient(app)
    c.post("/api/v1/auth/setup", json={
        "name": "Admin Tester",
        "username": "admintest",
        "password": "AdminPassword123!"
    })
    return c

def test_admin_settings_lifecycle():
    client = create_admin_client()

    # Get settings
    res = client.get("/api/v1/admin/settings")
    assert res.status_code == 200
    data = res.json()
    assert "workspace_name" in data

    # Update settings
    update_res = client.put(
        "/api/v1/admin/settings",
        json={"settings": {"workspace_name": "AnoBot Enterprise", "min_password_length": 10}}
    )
    assert update_res.status_code == 200

    # Verify update
    get_res = client.get("/api/v1/admin/settings")
    assert get_res.status_code == 200
    assert get_res.json()["workspace_name"] == "AnoBot Enterprise"
    assert get_res.json()["min_password_length"] == 10

def test_admin_backup_and_restore():
    client = create_admin_client()

    # Export backup
    backup_res = client.get("/api/v1/admin/backup")
    assert backup_res.status_code == 200
    backup_data = backup_res.json()
    assert "users" in backup_data
    assert "settings" in backup_data

    # Restore from the generated backup
    restore_file = io.BytesIO(json.dumps(backup_data).encode("utf-8"))
    files = {"file": ("backup.json", restore_file, "application/json")}
    restore_res = client.post("/api/v1/admin/restore", files=files)
    assert restore_res.status_code == 200
    assert restore_res.json()["status"] == "ok"

def test_universe_catalog_and_fork():
    client = create_admin_client()

    # Browse universe
    res = client.get("/api/v1/universe")
    assert res.status_code == 200
    items = res.json()
    assert len(items) > 0
    first_item = items[0]

    # Fork dataset into new project
    fork_res = client.post(f"/api/v1/universe/{first_item['id']}/fork")
    assert fork_res.status_code == 200
    fork_data = fork_res.json()
    assert fork_data["status"] == "ok"
    assert "project" in fork_data
    assert "Fork" in fork_data["project"]["name"]

def test_deploy_keys_lifecycle():
    client = create_admin_client()

    # Create project
    proj_res = client.post(
        "/api/v1/projects",
        json={"name": "Deploy Key Test Project", "type": "detect"}
    )
    assert proj_res.status_code == 201
    proj_id = proj_res.json()["id"]

    # Create deploy key
    key_res = client.post(
        f"/api/v1/projects/{proj_id}/deploy-keys",
        json={"name": "Production Edge Key"}
    )
    assert key_res.status_code == 201
    key_data = key_res.json()
    assert key_data["raw_key"] is not None
    assert key_data["raw_key"].startswith("ano_live_")
    key_id = key_data["id"]

    # List deploy keys
    list_res = client.get(f"/api/v1/projects/{proj_id}/deploy-keys")
    assert list_res.status_code == 200
    keys_list = list_res.json()
    assert len(keys_list) >= 1
    assert keys_list[0]["raw_key"] is None  # Should not expose raw token on list

    # Revoke deploy key
    del_res = client.delete(f"/api/v1/deploy-keys/{key_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "ok"

def test_workflows_lifecycle():
    client = create_admin_client()

    # Create project
    proj_res = client.post(
        "/api/v1/projects",
        json={"name": "Workflow Project", "type": "detect"}
    )
    proj_id = proj_res.json()["id"]

    # Create workflow
    wf_res = client.post(
        f"/api/v1/projects/{proj_id}/workflows",
        json={
            "name": "Auto Defect Filter",
            "blocks": [{"type": "input"}, {"type": "yolo_inference"}, {"type": "confidence_filter", "threshold": 0.5}],
            "is_api_enabled": True
        }
    )
    assert wf_res.status_code == 200
    wf_data = wf_res.json()
    wf_id = wf_data["id"]

    # List workflows
    list_res = client.get(f"/api/v1/projects/{proj_id}/workflows")
    assert list_res.status_code == 200
    assert len(list_res.json()) >= 1

    # Run workflow on test image
    dummy_img = io.BytesIO(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00\xff\xdb\x00C\x00")
    files = {"file": ("test.jpg", dummy_img, "image/jpeg")}
    run_res = client.post(f"/api/v1/workflows/{wf_id}/run", files=files)
    assert run_res.status_code == 200
    assert "logs" in run_res.json()
    assert "detections" in run_res.json()

