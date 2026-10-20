import uuid
from datetime import datetime, timezone
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.deps import require_admin
from app.core.security import hash_password
from app.models.user import User
from app.schemas.user import UserCreateRequest, UserUpdateRequest, UserResponse
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1/users", tags=["users"])

def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

@router.get("", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    return db.query(User).order_by(User.created_at.desc()).all()

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreateRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    clean_username = payload.username.strip().lower()
    existing = db.query(User).filter(User.username == clean_username).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "username_taken", "message": f"Username '{clean_username}' is already in use"}}
        )

    user = User(
        name=payload.name.strip(),
        username=clean_username,
        role=payload.role,
        is_active=True,
        password_hash=hash_password(payload.password)
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    ip = _get_client_ip(request)
    log_audit_event(
        db=db,
        action="user.create",
        user_id=admin.id,
        username=admin.username,
        target_type="user",
        target_id=str(user.id),
        metadata={"created_username": user.username, "role": user.role},
        ip=ip
    )
    return user

@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdateRequest,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "user_not_found", "message": "User not found"}}
        )

    active_admin_count = db.query(User).filter(User.role == "admin", User.is_active == True).count()

    # Rule: An admin cannot disable their own account
    if target.id == admin.id and payload.is_active is False:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "cannot_disable_self", "message": "An administrator cannot disable their own account"}}
        )

    # Rule: The last active admin can never be demoted or disabled
    if target.role == "admin" and target.is_active:
        if payload.role == "user" and active_admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "last_admin", "message": "The last active administrator cannot be demoted"}}
            )
        if payload.is_active is False and active_admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"error": {"code": "last_admin", "message": "The last active administrator cannot be disabled"}}
            )

    if payload.name is not None:
        target.name = payload.name.strip()
    if payload.role is not None:
        target.role = payload.role
    if payload.is_active is not None:
        target.is_active = payload.is_active
    if payload.password is not None and payload.password.strip():
        target.password_hash = hash_password(payload.password)

    target.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(target)

    ip = _get_client_ip(request)
    log_audit_event(
        db=db,
        action="user.update",
        user_id=admin.id,
        username=admin.username,
        target_type="user",
        target_id=str(target.id),
        metadata={"updated_username": target.username, "role": target.role, "is_active": target.is_active},
        ip=ip
    )
    return target

@router.delete("/{user_id}")
def delete_user(
    user_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"error": {"code": "user_not_found", "message": "User not found"}}
        )

    # Rule: An admin cannot remove their own account
    if target.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "cannot_delete_self", "message": "An administrator cannot delete their own account"}}
        )

    # Rule: The last active admin can never be removed
    active_admin_count = db.query(User).filter(User.role == "admin", User.is_active == True).count()
    if target.role == "admin" and target.is_active and active_admin_count <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "last_admin", "message": "The last active administrator cannot be removed"}}
        )

    deleted_username = target.username
    db.delete(target)
    db.commit()

    ip = _get_client_ip(request)
    log_audit_event(
        db=db,
        action="user.delete",
        user_id=admin.id,
        username=admin.username,
        target_type="user",
        target_id=str(user_id),
        metadata={"deleted_username": deleted_username},
        ip=ip
    )
    return {"status": "ok", "message": f"User '{deleted_username}' removed successfully"}

