import uuid
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, UploadFile, File, status
from fastapi.responses import Response as FastApiResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.core.db import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.project import Project, ProjectClass, Image, Annotation
from app.schemas.project import (
    ProjectCreateRequest,
    ProjectUpdateRequest,
    ProjectResponse,
    ClassCreateRequest,
    ClassUpdateRequest,
    ClassResponse,
    ImageResponse,
    UploadImagesResponse,
    AnnotationCreateRequest,
    AnnotationResponse,
    AnnotationBatchSaveRequest
)
from app.services.storage import get_storage
from app.services.imaging import process_uploaded_image
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1", tags=["projects"])

def _format_project(p: Project, db: Session) -> dict:
    img_count = db.query(Image).filter(Image.project_id == p.id).count()
    cls_count = db.query(ProjectClass).filter(ProjectClass.project_id == p.id).count()
    # Count images having at least one annotation
    annotated_count = (
        db.query(Image.id)
        .join(Annotation, Annotation.image_id == Image.id)
        .filter(Image.project_id == p.id)
        .distinct()
        .count()
    )
    return {
        "id": p.id,
        "owner_id": p.owner_id,
        "name": p.name,
        "type": p.type,
        "is_public": p.is_public,
        "keypoint_schema": p.keypoint_schema,
        "images_count": img_count,
        "annotated_count": annotated_count,
        "classes_count": cls_count,
        "created_at": p.created_at,
        "updated_at": p.updated_at,
    }

# ----------------- Projects -----------------

@router.get("/projects", response_model=List[ProjectResponse])
def list_projects(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    projects = db.query(Project).order_by(Project.created_at.desc()).all()
    return [_format_project(p, db) for p in projects]

@router.post("/projects", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    payload: ProjectCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = Project(
        owner_id=current_user.id,
        name=payload.name.strip(),
        type=payload.type,
        is_public=payload.is_public,
        keypoint_schema=payload.keypoint_schema or {},
    )
    db.add(project)
    db.commit()
    db.refresh(project)

    # Seed with standard default classes for object detection
    default_classes = ["person", "car", "bicycle"]
    for idx, cname in enumerate(default_classes):
        cls = ProjectClass(
            project_id=project.id,
            name=cname,
            position=idx
        )
        db.add(cls)
    db.commit()

    log_audit_event(
        db=db,
        action="project.create",
        user_id=current_user.id,
        username=current_user.username,
        target_type="project",
        target_id=str(project.id),
        metadata={"name": project.name, "type": project.type}
    )
    return _format_project(project, db)

@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Project not found"}}
        )
    return _format_project(project, db)

@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: uuid.UUID,
    payload: ProjectUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Project not found"}}
        )

    # Rule: Change type only while project has no annotations (Section 5)
    if payload.type is not None and payload.type != project.type:
        has_annotations = (
            db.query(Annotation)
            .join(Image, Annotation.image_id == Image.id)
            .filter(Image.project_id == project.id)
            .count()
            > 0
        )
        if has_annotations:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "type_locked", "message": "Cannot change project type after annotations have been created"}}
            )
        project.type = payload.type

    if payload.name is not None:
        project.name = payload.name.strip()
    if payload.is_public is not None:
        project.is_public = payload.is_public
    if payload.keypoint_schema is not None:
        project.keypoint_schema = payload.keypoint_schema

    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return _format_project(project, db)

@router.delete("/projects/{project_id}")
def delete_project(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Project not found"}}
        )

    # Rule: Users can delete only their own projects; Admin can delete any project (Section 4)
    if current_user.role != "admin" and project.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "forbidden", "message": "You can only delete your own projects"}}
        )

    # Delete all images from storage
    storage = get_storage()
    images = db.query(Image).filter(Image.project_id == project.id).all()
    for img in images:
        storage.delete_object(img.storage_key)
        storage.delete_object(img.thumb_key)
        storage.delete_object(img.preview_key)

    p_name = project.name
    db.delete(project)
    db.commit()

    log_audit_event(
        db=db,
        action="project.delete",
        user_id=current_user.id,
        username=current_user.username,
        target_type="project",
        target_id=str(project_id),
        metadata={"name": p_name}
    )
    return {"status": "ok", "message": f"Project '{p_name}' deleted"}

