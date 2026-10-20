from app.routers.auth import router as auth_router
from app.routers.users import router as users_router
from app.routers.admin import router as admin_router

__all__ = ["auth_router", "users_router", "admin_router"]

