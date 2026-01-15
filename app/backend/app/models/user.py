from sqlalchemy import Column, String, DateTime
import uuid
from datetime import datetime
from app.db.base_class import Base

class User(Base):
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    username = Column(String(100), unique=True, index=True, nullable=False)
    email = Column(String(255))
    hashed_password = Column(String(255))
    role = Column(String(20), default='user')
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime)
