from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from app.core.db import get_db
from app.core.deps import get_current_user
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    is_locked_out,
    record_failed_attempt,
    clear_failed_attempts
)
from app.models.user import User
from app.schemas.auth import (
    SetupRequest,
    LoginRequest,
    ChangePasswordRequest,
    AuthStatusResponse,
    UserProfileResponse
)
from app.services.audit import log_audit_event

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])

def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

@router.get("/status", response_model=AuthStatusResponse)
def get_auth_status(db: Session = Depends(get_db)):
    user_count = db.query(User).count()
    return {"needs_setup": user_count == 0}

@router.post("/setup", response_model=UserProfileResponse)
def setup_first_admin(
    payload: SetupRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    if db.query(User).count() > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "setup_completed", "message": "First-run setup has already been completed"}}
        )

    clean_username = payload.username.strip().lower()
    admin_user = User(
        name=payload.name.strip(),
        username=clean_username,
        role="admin",
        is_active=True,
        password_hash=hash_password(payload.password),
        last_login_at=datetime.now(timezone.utc)
    )
    db.add(admin_user)
    db.commit()
    db.refresh(admin_user)

    ip = _get_client_ip(request)
    log_audit_event(
        db=db,
        action="auth.setup",
        user_id=admin_user.id,
        username=admin_user.username,
        target_type="user",
        target_id=str(admin_user.id),
        metadata={"role": "admin"},
        ip=ip
    )

    token = create_access_token({"sub": str(admin_user.id), "role": admin_user.role, "username": admin_user.username})
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=86400,
        path="/"
    )
    return admin_user

@router.post("/login", response_model=UserProfileResponse)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db)
):
    ip = _get_client_ip(request)
    clean_username = payload.username.strip().lower()

    # Check lockout on username and IP
    user_locked, user_secs = is_locked_out(f"user:{clean_username}")
    ip_locked, ip_secs = is_locked_out(f"ip:{ip}")
    if user_locked or ip_locked:
        wait_secs = max(user_secs, ip_secs)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"error": {"code": "locked_out", "message": f"Account temporarily locked due to repeated failures. Try again in {wait_secs} seconds."}}
        )

    user = db.query(User).filter(User.username == clean_username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        u_locked = record_failed_attempt(f"user:{clean_username}")
        ip_locked = record_failed_attempt(f"ip:{ip}")
        log_audit_event(
            db=db,
            action="auth.login_failed",
            username=clean_username,
            ip=ip,
            metadata={"reason": "invalid_credentials"}
        )
        if u_locked or ip_locked:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"error": {"code": "locked_out", "message": "Account temporarily locked due to repeated failures. Try again in 30 seconds."}}
            )
        # Show "Invalid username or password" without revealing which one is wrong (Section 6.3)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"error": {"code": "invalid_credentials", "message": "Invalid username or password"}}
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"error": {"code": "user_disabled", "message": "User account is disabled. Contact an administrator."}}
        )

    # Success: clear lockout counters
    clear_failed_attempts(f"user:{clean_username}")
    clear_failed_attempts(f"ip:{ip}")

    user.last_login_at = datetime.now(timezone.utc)
    db.commit()

    log_audit_event(
        db=db,
        action="auth.login_success",
        user_id=user.id,
        username=user.username,
        ip=ip
    )

    token = create_access_token({"sub": str(user.id), "role": user.role, "username": user.username})
    response.set_cookie(
        key="session_token",
        value=token,
        httponly=True,
        samesite="lax",
        max_age=86400,
        path="/"
    )
    return user

@router.post("/logout")
def logout(
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ip = _get_client_ip(request)
    log_audit_event(
        db=db,
        action="auth.logout",
        user_id=current_user.id,
        username=current_user.username,
        ip=ip
    )
    response.delete_cookie(key="session_token", path="/")
    return {"status": "ok", "message": "Logged out successfully"}

@router.get("/me", response_model=UserProfileResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/change-password")
def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": {"code": "invalid_password", "message": "Current password is incorrect"}}
        )

    current_user.password_hash = hash_password(payload.new_password)
    current_user.updated_at = datetime.now(timezone.utc)
    db.commit()

    ip = _get_client_ip(request)
    log_audit_event(
        db=db,
        action="auth.change_password",
        user_id=current_user.id,
        username=current_user.username,
        ip=ip
    )
    return {"status": "ok", "message": "Password updated successfully"}

