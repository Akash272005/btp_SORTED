"""School tenant helpers — multi-school scoping, branding, and demo seed backfill."""

from __future__ import annotations

import os

from sqlalchemy.orm import Session

from src.lms.models import ClassSection, School, User

DEMO_SCHOOL_ID = "school-vidyasetu-demo"
DEFAULT_SCHOOL_NAME = os.getenv("LMS_SCHOOL_NAME", "VidyaSetu Demo School")
DEFAULT_ACADEMIC_YEAR = os.getenv("LMS_ACADEMIC_YEAR", "2025-26")
DEFAULT_BOARD = os.getenv("LMS_SCHOOL_BOARD", "CBSE")

BOOL_SCHOOL_SETTING_KEYS = frozenset(
    {
        "ai_quiz_generation",
        "ai_paper_grading",
        "video_learning",
        "parent_notifications",
        "email_on_join_code_signup",
        "weekly_summary_email",
    }
)

DEFAULT_SCHOOL_SETTINGS: dict = {
    "ai_quiz_generation": True,
    "ai_paper_grading": True,
    "video_learning": True,
    "parent_notifications": False,
    "email_on_join_code_signup": True,
    "weekly_summary_email": False,
    "session_start_month": 4,
    "session_end_month": 3,
}


def join_code_for_class(
    grade: str, section: str | None, academic_year: str | None = None
) -> str:
    year = (academic_year or DEFAULT_ACADEMIC_YEAR).split("-")[0]
    g = grade.strip()
    s = (section or "").strip().upper()
    if s:
        return f"JOIN-{g}{s}-{year}"
    return f"JOIN-{g}-{year}"


def ensure_demo_school(db: Session) -> School:
    row = db.get(School, DEMO_SCHOOL_ID)
    if row:
        if not row.settings:
            row.settings = dict(DEFAULT_SCHOOL_SETTINGS)
        return row

    row = School(
        id=DEMO_SCHOOL_ID,
        name=DEFAULT_SCHOOL_NAME,
        board=DEFAULT_BOARD,
        academic_year=DEFAULT_ACADEMIC_YEAR,
        settings=dict(DEFAULT_SCHOOL_SETTINGS),
    )
    db.add(row)
    db.flush()
    return row


def backfill_school_links(db: Session, school: School) -> None:
    """Attach legacy demo rows to the demo school and ensure join codes."""
    for user in db.query(User).filter(User.school_id.is_(None)).all():
        user.school_id = school.id

    for cls in db.query(ClassSection).all():
        if not cls.school_id:
            cls.school_id = school.id
        if not cls.academic_year:
            cls.academic_year = school.academic_year
        if cls.is_active is None:
            cls.is_active = True
        if not cls.join_code:
            cls.join_code = join_code_for_class(
                cls.grade, cls.section, cls.academic_year or school.academic_year
            )

    db.flush()


def seed_school(db: Session) -> School:
    school = ensure_demo_school(db)
    backfill_school_links(db, school)
    db.commit()
    return school


def resolve_admin_school_id(db: Session, admin: User) -> str:
    if admin.school_id:
        school = db.get(School, admin.school_id)
        if school:
            return school.id
    school = ensure_demo_school(db)
    if not admin.school_id:
        admin.school_id = school.id
        db.commit()
    return school.id


def get_school_for_admin(db: Session, admin: User) -> School:
    school_id = resolve_admin_school_id(db, admin)
    school = db.get(School, school_id)
    if not school:
        return ensure_demo_school(db)
    return school


def resolve_user_school_id(db: Session, user: User) -> str:
    if user.school_id:
        school = db.get(School, user.school_id)
        if school:
            return school.id
    if user.class_id:
        cls = db.get(ClassSection, user.class_id)
        if cls and cls.school_id:
            user.school_id = cls.school_id
            db.commit()
            return cls.school_id
    school = ensure_demo_school(db)
    if not user.school_id:
        user.school_id = school.id
        db.commit()
    return school.id


def get_school_for_user(db: Session, user: User) -> School:
    school_id = resolve_user_school_id(db, user)
    school = db.get(School, school_id)
    if not school:
        return ensure_demo_school(db)
    return school


def school_branding_dict(school: School) -> dict[str, str | None]:
    return {
        "school_id": school.id,
        "school_name": school.name,
        "logo_url": school.logo_url,
        "academic_year": school.academic_year,
    }


def public_school_branding(db: Session) -> dict[str, str | None]:
    return school_branding_dict(ensure_demo_school(db))


def school_user_ids(db: Session, school_id: str, *, role: str | None = None) -> list[int]:
    q = db.query(User.id).filter(User.school_id == school_id)
    if role:
        q = q.filter(User.role == role)
    return [row[0] for row in q.all()]


def school_class_ids(db: Session, school_id: str, *, active_only: bool = True) -> list[str]:
    q = db.query(ClassSection.id).filter(ClassSection.school_id == school_id)
    if active_only:
        q = q.filter(ClassSection.is_active.is_(True))
    return [row[0] for row in q.all()]
