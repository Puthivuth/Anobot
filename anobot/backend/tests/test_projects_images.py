import io
import pytest
from PIL import Image as PILImage
from fastapi.testclient import TestClient
from app.main import app

def create_sample_jpeg():
    img = PILImage.new("RGB", (640, 480), color=(255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()

def test_project_lifecycle_and_type_lock():
    client = TestClient(app)

    # 1. Setup admin
    client.post("/api/v1/auth/setup", json={
        "name": "Admin User",
        "username": "admin",
        "password": "AdminPassword123!"
    })

    # 2. Create project
    res = client.post("/api/v1/projects", json={
        "name": "Traffic Camera",
        "type": "detect"
    })
    assert res.status_code == 201
    proj = res.json()
    proj_id = proj["id"]
    assert proj["name"] == "Traffic Camera"
    assert proj["type"] == "detect"

    # Default classes should be seeded
    res = client.get(f"/api/v1/projects/{proj_id}/classes")
    assert res.status_code == 200
    classes = res.json()
    assert len(classes) == 3
    class_id = classes[0]["id"]

    # 3. Add custom class
    res = client.post(f"/api/v1/projects/{proj_id}/classes", json={
        "name": "motorcycle",
        "color": "#ff0000"
    })
    assert res.status_code == 201
    moto_class = res.json()

    # 4. Upload image
    jpeg_bytes = create_sample_jpeg()
    res = client.post(
        f"/api/v1/projects/{proj_id}/images",
        files={"files": ("test1.jpg", jpeg_bytes, "image/jpeg")}
    )
    assert res.status_code == 200
    upload_data = res.json()
    assert upload_data["uploaded_count"] == 1
    image_id = upload_data["images"][0]["id"]

    # 5. Type can be changed before annotations exist
    res = client.patch(f"/api/v1/projects/{proj_id}", json={"type": "segment"})
    assert res.status_code == 200
    assert res.json()["type"] == "segment"

    # 6. Add annotation
    res = client.post(f"/api/v1/projects/{proj_id}/images/{image_id}/annotations", json={
        "class_id": moto_class["id"],
        "kind": "box",
        "geometry": {"x_min": 10, "y_min": 10, "x_max": 100, "y_max": 100}
    })
    assert res.status_code == 201

    # 7. Type CANNOT be changed after annotation exists (Section 5 rule)
    res = client.patch(f"/api/v1/projects/{proj_id}", json={"type": "keypoint"})
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "type_locked"

    # 8. Batch save annotations (e.g. from canvas autosave)
    res = client.put(f"/api/v1/projects/{proj_id}/images/{image_id}/annotations", json={
        "annotations": [
            {
                "class_id": class_id,
                "kind": "box",
                "geometry": {"x_min": 20, "y_min": 20, "x_max": 200, "y_max": 200}
            }
        ]
    })
    assert res.status_code == 200
    assert len(res.json()) == 1

    # 9. List images with filter
    res = client.get(f"/api/v1/projects/{proj_id}/images?filter=labeled")
    assert res.status_code == 200
    assert res.json()["total"] == 1

    # 10. Delete project cascades clean
    res = client.delete(f"/api/v1/projects/{proj_id}")
    assert res.status_code == 200
    res = client.get(f"/api/v1/projects/{proj_id}")
    assert res.status_code == 404
