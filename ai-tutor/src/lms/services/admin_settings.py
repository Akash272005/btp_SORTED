"""Admin school settings — profile, session calendar, feature toggles, logo upload."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import UploadFile
from sqlalchemy.orm import Session

from src.lms.models import School, User
from src.lms.services.schools import (
    BOOL_SCHOOL_SETTING_KEYS,
    DEFAULT_SCHOOL_SETTINGS,
    get_school_for_admin,
)

PROJECT_ROOT = Path(__file__).resolve().parents[3]
SCHOOL_LOGO_DIR = PROJECT_ROOT / "web" / "public" / "school-logos"
ALLOWED_LOGO_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}
MAX_LOGO_BYTES = 2 * 1024 * 1024

NCERT_CURRICULUM_BOARD = "CBSE"
NCERT_CURRICULUM_LABEL = "CBSE (NCERT)"


def _normalize_session_month(value: Any, *, default: int) -> int:
    try:
        month = int(value)
    except (TypeError, ValueError):
        month = default
    return max(1, min(12, month))


def _settings_dict(school: School) -> dict[str, Any]:
    raw = school.settings if isinstance(school.settings, dict) else {}
    merged = dict(DEFAULT_SCHOOL_SETTINGS)
    for key in BOOL_SCHOOL_SETTING_KEYS:
        if key in raw:
            merged[key] = bool(raw[key])
    merged["session_start_month"] = _normalize_session_month(
        raw.get("session_start_month", merged["session_start_month"]),
        default=4,
    )
    merged["session_end_month"] = _normalize_session_month(
        raw.get("session_end_month", merged["session_end_month"]),
        default=3,
    )
    return merged


def _bool_settings(settings: dict[str, Any]) -> dict[str, bool]:
    return {key: bool(settings[key]) for key in BOOL_SCHOOL_SETTING_KEYS}


def get_admin_settings(db: Session, admin: User) -> dict[str, Any]:
    school = get_school_for_admin(db, admin)
    settings = _settings_dict(school)
    bool_settings = _bool_settings(settings)
    return {
        "school_id": school.id,
        "school_name": school.name,
        "board": school.board,
        "board_label": NCERT_CURRICULUM_LABEL,
        "curriculum": NCERT_CURRICULUM_LABEL,
        "academic_year": school.academic_year,
        "session_start_month": settings["session_start_month"],
        "session_end_month": settings["session_end_month"],
        "logo_url": school.logo_url,
        "address": school.address,
        "settings": bool_settings,
        "notifications": {
            "email_on_join_code_signup": bool_settings.get("email_on_join_code_signup", True),
            "weekly_summary_email": bool_settings.get("weekly_summary_email", False),
        },
    }


def update_admin_settings(db: Session, admin: User, payload: dict[str, Any]) -> dict[str, Any]:
    school = get_school_for_admin(db, admin)

    if payload.get("school_name") is not None:
        school.name = payload["school_name"]
    # NCERT MVP: curriculum stays CBSE; UI shows "CBSE (NCERT)" read-only.
    if payload.get("academic_year") is not None:
        academic_year = str(payload["academic_year"]).strip()
        if not academic_year:
            raise ValueError("Academic year cannot be empty")
        if len(academic_year) > 32:
            raise ValueError("Academic year is too long")
        school.academic_year = academic_year
    if payload.get("logo_url") is not None:
        school.logo_url = payload["logo_url"]
    if payload.get("address") is not None:
        school.address = payload["address"]

    current = _settings_dict(school)
    if payload.get("session_start_month") is not None:
        current["session_start_month"] = _normalize_session_month(
            payload["session_start_month"],
            default=4,
        )
    if payload.get("session_end_month") is not None:
        current["session_end_month"] = _normalize_session_month(
            payload["session_end_month"],
            default=3,
        )
    if payload.get("settings"):
        for key, value in payload["settings"].items():
            if key in BOOL_SCHOOL_SETTING_KEYS:
                current[key] = bool(value)
    if payload.get("notifications"):
        current.update(payload["notifications"])
    school.settings = current

    db.commit()
    db.refresh(school)
    return get_admin_settings(db, admin)


async def save_school_logo(db: Session, admin: User, file: UploadFile) -> dict[str, Any]:
    school = get_school_for_admin(db, admin)
    if not file.filename:
        raise ValueError("No file selected")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_LOGO_EXTENSIONS:
        raise ValueError("Logo must be PNG, JPG, or WEBP")
    raw = await file.read()
    if len(raw) > MAX_LOGO_BYTES:
        raise ValueError("Logo must be 2MB or smaller")
    SCHOOL_LOGO_DIR.mkdir(parents=True, exist_ok=True)
    dest = SCHOOL_LOGO_DIR / f"{school.id}{ext}"
    dest.write_bytes(raw)
    school.logo_url = f"/school-logos/{school.id}{ext}"
    db.commit()
    db.refresh(school)
    return get_admin_settings(db, admin)
