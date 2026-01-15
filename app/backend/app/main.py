from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from contextlib import asynccontextmanager
import os
from app.core.config import settings
from app.api.api import api_router
from app.db.init_db import init_db
from app.services.whisper_service import whisper_service
from app.db.session import SessionLocal
from app.models.settings import AppSettings

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    
    # Load Whisper Model at startup
    print("Pre-loading Whisper model...")
    db = SessionLocal()
    try:
        setting = db.query(AppSettings).filter(AppSettings.id == "whisper_model_size").first()
        model_size = setting.value if setting else None
        # This will trigger load_model using the configured device (GPU if available)
        whisper_service.load_model(model_size)
    except Exception as e:
        print(f"Error loading model at startup: {e}")
    finally:
        db.close()
        
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    lifespan=lifespan
)

# CORS Configuration
origins = [
    "http://localhost",
    "http://localhost:5173", # Vite default
    "http://localhost:3000",
    "*" # Allow all for local enterprise network ease (restrict in production if needed)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}

app.include_router(api_router, prefix=settings.API_V1_STR)

# Serve Frontend static files (SPA compatible)
@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    frontend_dist = os.path.join(os.path.dirname(settings.BASE_DIR), "frontend", "dist")
    
    if not os.path.exists(frontend_dist):
        return {"message": "Welcome to Offline STT System API (Frontend not found)"}
        
    # Check if requested path is a file (like index-XXX.js)
    file_path = os.path.join(frontend_dist, full_path)
    if full_path and os.path.isfile(file_path):
        return FileResponse(file_path)
    
    # Otherwise return index.html for SPA routing
    return FileResponse(os.path.join(frontend_dist, "index.html"))
