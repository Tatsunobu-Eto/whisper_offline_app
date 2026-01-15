from sqlalchemy import Column, String, DateTime, JSON, ForeignKey, Float, Text, Boolean
from datetime import datetime
import uuid
from app.db.base_class import Base

class Session(Base):
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey('user.id'), nullable=True) # Nullable for guest/anonymous for now
    session_type = Column(String(20)) # 'file' or 'realtime'
    status = Column(String(20))
    audio_file_path = Column(String(500))
    result_file_path = Column(String(500))
    diarization = Column(Boolean, default=False)
    meta_data = Column(JSON)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)

class Transcription(Base):
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String(36), ForeignKey('session.id'))
    start_time = Column(Float)
    end_time = Column(Float)
    text = Column(Text)
    speaker = Column(String(50))
    confidence = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