# ----------------- Classes -----------------

@router.get("/projects/{project_id}/classes", response_model=List[ClassResponse])
def list_classes(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(ProjectClass).filter(ProjectClass.project_id == project_id).order_by(ProjectClass.position).all()

@router.post("/projects/{project_id}/classes", response_model=ClassResponse, status_code=status.HTTP_201_CREATED)
def create_class(
    project_id: uuid.UUID,
    payload: ClassCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    clean_name = payload.name.strip()
    existing = db.query(ProjectClass).filter(ProjectClass.project_id == project_id, ProjectClass.name == clean_name).first()
    if existing:
        return existing

    max_pos = db.query(func.max(ProjectClass.position)).filter(ProjectClass.project_id == project_id).scalar() or 0
    new_cls = ProjectClass(
        project_id=project_id,
        name=clean_name,
        color=payload.color or "#6706ce",
        position=max_pos + 1
    )
    db.add(new_cls)
    db.commit()
    db.refresh(new_cls)
    return new_cls

@router.patch("/classes/{class_id}", response_model=ClassResponse)
def update_class(
    class_id: uuid.UUID,
    payload: ClassUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cls = db.query(ProjectClass).filter(ProjectClass.id == class_id).first()
    if not cls:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Class not found"}}
        )

    if payload.name is not None:
        cls.name = payload.name.strip()
    if payload.color is not None:
        cls.color = payload.color
    if payload.position is not None:
        cls.position = payload.position

    cls.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cls)
    return cls

@router.delete("/classes/{class_id}")
def delete_class(
    class_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    cls = db.query(ProjectClass).filter(ProjectClass.id == class_id).first()
    if not cls:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Class not found"}}
        )
    cname = cls.name
    db.delete(cls)
    db.commit()
    return {"status": "ok", "message": f"Class '{cname}' deleted"}

# ----------------- Images -----------------

@router.post("/projects/{project_id}/images", response_model=UploadImagesResponse)
async def upload_images(
    project_id: uuid.UUID,
    files: List[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "not_found", "message": "Project not found"}}
        )

    storage = get_storage()
    created_images = []
    duplicate_warnings = []

    for file in files:
        contents = await file.read()
        if len(contents) > 25 * 1024 * 1024:  # 25 MB limit (Section 7.2)
            continue

        try:
            processed = process_uploaded_image(contents)
        except ValueError:
            continue

        # Check duplicate perceptual hash in this project
        existing = db.query(Image).filter(Image.project_id == project.id, Image.phash == processed["phash"]).first()
        if existing:
            duplicate_warnings.append({"filename": file.filename, "existing_id": str(existing.id)})

        image_id = uuid.uuid4()
        storage_key = f"projects/{project.id}/images/{image_id}/original.jpg"
        thumb_key = f"projects/{project.id}/images/{image_id}/thumb.jpg"
        preview_key = f"projects/{project.id}/images/{image_id}/preview.jpg"

        storage.upload_bytes(storage_key, processed["original_bytes"], "image/jpeg")
        storage.upload_bytes(thumb_key, processed["thumb_bytes"], "image/jpeg")
        storage.upload_bytes(preview_key, processed["preview_bytes"], "image/jpeg")

        img_record = Image(
            id=image_id,
            project_id=project.id,
            filename=file.filename or "image.jpg",
            storage_key=storage_key,
            thumb_key=thumb_key,
            preview_key=preview_key,
            width=processed["width"],
            height=processed["height"],
            phash=processed["phash"],
            uploaded_by=current_user.id
        )
        db.add(img_record)
        created_images.append(img_record)

    db.commit()
    for img in created_images:
        db.refresh(img)

    return {
        "uploaded_count": len(created_images),
        "duplicate_warnings": duplicate_warnings,
        "images": [
            {
                "id": img.id,
                "project_id": img.project_id,
                "filename": img.filename,
                "width": img.width,
                "height": img.height,
                "phash": img.phash,
                "split_hint": img.split_hint,
                "annotations_count": 0,
                "created_at": img.created_at
            }
            for img in created_images
        ]
    }

