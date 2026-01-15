from app.db.session import engine, SessionLocal
from app.db.base_class import Base
from app.models.user import User
from app.models.session import Session, Transcription
from app.models.settings import AppSettings
from app.core.security import get_password_hash

def init_db():
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    # Create or update initial admin user
    user = db.query(User).filter(User.username == "admin").first()
    if not user:
        user = User(
            username="admin",
            email="admin@example.com",
            hashed_password=get_password_hash("admin"),
            role="admin"
        )
        db.add(user)
    else:
        # Force reset password to ensure login works
        user.hashed_password = get_password_hash("admin")
    
    # Initialize default settings
    model_setting = db.query(AppSettings).filter(AppSettings.id == "whisper_model_size").first()
    if not model_setting:
        model_setting = AppSettings(id="whisper_model_size", value="medium")
        db.add(model_setting)
    
    db.commit()
    db.close()
