import uuid
import json
import base64
import urllib.request
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.project import Project, ProjectClass, Image, Annotation
from app.models.ml import ApiKey
from app.core.security import decrypt_value
from app.services.storage import get_storage
from app.schemas.project import AnnotationResponse
from app.config import settings

router = APIRouter(prefix="/api/v1", tags=["ai"])

@router.post("/projects/{project_id}/images/{image_id}/gemini-assist", response_model=List[AnnotationResponse])
def gemini_assisted_labeling(
    project_id: uuid.UUID,
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    image = db.query(Image).filter(Image.id == image_id, Image.project_id == project_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    classes = db.query(ProjectClass).filter(ProjectClass.project_id == project_id).all()
    if not classes:
        raise HTTPException(status_code=400, detail="Project has no classes defined. Add classes first.")

    class_names = [c.name for c in classes]
    class_name_to_id = {c.name.lower(): c.id for c in classes}

    # Find Gemini API key
    key_record = db.query(ApiKey).filter(ApiKey.service == "gemini", ApiKey.is_active == True).order_by(ApiKey.created_at.desc()).first()
    gemini_key = None
    if key_record:
        gemini_key = decrypt_value(key_record.encrypted_value)

    if not gemini_key:
        raise HTTPException(
            status_code=400,
            detail={"error": {"code": "missing_api_key", "message": "No active Gemini API key found. Please configure an API key in Admin -> API Keys."}}
        )

    # Fetch image preview bytes
    storage = get_storage()
    img_bytes, mime = storage.get_object(image.preview_key)
    if not img_bytes:
        img_bytes, mime = storage.get_object(image.storage_key)
    if not img_bytes:
        raise HTTPException(status_code=404, detail="Image bytes not found in storage")

    b64_image = base64.b64encode(img_bytes).decode("utf-8")
    mime_type = mime or "image/jpeg"

    # Prompt Gemini for object detection bounding boxes
    prompt = f"""
You are an expert computer vision labeling assistant.
Detect all visible instances of these classes: {json.dumps(class_names)}.
Return a JSON array of detected objects.
Each object must have:
- "label": one of {json.dumps(class_names)}
- "box_2d": [ymin, xmin, ymax, xmax] normalized to 0-1000 integer range.

Return ONLY valid JSON matching this schema:
[
  {{"label": "class_name", "box_2d": [ymin, xmin, ymax, xmax]}}
]
"""

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{settings.default_gemini_model}:generateContent?key={gemini_key}"
    req_body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {
                        "inline_data": {
                            "mime_type": mime_type,
                            "data": b64_image
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "response_mime_type": "application/json"
        }
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(req_body).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            raw_text = res_data["candidates"][0]["content"]["parts"][0]["text"]
            parsed = json.loads(raw_text)
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail={"error": {"code": "gemini_error", "message": f"Gemini API request failed: {str(e)}"}}
        )

    # Convert 1000-scale box to image coordinates and save annotations
    created_annotations = []
    w = image.width
    h = image.height

    for item in parsed:
        label = item.get("label", "").strip().lower()
        class_id = class_name_to_id.get(label)
        # Fallback to closest match
        if not class_id:
            for c in classes:
                if c.name.lower() in label or label in c.name.lower():
                    class_id = c.id
                    break
        if not class_id:
            continue

        box = item.get("box_2d", [])
        if len(box) == 4:
            ymin, xmin, ymax, xmax = box
            # convert from 0-1000 to pixel dimensions
            x_min_px = (xmin / 1000.0) * w
            y_min_px = (ymin / 1000.0) * h
            x_max_px = (xmax / 1000.0) * w
            y_max_px = (ymax / 1000.0) * h

            ann = Annotation(
                image_id=image.id,
                class_id=class_id,
                kind="box",
                geometry={
                    "x_min": round(x_min_px, 1),
                    "y_min": round(y_min_px, 1),
                    "x_max": round(x_max_px, 1),
                    "y_max": round(y_max_px, 1),
                },
                created_by=current_user.id,
                source="gemini"
            )
            db.add(ann)
            created_annotations.append(ann)

    db.commit()
    for a in created_annotations:
        db.refresh(a)

    return created_annotations

