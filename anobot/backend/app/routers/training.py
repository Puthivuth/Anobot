import uuid
import json
import asyncio
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.project import Project
from app.models.ml import DatasetVersion, TrainingJob
from app.config import settings
from app.services.audit import log_audit_event
import redis

router = APIRouter(prefix="/api/v1", tags=["training"])

class TrainingStartRequest(BaseModel):
    version_id: Optional[uuid.UUID] = None
    model_name: str = Field(default="yolov8n", pattern="^(yolov8n|yolov8s|yolov8m|yolov8l|yolov8x)$")
    epochs: int = Field(default=50, ge=1, le=500)
    batch_size: int = Field(default=16, ge=1, le=128)
    img_size: int = Field(default=640, ge=128, le=1280)
    device: Optional[str] = None

class TrainingJobResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    version_id: Optional[uuid.UUID]
    model_name: str
    task: str
    epochs: int
    batch_size: int
    img_size: int
    device: str
    status: str
    progress: float
    current_epoch: int
    metrics: dict
    weights_key: Optional[str]
    error_message: Optional[str]
    created_at: datetime
    started_at: Optional[datetime]
    finished_at: Optional[datetime]

def _get_redis():
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)

@router.get("/projects/{project_id}/training/jobs", response_model=List[TrainingJobResponse])
def list_training_jobs(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(TrainingJob).filter(TrainingJob.project_id == project_id).order_by(TrainingJob.created_at.desc()).all()

@router.post("/projects/{project_id}/train", response_model=TrainingJobResponse, status_code=status.HTTP_201_CREATED)
def start_training(
    project_id: uuid.UUID,
    payload: TrainingStartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # If no version specified, pick the latest version
    version_id = payload.version_id
    if not version_id:
        latest_ver = db.query(DatasetVersion).filter(DatasetVersion.project_id == project_id).order_by(DatasetVersion.version_number.desc()).first()
        if latest_ver:
            version_id = latest_ver.id

    job = TrainingJob(
        project_id=project_id,
        version_id=version_id,
        model_name=payload.model_name,
        task=project.type,
        epochs=payload.epochs,
        batch_size=payload.batch_size,
        img_size=payload.img_size,
        device=payload.device or settings.training_device,
        status="queued",
        progress=0.0,
        current_epoch=0,
        metrics={},
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Push to Redis training queue
    try:
        r = _get_redis()
        r.lpush("training_queue", json.dumps({
            "job_id": str(job.id),
            "project_id": str(project.id),
            "version_id": str(version_id) if version_id else None,
            "model_name": job.model_name,
            "task": job.task,
            "epochs": job.epochs,
            "batch_size": job.batch_size,
            "img_size": job.img_size,
            "device": job.device,
        }))
    except Exception as e:
        # Fallback if redis temporarily unreachable
        pass

    log_audit_event(
        db=db,
        action="training.start",
        user_id=current_user.id,
        username=current_user.username,
        target_type="training_job",
        target_id=str(job.id),
        metadata={"model": job.model_name, "epochs": job.epochs}
    )

    return job

@router.get("/training/jobs/{job_id}", response_model=TrainingJobResponse)
def get_training_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")
    return job

@router.post("/training/jobs/{job_id}/cancel")
def cancel_training_job(
    job_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Training job not found")

    job.status = "cancelled"
    job.finished_at = datetime.now(timezone.utc)
    db.commit()

    try:
        r = _get_redis()
        r.publish(f"training:{job_id}:control", json.dumps({"action": "cancel"}))
    except Exception:
        pass

    return {"status": "ok", "message": "Training job cancelled"}

@router.get("/training/jobs/{job_id}/events")
async def stream_training_events(job_id: uuid.UUID):
    """Server-Sent Events (SSE) streaming real-time training metrics from Redis pub/sub."""
    async def event_generator():
        r = None
        pubsub = None
        try:
            r = redis.Redis.from_url(settings.redis_url, decode_responses=True)
            pubsub = r.pubsub()
            pubsub.subscribe(f"training:{job_id}:metrics")

            while True:
                message = pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message:
                    yield f"data: {message['data']}\n\n"
                else:
                    # Keep-alive heartbeat
                    yield f": ping\n\n"
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass
        finally:
            if pubsub:
                pubsub.unsubscribe()
                pubsub.close()
            if r:
                r.close()

    return StreamingResponse(event_generator(), media_type="text/event-stream")

