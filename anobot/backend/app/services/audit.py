import uuid
from typing import Optional, Any
from sqlalchemy.orm import Session
from app.models.user import AuditLog

def log_audit_event(
    db: Session,
    action: str,
    user_id: Optional[uuid.UUID] = None,
    username: Optional[str] = None,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
    ip: Optional[str] = None
):
    event = AuditLog(
        user_id=user_id,
        username=username,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id else None,
        metadata_json=metadata or {},
        ip=ip
    )
    db.add(event)
    db.commit()

