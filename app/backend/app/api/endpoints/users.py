from typing import Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.api import deps
from app.core import security
from app.models.user import User

router = APIRouter()

# Simple schemas for internal use
class UserCreate(BaseModel):
    username: str
    password: str
    email: Optional[str] = None # Using str instead of EmailStr to avoid email-validator dependency
    role: str = "user"

class UserOut(BaseModel):
    id: str
    username: str
    email: Optional[str]
    role: str
    
    class Config:
        from_attributes = True

@router.get("/", response_model=List[UserOut])
def read_users(
    db: Session = Depends(deps.get_db),
    current_user: User = Depends(deps.get_current_active_admin),
) -> Any:
    """
    Retrieve users.
    """
    users = db.query(User).all()
    return users

@router.post("/", response_model=UserOut)
def create_user(
    *,
    db: Session = Depends(deps.get_db),
    user_in: UserCreate,
    current_user: User = Depends(deps.get_current_active_admin),
) -> Any:
    """
    Create new user.
    """
    user = db.query(User).filter(User.username == user_in.username).first()
    if user:
        raise HTTPException(
            status_code=400,
            detail="The user with this username already exists in the system.",
        )
    db_obj = User(
        username=user_in.username,
        email=user_in.email,
        hashed_password=security.get_password_hash(user_in.password),
        role=user_in.role,
    )
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj

@router.delete("/{id}", response_model=UserOut)
def delete_user(
    *,
    db: Session = Depends(deps.get_db),
    id: str,
    current_user: User = Depends(deps.get_current_active_admin),
) -> Any:
    """
    Delete a user.
    """
    user = db.query(User).filter(User.id == id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Users cannot delete themselves")
    db.delete(user)
    db.commit()
    return user
