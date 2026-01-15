from fastapi import APIRouter
from app.api.endpoints import transcribe, sessions, auth, users, settings

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(transcribe.router, prefix="/transcribe", tags=["transcribe"])
api_router.include_router(sessions.router, prefix="/sessions", tags=["sessions"])
api_router.include_router(settings.router, prefix="/settings", tags=["settings"])
