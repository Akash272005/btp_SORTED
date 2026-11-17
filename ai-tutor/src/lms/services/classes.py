"""Class section helpers — demo seed, school-scoped listing, class ID resolution."""

from sqlalchemy.orm import Session

from src.lms.models import ClassSection, User

DEMO_CLASSES: list[tuple[str, str, str, str]] = [
    ("class-8a", "Class 8-A", "8", "A"),
    ("class-8b", "Class 8-B", "8", "B"),
    ("class-9a", "Class 9-A", "9", "A"),
]


def seed_classes(db: Session, *, school_id: str | None = None, academic_year: str | None = None) -> None:
    """Ensure demo class rows exist (idempotent)."""
    from src.lms.services.schools import join_code_for_class

    year = academic_year or "2025-26"
    for class_id, name, grade, section in DEMO_CLASSES:
        row = db.query(ClassSection).filter(ClassSection.id == class_id).first()
        code = join_code_for_class(grade, section, year)
        if row:
            row.name = name
            row.grade = grade
            row.section = section
            if school_id and not row.school_id:
                row.school_id = school_id
            if not row.academic_year:
                row.academic_year = year
            if row.is_active is None:
                row.is_active = True
            if not row.join_code:
                row.join_code = code
        else:
            db.add(
                ClassSection(
                    id=class_id,
                    name=name,
                    grade=grade,
                    section=section,
                    school_id=school_id,
                    academic_year=year,
                    is_active=True,
                    join_code=code,
                )
            )
    db.commit()


def list_classes(db: Session, *, school_id: str | None = None) -> list[ClassSection]:
    q = db.query(ClassSection)
    if school_id:
        q = q.filter(ClassSection.school_id == school_id)
    rows = q.order_by(ClassSection.grade, ClassSection.section).all()
    if rows:
        return rows
    seed_classes(db, school_id=school_id)
    q = db.query(ClassSection)
    if school_id:
        q = q.filter(ClassSection.school_id == school_id)
    return q.order_by(ClassSection.grade, ClassSection.section).all()


def class_dicts(db: Session) -> list[dict[str, str]]:
    return [{"id": c.id, "name": c.name} for c in list_classes(db)]


def get_class(db: Session, class_id: str | None) -> ClassSection | None:
    if not class_id:
        return None
    return db.query(ClassSection).filter(ClassSection.id == class_id).first()


def get_class_name(db: Session, class_id: str | None, fallback: str = "Class") -> str:
    row = get_class(db, class_id)
    return row.name if row else fallback


def resolve_class_id(
    db: Session,
    class_id: str | None,
    user: User | None = None,
) -> str:
    """Pick a valid class id from query param, user default, or first allowed class."""
    if user and user.role == "teacher":
        from src.lms.services.teacher_subjects import (
            list_mapped_class_ids,
            resolve_teacher_class_id,
        )

        cid = resolve_teacher_class_id(db, class_id, user)
        if cid:
            return cid
        mapped = list_mapped_class_ids(db, user.id)
        if mapped:
            return mapped[0]
        raise ValueError("Teacher has no class assignments")

    candidates: list[str | None] = [class_id]
    if user:
        candidates.append(user.class_id)
    for cid in candidates:
        if cid and get_class(db, cid):
            return cid
    classes = list_classes(db, school_id=user.school_id if user else None)
    if classes:
        return classes[0].id
    return "class-8a"


def safe_resolve_class_id(
    db: Session,
    class_id: str | None,
    user: User | None = None,
) -> str | None:
    """Like resolve_class_id but returns None when a teacher has no assignments."""
    try:
        return resolve_class_id(db, class_id, user)
    except ValueError:
        return None


def student_count_for_class(db: Session, class_id: str) -> int:
    return (
        db.query(User)
        .filter(User.role == "student", User.class_id == class_id)
        .count()
    )
