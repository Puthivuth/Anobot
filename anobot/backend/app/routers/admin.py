import uuid
from typing import Optional, List, Any
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.db import get_db
from app.core.deps import require_admin
from app.models.user import User, AuditLog
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1/admin", tags=["admin"])

def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

@router.get("/audit")
def list_audit_logs(
    username: Optional[str] = None,
    action: Optional[str] = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    query = db.query(AuditLog)
    if username:
        query = query.filter(AuditLog.username.ilike(f"%{username.strip()}%"))
    if action:
        query = query.filter(AuditLog.action == action)
    
    total = query.count()
    items = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(limit).all()

    return {
        "total": total,
        "items": [
            {
                "id": str(item.id),
                "user_id": str(item.user_id) if item.user_id else None,
                "username": item.username,
                "action": item.action,
                "target_type": item.target_type,
                "target_id": item.target_id,
                "metadata": item.metadata_json,
                "ip": item.ip,
                "created_at": item.created_at.isoformat()
            }
            for item in items
        ]
    }

@router.delete("/audit")
def clear_audit_logs(
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db.query(AuditLog).delete()
    db.commit()

    ip = _get_client_ip(request)
    log_audit_event(
        db=db,
        action="admin.audit_clear",
        user_id=admin.id,
        username=admin.username,
        ip=ip
    )
    return {"status": "ok", "message": "Audit log cleared successfully"}

