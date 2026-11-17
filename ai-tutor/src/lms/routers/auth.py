"""Auth routes: login, register, me, Google OAuth."""

import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from src.lms.auth.dependencies import get_current_user
from src.lms.auth.jwt_utils import create_access_token
from src.lms.auth.password import hash_password, verify_password
from src.lms.db import get_db
from src.lms.models import User
from src.lms.schemas import (
    GoogleAuthRequest,
    LoginRequest,
    RegisterRequest,
    TokenResponse,
    UserOut,
)
from src.lms.services.classes import get_class_name

router = APIRouter(prefix="/api/auth", tags=["lms-auth"])

ROLE_REDIRECT = {
    "student": "/student/dashboard",
    "teacher": "/teacher/dashboard",
    "admin": "/admin/dashboard",
}


def _token_response(user: User) -> TokenResponse:
    token = create_access_token(user.id, user.role, user.email)
    return TokenResponse(
        access_token=token,
        role=user.role,  # type: ignore[arg-type]
        redirect=ROLE_REDIRECT.get(user.role, "/"),
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.role != body.role:
        raise HTTPException(
            status_code=403,
            detail=f"Account is registered as {user.role}, not {body.role}",
        )
    return _token_response(user)


@router.post("/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        grade=body.grade,
        roll_no=body.roll_no,
        avatar_initials=body.full_name[:2].upper(),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _token_response(user)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,  # type: ignore[arg-type]
        grade=user.grade,
        roll_no=user.roll_no,
        class_id=user.class_id,
        class_name=get_class_name(db, user.class_id) if user.class_id else None,
        avatar_initials=user.avatar_initials,
    )


@router.post("/google", response_model=TokenResponse)
def google_auth(body: GoogleAuthRequest, db: Session = Depends(get_db)):
    """Verify Google ID token when GOOGLE_CLIENT_ID is set; else demo mode."""
    client_id = os.getenv("GOOGLE_CLIENT_ID", "")
    email = "google.user@vidyasetu.in"
    name = "Google User"
    google_sub = body.id_token[:32]

    if client_id:
        try:
            from google.oauth2 import id_token
            from google.auth.transport import requests as google_requests

            info = id_token.verify_oauth2_token(
                body.id_token,
                google_requests.Request(),
                client_id,
            )
            email = info.get("email", email)
            name = info.get("name", name)
            google_sub = info.get("sub", google_sub)
        except Exception as exc:
            raise HTTPException(
                status_code=401,
                detail=f"Google token verification failed: {exc}",
            ) from exc

    user = db.query(User).filter(User.google_id == google_sub).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            email=email,
            full_name=name,
            role=body.role,
            google_id=google_sub,
            avatar_initials=name[:2].upper(),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    if user.role != body.role:
        raise HTTPException(
            status_code=403,
            detail=f"Account role is {user.role}",
        )
    return _token_response(user)


@router.post("/logout")
def logout():
    return {"status": "ok"}
