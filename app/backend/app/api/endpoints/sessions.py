import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from app.db.session import SessionLocal
from app.models.session import Session as SessionModel, Transcription
from app.api import deps
from app.models.user import User

router = APIRouter()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/", response_model=List[dict])
def get_sessions(
    skip: int = 0, 
    limit: int = 100, 
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    sessions = db.query(SessionModel)\
        .filter(SessionModel.user_id == current_user.id)\
        .order_by(SessionModel.created_at.desc())\
        .offset(skip).limit(limit).all()
    results = []
    for session in sessions:
        results.append({
            "id": session.id,
            "status": session.status,
            "created_at": session.created_at,
            "completed_at": session.completed_at,
            "audio_file_path": session.audio_file_path,
            "diarization": session.diarization,
            "meta_data": session.meta_data,
            # Extract filename from path for simpler display
            "filename": os.path.basename(session.audio_file_path) if session.audio_file_path else "Unknown"
        })
    return results

@router.get("/{session_id}", response_model=dict)
def get_session_detail(
    session_id: str, 
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    session = db.query(SessionModel)\
        .filter(SessionModel.id == session_id, SessionModel.user_id == current_user.id)\
        .first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    transcriptions = db.query(Transcription).filter(Transcription.session_id == session_id).order_by(Transcription.start_time).all()
    
    transcription_data = []
    for t in transcriptions:
        transcription_data.append({
            "start": t.start_time,
            "end": t.end_time,
            "text": t.text,
            "speaker": t.speaker,
            "confidence": t.confidence
        })
        
    return {
        "id": session.id,
        "status": session.status,
        "created_at": session.created_at,
        "completed_at": session.completed_at,
        "audio_file_path": session.audio_file_path,
        "diarization": session.diarization,
        "meta_data": session.meta_data,
        "filename": os.path.basename(session.audio_file_path) if session.audio_file_path else "Unknown",
        "segments": transcription_data
    }

@router.delete("/{session_id}", response_model=dict)
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(deps.get_current_user)
):
    session = db.query(SessionModel)\
        .filter(SessionModel.id == session_id, SessionModel.user_id == current_user.id)\
        .first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Delete associated files
    if session.audio_file_path and os.path.exists(session.audio_file_path):
        os.remove(session.audio_file_path)

    # Delete transcriptions and session from DB
    db.query(Transcription).filter(Transcription.session_id == session_id).delete()
    db.delete(session)
    db.commit()

    return {"message": "Session deleted successfully"}