@router.get("/projects/{project_id}/images")
def list_images(
    project_id: uuid.UUID,
    filter: str = Query("all", pattern="^(all|labeled|unlabeled)$"),
    class_id: Optional[uuid.UUID] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Image).filter(Image.project_id == project_id)

    if filter == "labeled":
        query = query.filter(Image.annotations.any())
    elif filter == "unlabeled":
        query = query.filter(~Image.annotations.any())

    if class_id:
        query = query.filter(Image.annotations.any(Annotation.class_id == class_id))

    total = query.count()
    images = query.order_by(Image.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for img in images:
        ann_count = db.query(Annotation).filter(Annotation.image_id == img.id).count()
        items.append({
            "id": img.id,
            "project_id": img.project_id,
            "filename": img.filename,
            "width": img.width,
            "height": img.height,
            "phash": img.phash,
            "split_hint": img.split_hint,
            "annotations_count": ann_count,
            "created_at": img.created_at
        })

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": items
    }

@router.get("/projects/{project_id}/images/{image_id}/file")
def get_image_file(
    project_id: uuid.UUID,
    image_id: uuid.UUID,
    type: str = Query("thumb", pattern="^(thumb|preview|original)$"),
    db: Session = Depends(get_db)
):
    img = db.query(Image).filter(Image.id == image_id, Image.project_id == project_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    storage = get_storage()
    target_key = img.thumb_key if type == "thumb" else (img.preview_key if type == "preview" else img.storage_key)
    file_bytes, content_type = storage.get_object(target_key)
    if not file_bytes:
        raise HTTPException(status_code=404, detail="Image file not found in storage")

    return FastApiResponse(content=file_bytes, media_type=content_type or "image/jpeg")

@router.delete("/images/{image_id}")
def delete_image(
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    img = db.query(Image).filter(Image.id == image_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    storage = get_storage()
    storage.delete_object(img.storage_key)
    storage.delete_object(img.thumb_key)
    storage.delete_object(img.preview_key)

    db.delete(img)
    db.commit()
    return {"status": "ok", "message": "Image deleted"}

# ----------------- Annotations -----------------

@router.get("/projects/{project_id}/images/{image_id}/annotations", response_model=List[AnnotationResponse])
def get_image_annotations(
    project_id: uuid.UUID,
    image_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    img = db.query(Image).filter(Image.id == image_id, Image.project_id == project_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")
    return db.query(Annotation).filter(Annotation.image_id == image_id).all()

@router.post("/projects/{project_id}/images/{image_id}/annotations", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED)
def create_annotation(
    project_id: uuid.UUID,
    image_id: uuid.UUID,
    payload: AnnotationCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    img = db.query(Image).filter(Image.id == image_id, Image.project_id == project_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    # verify class belongs to project
    cls = db.query(ProjectClass).filter(ProjectClass.id == payload.class_id, ProjectClass.project_id == project_id).first()
    if not cls:
        raise HTTPException(status_code=400, detail="Class does not belong to this project")

    ann = Annotation(
        image_id=image_id,
        class_id=payload.class_id,
        kind=payload.kind,
        geometry=payload.geometry,
        created_by=current_user.id,
        source=payload.source
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return ann

@router.put("/projects/{project_id}/images/{image_id}/annotations", response_model=List[AnnotationResponse])
def batch_save_annotations(
    project_id: uuid.UUID,
    image_id: uuid.UUID,
    payload: AnnotationBatchSaveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    img = db.query(Image).filter(Image.id == image_id, Image.project_id == project_id).first()
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    # Delete existing annotations for this image
    db.query(Annotation).filter(Annotation.image_id == image_id).delete()

    created = []
    for item in payload.annotations:
        ann = Annotation(
            image_id=image_id,
            class_id=item.class_id,
            kind=item.kind,
            geometry=item.geometry,
            created_by=current_user.id,
            source=item.source
        )
        db.add(ann)
        created.append(ann)

    db.commit()
    for ann in created:
        db.refresh(ann)
    return created

@router.delete("/annotations/{annotation_id}")
def delete_annotation(
    annotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ann = db.query(Annotation).filter(Annotation.id == annotation_id).first()
    if not ann:
        raise HTTPException(status_code=404, detail="Annotation not found")
    db.delete(ann)
    db.commit()
    return {"status": "ok", "message": "Annotation deleted"}
