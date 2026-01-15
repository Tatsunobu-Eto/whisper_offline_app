from sqlalchemy import Column, String
from app.db.base_class import Base

class AppSettings(Base):
    id = Column(String(50), primary_key=True) # e.g., 'whisper_model_size'
    value = Column(String(255))
