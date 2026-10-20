import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import Response as FastApiResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel, Field
from datetime import datetime

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.project import Project, ProjectClass, Image, Annotation
from app.models.ml import DatasetVersion
from app.services.storage import get_storage
from app.services.exporter import generate_dataset_zip
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1", tags=["versions"])

class VersionCreateRequest(BaseModel):
    name: Optional[str] = None
    splits: dict = Field(default_factory=lambda: {"train": 70, "val": 20, "test": 10})
    preprocessing: dict = Field(default_factory=dict)
    augmentations: dict = Field(default_factory=dict)
    format: str = "yolov8"

class VersionResponse(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    version_number: int
    name: Optional[str]
    splits: dict
    preprocessing: dict
    augmentations: dict
    image_count: int
    created_at: datetime

@router.get("/projects/{project_id}/versions", response_model=List[VersionResponse])
def list_versions(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(DatasetVersion).filter(DatasetVersion.project_id == project_id).order_by(DatasetVersion.version_number.desc()).all()

@router.post("/projects/{project_id}/versions", response_model=VersionResponse, status_code=status.HTTP_201_CREATED)
def create_version(
    project_id: uuid.UUID,
    payload: VersionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Fetch project classes and annotated images
    classes = db.query(ProjectClass).filter(ProjectClass.project_id == project_id).order_by(ProjectClass.position).all()
    images = db.query(Image).filter(Image.project_id == project_id).all()

    if not images:
        raise HTTPException(status_code=400, detail="Cannot generate a version with 0 images. Upload images first.")

    # Calculate version number
    max_ver = db.query(func.max(DatasetVersion.version_number)).filter(DatasetVersion.project_id == project_id).scalar() or 0
    version_num = max_ver + 1
    version_id = uuid.uuid4()

    # Generate ZIP dataset archive
    zip_bytes = generate_dataset_zip(
        project=project,
        classes=classes,
        images=images,
        splits=payload.splits,
        export_format=payload.format
    )

    # Save to storage
    storage = get_storage()
    export_key = f"projects/{project_id}/versions/{version_id}/dataset.zip"
    storage.upload_bytes(export_key, zip_bytes, "application/zip")

    version = DatasetVersion(
        id=version_id,
        project_id=project_id,
        version_number=version_num,
        name=payload.name or f"v{version_num}",
        splits=payload.splits,
        preprocessing=payload.preprocessing,
        augmentations=payload.augmentations,
        image_count=len(images),
        export_key=export_key
    )
    db.add(version)
    db.commit()
    db.refresh(version)

    log_audit_event(
        db=db,
        action="version.generate",
        user_id=current_user.id,
        username=current_user.username,
        target_type="version",
        target_id=str(version.id),
        metadata={"project_id": str(project_id), "version": version_num, "images": len(images)}
    )

    return version

@router.get("/projects/{project_id}/versions/{version_id}/download")
def download_version(
    project_id: uuid.UUID,
    version_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ver = db.query(DatasetVersion).filter(DatasetVersion.id == version_id, DatasetVersion.project_id == project_id).first()
    if not ver or not ver.export_key:
        raise HTTPException(status_code=404, detail="Version export archive not found")

    storage = get_storage()
    zip_bytes, _ = storage.get_object(ver.export_key)
    if not zip_bytes:
        raise HTTPException(status_code=404, detail="Export file missing from storage")

    filename = f"{ver.name or f'v{ver.version_number}'}_export.zip"
    return FastApiResponse(
        content=zip_bytes,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.delete("/versions/{version_id}")
def delete_version(
    version_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ver = db.query(DatasetVersion).filter(DatasetVersion.id == version_id).first()
    if not ver:
        raise HTTPException(status_code=404, detail="Version not found")

    storage = get_storage()
    if ver.export_key:
        storage.delete_object(ver.export_key)

    db.delete(ver)
    db.commit()
    return {"status": "ok", "message": "Version deleted"}

