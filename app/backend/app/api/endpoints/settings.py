from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.db.session import SessionLocal
from app.models.settings import AppSettings
from app.api import deps
from app.models.user import User

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

class SettingUpdate(BaseModel):
    value: str

@router.get("/whisper-model")
def get_whisper_model(
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    setting = db.query(AppSettings).filter(AppSettings.id == "whisper_model_size").first()
    if not setting:
        return {"value": "medium"}
    return {"value": setting.value}

@router.post("/whisper-model")
def update_whisper_model(
    payload: SettingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admins can change settings")
    
    if payload.value not in ["small", "medium", "large-v3"]:
        raise HTTPException(status_code=400, detail="Invalid model size")
        
    setting = db.query(AppSettings).filter(AppSettings.id == "whisper_model_size").first()
    if not setting:
        setting = AppSettings(id="whisper_model_size", value=payload.value)
        db.add(setting)
    else:
        setting.value = payload.value
    
    db.commit()
    return {"message": "Setting updated successfully", "value": payload.value}
