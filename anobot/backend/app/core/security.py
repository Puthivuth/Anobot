import hmac
import hashlib
import time
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from app.config import settings

hasher = PasswordHasher(time_cost=2, memory_cost=19456, parallelism=1, hash_len=32)

# Lockout tracking in memory with Redis support
_lockout_memory: dict[str, list[float]] = {}
_lockout_until: dict[str, float] = {}

def hash_password(password: str) -> str:
    return hasher.hash(password)

def verify_password(password: str, password_hash: str) -> bool:
    try:
        return hasher.verify(password_hash, password)
    except (VerifyMismatchError, InvalidHashError):
        return False

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=24)
    to_encode.update({"exp": expire, "iat": now})
    return jwt.encode(to_encode, settings.secret_key, algorithm="HS256")

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        return payload
    except Exception:
        return None

def is_locked_out(key: str) -> tuple[bool, int]:
    """Checks if username or IP is locked out. Returns (is_locked, remaining_seconds)."""
    now = time.time()
    until = _lockout_until.get(key, 0)
    if until > now:
        return True, int(until - now)
    return False, 0

def record_failed_attempt(key: str) -> bool:
    """Records a failed attempt. Locks out for 30s if 5 attempts within 60s. Returns True if locked out."""
    now = time.time()
    attempts = _lockout_memory.get(key, [])
    # keep attempts in the last 60 seconds
    attempts = [t for t in attempts if now - t < 60]
    attempts.append(now)
    _lockout_memory[key] = attempts
    if len(attempts) >= 5:
        _lockout_until[key] = now + 30
        _lockout_memory[key] = []
        return True
    return False

def clear_failed_attempts(key: str):
    _lockout_memory.pop(key, None)
    _lockout_until.pop(key, None)

# Fernet encryption for API keys & secrets
import base64
from cryptography.fernet import Fernet

def _get_fernet() -> Fernet:
    key_str = settings.master_encryption_key.strip()
    if not key_str:
        # Fallback to deriving a 32-byte urlsafe base64 key from secret_key
        derived = hashlib.sha256(settings.secret_key.encode()).digest()
        key_str = base64.urlsafe_b64encode(derived).decode()
    return Fernet(key_str.encode())

def encrypt_value(value: str) -> str:
    if not value:
        return ""
    f = _get_fernet()
    return f.encrypt(value.encode()).decode()

def decrypt_value(token: str) -> str:
    if not token:
        return ""
    f = _get_fernet()
    return f.decrypt(token.encode()).decode()

