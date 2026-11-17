"""Shared portal endpoints — school branding for sidebar, login, and headers."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from src.lms.auth.dependencies import get_current_user
from src.lms.db import get_db
from src.lms.models import User
from src.lms.schemas import SchoolBrandingOut
from src.lms.services.schools import get_school_for_user, public_school_branding, school_branding_dict

router = APIRouter(prefix="/api/portal", tags=["lms-portal"])


@router.get("/branding", response_model=SchoolBrandingOut)
def portal_branding(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Authenticated branding for the logged-in user's school."""
    return school_branding_dict(get_school_for_user(db, user))


@router.get("/branding/public", response_model=SchoolBrandingOut)
def portal_branding_public(db: Session = Depends(get_db)):
    """Unauthenticated branding for the login page (demo school until multi-tenant URLs)."""
    return public_school_branding(db)
