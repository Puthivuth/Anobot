import io
import zipfile
import pytest
from PIL import Image as PILImage
from fastapi.testclient import TestClient
from app.main import app

def create_sample_jpeg():
    img = PILImage.new("RGB", (640, 480), color=(0, 255, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()

def test_versions_and_training_flow():
    client = TestClient(app)

    # 1. Setup Admin
    client.post("/api/v1/auth/setup", json={
        "name": "Admin ML",
        "username": "admin",
        "password": "AdminPassword123!"
    })

    # 2. Create Project
    res = client.post("/api/v1/projects", json={
        "name": "Drone Vision",
        "type": "detect"
    })
    assert res.status_code == 201
    proj_id = res.json()["id"]

    # 3. Upload images
    res = client.post(
        f"/api/v1/projects/{proj_id}/images",
        files={"files": ("drone1.jpg", create_sample_jpeg(), "image/jpeg")}
    )
    assert res.status_code == 200
    img_id = res.json()["images"][0]["id"]

    # 4. Get classes and annotate
    classes = client.get(f"/api/v1/projects/{proj_id}/classes").json()
    client.post(f"/api/v1/projects/{proj_id}/images/{img_id}/annotations", json={
        "class_id": classes[0]["id"],
        "kind": "box",
        "geometry": {"x_min": 50, "y_min": 50, "x_max": 200, "y_max": 200}
    })

    # 5. Generate Dataset Version
    res = client.post(f"/api/v1/projects/{proj_id}/versions", json={
        "name": "v1.0",
        "splits": {"train": 70, "val": 20, "test": 10},
        "format": "yolov8"
    })
    assert res.status_code == 201
    ver_data = res.json()
    ver_id = ver_data["id"]
    assert ver_data["version_number"] == 1
    assert ver_data["image_count"] == 1

    # 6. Download Dataset Version ZIP and inspect contents
    res = client.get(f"/api/v1/projects/{proj_id}/versions/{ver_id}/download")
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/zip"
    zf = zipfile.ZipFile(io.BytesIO(res.content))
    file_list = zf.namelist()
    assert "data.yaml" in file_list
    assert any(f.startswith("images/") for f in file_list)
    assert any(f.startswith("labels/") for f in file_list)

    # 7. Start Training Job
    res = client.post(f"/api/v1/projects/{proj_id}/train", json={
        "version_id": ver_id,
        "model_name": "yolov8n",
        "epochs": 10,
        "batch_size": 8,
        "img_size": 640
    })
    assert res.status_code == 201
    job = res.json()
    job_id = job["id"]
    assert job["status"] == "queued"
    assert job["model_name"] == "yolov8n"

    # 8. Cancel Training Job
    res = client.post(f"/api/v1/training/jobs/{job_id}/cancel")
    assert res.status_code == 200
    res = client.get(f"/api/v1/training/jobs/{job_id}")
    assert res.status_code == 200
    assert res.json()["status"] == "cancelled"

    # 9. Admin API Keys CRUD
    res = client.post("/api/v1/admin/api-keys", json={
        "name": "Primary Gemini Key",
        "service": "gemini",
        "value": "AIzaSyTestApiKeySecretValue12345"
    })
    assert res.status_code == 201
    key_data = res.json()
    assert "AIza" in key_data["masked_value"]
    assert "Secret" not in key_data["masked_value"]
    key_id = key_data["id"]

    # List keys
    res = client.get("/api/v1/admin/api-keys")
    assert res.status_code == 200
    assert len(res.json()) >= 1

    # Delete key
    res = client.delete(f"/api/v1/admin/api-keys/{key_id}")
    assert res.status_code == 200

