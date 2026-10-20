import io
import os
import uuid
import json
import base64
import hashlib
import secrets
from pathlib import Path
from typing import List, Optional, Any
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form, Header, Request
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from PIL import Image as PILImage

from app.core.db import get_db
from app.core.deps import get_current_user_optional, get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.ml import TrainingJob, DeployKey
from app.config import settings
from app.services.storage import storage_service

router = APIRouter(prefix="/api/v1", tags=["inference"])

# In-memory model cache: model_id -> YOLO instance
MODEL_CACHE = {}

class DeployKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)

class DeployKeyResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    last4: str
    revoked_at: Optional[datetime]
    created_at: datetime
    raw_key: Optional[str] = None  # Returned only upon creation


def _verify_deploy_key(auth_header: Optional[str], db: Session) -> Optional[DeployKey]:
    if not auth_header or not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1].strip()
    key_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    dk = db.query(DeployKey).filter(
        DeployKey.key_hash == key_hash,
        DeployKey.revoked_at.is_(None)
    ).first()
    return dk


# Deploy Keys Management
@router.post("/projects/{project_id}/deploy-keys", response_model=DeployKeyResponse, status_code=status.HTTP_201_CREATED)
def create_deploy_key(
    project_id: uuid.UUID,
    payload: DeployKeyCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    raw_token = f"ano_live_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
    last4 = raw_token[-4:]

    dk = DeployKey(
        project_id=project_id,
        name=payload.name,
        key_hash=key_hash,
        last4=last4,
        created_by=current_user.id
    )
    db.add(dk)
    db.commit()
    db.refresh(dk)

    res = DeployKeyResponse(
        id=dk.id,
        project_id=dk.project_id,
        name=dk.name,
        last4=dk.last4,
        revoked_at=dk.revoked_at,
        created_at=dk.created_at,
        raw_key=raw_token
    )
    return res


@router.get("/projects/{project_id}/deploy-keys", response_model=List[DeployKeyResponse])
def list_deploy_keys(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    keys = db.query(DeployKey).filter(DeployKey.project_id == project_id).order_by(DeployKey.created_at.desc()).all()
    return [
        DeployKeyResponse(
            id=k.id,
            project_id=k.project_id,
            name=k.name,
            last4=k.last4,
            revoked_at=k.revoked_at,
            created_at=k.created_at,
            raw_key=None
        )
        for k in keys
    ]


@router.delete("/deploy-keys/{key_id}")
def revoke_deploy_key(
    key_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    dk = db.query(DeployKey).filter(DeployKey.id == key_id).first()
    if not dk:
        raise HTTPException(status_code=404, detail="Deploy key not found")
    dk.revoked_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "ok", "message": "Deploy key revoked"}


# Model Details, Weights, and Streaming (Section 9.3)
@router.get("/models/{model_id}")
def get_model_details(
    model_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(TrainingJob).filter(TrainingJob.id == model_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Model not found")
    return {
        "id": job.id,
        "project_id": job.project_id,
        "version_id": job.version_id,
        "model_name": job.model_name,
        "task": job.task,
        "epochs": job.epochs,
        "status": job.status,
        "progress": job.progress,
        "metrics": job.metrics,
        "weights_key": job.weights_key,
        "onnx_key": job.onnx_key,
        "created_at": job.created_at,
        "finished_at": job.finished_at,
    }


@router.post("/models/{model_id}/stop")
def stop_model_training(
    model_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from app.routers.training import cancel_training_job
    return cancel_training_job(model_id, db=db, current_user=current_user)


@router.get("/models/{model_id}/weights")
def download_model_weights(
    model_id: uuid.UUID,
    format: str = "pt",
    db: Session = Depends(get_db)
):
    job = db.query(TrainingJob).filter(TrainingJob.id == model_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Model not found")

    target_key = job.onnx_key if format.lower() == "onnx" else job.weights_key
    if not target_key:
        raise HTTPException(status_code=404, detail=f"No {format.upper()} weights available for this model yet.")

    s3 = storage_service.get_s3_client()
    try:
        obj = s3.get_object(Bucket=settings.s3_bucket, Key=target_key)
        ext = "onnx" if format.lower() == "onnx" else "pt"
        filename = f"{job.model_name}_{str(job.id)[:8]}.{ext}"
        return StreamingResponse(
            obj["Body"],
            media_type="application/octet-stream",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch weights: {e}")


def _load_cached_model(job_or_name: str, weights_key: Optional[str] = None):
    """Loads a YOLO model into memory with simple in-memory caching."""
    if job_or_name in MODEL_CACHE:
        return MODEL_CACHE[job_or_name]

    from ultralytics import YOLO

    if weights_key:
        cache_dir = Path("/tmp/anobot_model_cache")
        cache_dir.mkdir(parents=True, exist_ok=True)
        local_weights = cache_dir / f"{job_or_name}.pt"
        if not local_weights.exists():
            s3 = storage_service.get_s3_client()
            s3.download_file(settings.s3_bucket, weights_key, str(local_weights))
        model = YOLO(str(local_weights))
    else:
        model = YOLO(f"{job_or_name}.pt")

    MODEL_CACHE[job_or_name] = model
    return model


# POST /api/v1/infer/{model_id} (Section 7.5, 9.3)
@router.post("/infer/{model_id}")
async def run_inference(
    model_id: str,
    request: Request,
    file: Optional[UploadFile] = File(None),
    image_base64: Optional[str] = Form(None),
    confidence: float = Form(0.25),
    iou: float = Form(0.45),
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
    current_user: Optional[User] = Depends(get_current_user_optional)
):
    # Verify Auth: Either active user session OR valid deploy key
    deploy_key = None
    if not current_user:
        deploy_key = _verify_deploy_key(authorization, db)
        if not deploy_key:
            raise HTTPException(status_code=401, detail="Authentication required (sign in or provide valid Bearer deploy key)")

    # Resolve image bytes
    img_bytes = None
    if file:
        img_bytes = await file.read()
    elif image_base64:
        # Strip data:image/...;base64, prefix if present
        if "," in image_base64:
            image_base64 = image_base64.split(",", 1)[1]
        img_bytes = base64.b64decode(image_base64)
    else:
        # Check raw body
        body = await request.body()
        if body:
            img_bytes = body
        else:
            raise HTTPException(status_code=400, detail="Image file or base64 payload required")

    try:
        pil_img = PILImage.open(io.BytesIO(img_bytes)).convert("RGB")
        img_w, img_h = pil_img.size
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image format: {e}")

    # Determine model and task
    # Check if model_id is a UUID of a trained job
    task = "detect"
    weights_key = None
    try:
        job_uuid = uuid.UUID(model_id)
        job = db.query(TrainingJob).filter(TrainingJob.id == job_uuid).first()
        if not job or not job.weights_key:
            raise HTTPException(status_code=404, detail="Trained model not found or has no weights")
        task = job.task
        weights_key = job.weights_key
        model_key = str(job.id)
    except ValueError:
        # Pretrained stock model (e.g. yolov8n, yolov8s)
        model_key = model_id
        task = "detect"

    try:
        model = _load_cached_model(model_key, weights_key=weights_key)
        results = model.predict(pil_img, conf=confidence, iou=iou, verbose=False)
        first_res = results[0]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference execution failed: {e}")

    # Format output by project type strictly according to Section 9.3 of specification
    names = getattr(first_res, "names", {})
    output = []

    if task == "classify" or hasattr(first_res, "probs") and first_res.probs is not None:
        probs = first_res.probs
        top1_idx = int(probs.top1)
        label_name = names.get(top1_idx, f"class_{top1_idx}")
        top1_conf = round(float(probs.top1conf), 4)
        return [{ "label": label_name, "confidence": top1_conf }]

    if task == "segment" and hasattr(first_res, "masks") and first_res.masks is not None:
        masks = first_res.masks
        boxes = first_res.boxes
        for i, mask in enumerate(masks.xy):
            # Normalize polygon points to 0-1
            norm_pts = [[round(pt[0] / img_w, 4), round(pt[1] / img_h, 4)] for pt in mask]
            cls_id = int(boxes.cls[i].item()) if boxes is not None else 0
            conf = round(float(boxes.conf[i].item()), 4) if boxes is not None else 1.0
            label_name = names.get(cls_id, f"class_{cls_id}")
            output.append({
                "label": label_name,
                "confidence": conf,
                "polygon": norm_pts
            })
        return output

    if task == "keypoint" and hasattr(first_res, "keypoints") and first_res.keypoints is not None:
        kpts = first_res.keypoints
        boxes = first_res.boxes
        for i in range(len(kpts.data)):
            pts_data = kpts.data[i].tolist()
            norm_kpts = []
            for kp in pts_data:
                # kp: [x, y, conf]
                norm_kpts.append([
                    round(kp[0] / img_w, 4),
                    round(kp[1] / img_h, 4),
                    round(kp[2], 2) if len(kp) > 2 else 1.0
                ])
            cls_id = int(boxes.cls[i].item()) if boxes is not None else 0
            conf = round(float(boxes.conf[i].item()), 4) if boxes is not None else 1.0
            label_name = names.get(cls_id, f"class_{cls_id}")
            output.append({
                "label": label_name,
                "confidence": conf,
                "keypoints": norm_kpts
            })
        return output

    if task == "obb" and hasattr(first_res, "obb") and first_res.obb is not None:
        obbs = first_res.obb
        for i in range(len(obbs.xywhr)):
            cx, cy, w, h, angle = obbs.xywhr[i].tolist()
            cls_id = int(obbs.cls[i].item())
            conf = round(float(obbs.conf[i].item()), 4)
            label_name = names.get(cls_id, f"class_{cls_id}")
            output.append({
                "label": label_name,
                "confidence": conf,
                "obb": {
                    "cx": round(cx / img_w, 4),
                    "cy": round(cy / img_h, 4),
                    "w": round(w / img_w, 4),
                    "h": round(h / img_h, 4),
                    "angle": round(angle, 2)
                }
            })
        return output

    # Default: Object Detection ("detect")
    if hasattr(first_res, "boxes") and first_res.boxes is not None:
        boxes = first_res.boxes
        for i in range(len(boxes.xyxy)):
            box = boxes.xyxy[i].tolist()
            cls_id = int(boxes.cls[i].item())
            conf = round(float(boxes.conf[i].item()), 4)
            label_name = names.get(cls_id, f"class_{cls_id}")

            x_min = box[0] / img_w
            y_min = box[1] / img_h
            x_max = box[2] / img_w
            y_max = box[3] / img_h

            x = round(x_min, 4)
            y = round(y_min, 4)
            w = round(max(0, x_max - x_min), 4)
            h = round(max(0, y_max - y_min), 4)

            output.append({
                "label": label_name,
                "confidence": conf,
                "box": { "x": x, "y": y, "w": w, "h": h }
            })

    return output

