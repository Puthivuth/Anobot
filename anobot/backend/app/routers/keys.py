import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from datetime import datetime
import urllib.request
import json

from app.core.db import get_db
from app.core.deps import require_admin
from app.models.user import User
from app.models.ml import ApiKey
from app.core.security import encrypt_value, decrypt_value
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1/admin/api-keys", tags=["api_keys"])

class ApiKeyCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    service: str = Field(default="gemini", max_length=40)
    value: str = Field(min_length=1)

class ApiKeyResponse(BaseModel):
    id: uuid.UUID
    name: str
    service: str
    masked_value: str
    is_active: bool
    created_at: datetime
    updated_at: datetime

def _mask_key(val: str) -> str:
    if len(val) <= 8:
        return "••••••••"
    return f"{val[:4]}...{val[-4:]}"

@router.get("", response_model=List[ApiKeyResponse])
def list_api_keys(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    return db.query(ApiKey).order_by(ApiKey.created_at.desc()).all()

@router.post("", response_model=ApiKeyResponse, status_code=status.HTTP_201_CREATED)
def create_api_key(
    payload: ApiKeyCreateRequest,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    clean_val = payload.value.strip()
    encrypted = encrypt_value(clean_val)
    masked = _mask_key(clean_val)

    # If key for service already exists, update it
    existing = db.query(ApiKey).filter(ApiKey.service == payload.service, ApiKey.name == payload.name).first()
    if existing:
        existing.encrypted_value = encrypted
        existing.masked_value = masked
        db.commit()
        db.refresh(existing)
        return existing

    new_key = ApiKey(
        name=payload.name,
        service=payload.service,
        encrypted_value=encrypted,
        masked_value=masked,
        created_by=admin_user.id
    )
    db.add(new_key)
    db.commit()
    db.refresh(new_key)

    log_audit_event(
        db=db,
        action="api_key.create",
        user_id=admin_user.id,
        username=admin_user.username,
        target_type="api_key",
        target_id=str(new_key.id),
        metadata={"service": payload.service, "name": payload.name}
    )
    return new_key

@router.delete("/{key_id}")
def delete_api_key(
    key_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    key_obj = db.query(ApiKey).filter(ApiKey.id == key_id).first()
    if not key_obj:
        raise HTTPException(status_code=404, detail="API key not found")

    db.delete(key_obj)
    db.commit()
    return {"status": "ok", "message": "API key deleted"}

@router.post("/test")
def test_gemini_key(
    payload: dict,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_admin)
):
    key_val = payload.get("value", "").strip()
    if not key_val:
        # Check if saved key exists
        saved = db.query(ApiKey).filter(ApiKey.service == "gemini", ApiKey.is_active == True).first()
        if saved:
            key_val = decrypt_value(saved.encrypted_value)

    if not key_val:
        raise HTTPException(status_code=400, detail="No Gemini API key provided or saved.")

    # Validate against Gemini API model list
    test_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key_val}"
    try:
        req = urllib.request.Request(test_url, headers={"User-Agent": "AnoBot/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode())
            models_count = len(data.get("models", []))
            return {"status": "ok", "message": f"Successfully verified Gemini API key! ({models_count} models available)"}
    except Exception as e:
        return {"status": "error", "message": f"Verification failed: {str(e)}"}

