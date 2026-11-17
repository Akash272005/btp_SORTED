"""Admin student operations — move between classes, CSV bulk import, roll uniqueness."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from src.lms.auth.password import hash_password
from src.lms.models import ClassSection, User
from src.lms.services.classes import get_class_name
from src.lms.services.schools import resolve_admin_school_id

DEFAULT_IMPORT_PASSWORD = "student123"


def normalize_roll_no(roll_no: str | None) -> str | None:
    if roll_no is None:
        return None
    cleaned = roll_no.strip()
    return cleaned if cleaned else None


def find_roll_no_conflict(
    db: Session,
    *,
    school_id: str,
    class_id: str,
    roll_no: str,
    exclude_user_id: int | None = None,
) -> User | None:
    target = roll_no.strip().casefold()
    q = db.query(User).filter(
        User.school_id == school_id,
        User.class_id == class_id,
        User.role == "student",
    )
    if exclude_user_id is not None:
        q = q.filter(User.id != exclude_user_id)
    for row in q.all():
        if row.roll_no and row.roll_no.strip().casefold() == target:
            return row
    return None


def assert_unique_student_roll_no(
    db: Session,
    *,
    school_id: str,
    class_id: str | None,
    roll_no: str | None,
    exclude_user_id: int | None = None,
) -> None:
    """Raise ValueError if another student in the same class already has this roll number."""
    normalized = normalize_roll_no(roll_no)
    if not normalized or not class_id:
        return
    conflict = find_roll_no_conflict(
        db,
        school_id=school_id,
        class_id=class_id,
        roll_no=normalized,
        exclude_user_id=exclude_user_id,
    )
    if conflict:
        raise ValueError(
            f"Roll number {normalized} is already used by {conflict.full_name} in this class"
        )


def _initials(name: str) -> str:
    parts = name.split()
    return "".join(p[0].upper() for p in parts[:2])[:2]


def resolve_import_class_id(db: Session, *, school_id: str, raw: str) -> str | None:
    value = raw.strip()
    if not value:
        return None
    by_id = db.get(ClassSection, value)
    if by_id and by_id.school_id == school_id:
        return by_id.id
    by_name = (
        db.query(ClassSection)
        .filter(ClassSection.school_id == school_id, ClassSection.name.ilike(value))
        .first()
    )
    if by_name:
        return by_name.id
    return None


def move_student_class(
    db: Session,
    *,
    admin_user: User,
    student_id: int,
    class_id: str,
    roll_no: str | None = None,
) -> User:
    school_id = resolve_admin_school_id(db, admin_user)
    student = db.get(User, student_id)
    if not student or student.school_id != school_id or student.role != "student":
        raise LookupError("Student not found")

    cls = db.get(ClassSection, class_id.strip())
    if not cls or cls.school_id != school_id:
        raise ValueError("Class not found")
    if cls.is_active is False:
        raise ValueError("Cannot move to an archived class")

    if roll_no is not None:
        student.roll_no = normalize_roll_no(roll_no)

    assert_unique_student_roll_no(
        db,
        school_id=school_id,
        class_id=cls.id,
        roll_no=student.roll_no,
        exclude_user_id=student.id,
    )

    student.class_id = cls.id
    student.grade = cls.name
    db.commit()
    db.refresh(student)
    return student


def import_students(
    db: Session,
    *,
    admin_user: User,
    rows: list[dict[str, Any]],
    default_password: str | None = None,
) -> dict[str, Any]:
    school_id = resolve_admin_school_id(db, admin_user)
    password = (default_password or DEFAULT_IMPORT_PASSWORD).strip()
    if not password:
        raise ValueError("Default password cannot be empty")

    created = 0
    skipped = 0
    errors: list[dict[str, Any]] = []
    batch_rolls: set[tuple[str, str]] = set()

    for index, row in enumerate(rows, start=1):
        full_name = str(row.get("full_name") or row.get("name") or "").strip()
        email = str(row.get("email") or "").strip().lower()
        class_raw = str(row.get("class_id") or row.get("class") or "").strip()
        roll_no = normalize_roll_no(str(row.get("roll_no") or row.get("roll") or "") or None)

        if not full_name:
            errors.append({"row": index, "email": email or None, "reason": "Name is required"})
            skipped += 1
            continue
        if not email:
            errors.append({"row": index, "email": None, "reason": "Email is required"})
            skipped += 1
            continue
        if not class_raw:
            errors.append({"row": index, "email": email, "reason": "Class is required"})
            skipped += 1
            continue

        class_id = resolve_import_class_id(db, school_id=school_id, raw=class_raw)
        if not class_id:
            errors.append(
                {
                    "row": index,
                    "email": email,
                    "reason": f"Unknown class: {class_raw}",
                }
            )
            skipped += 1
            continue

        existing = db.query(User).filter(User.email == email).first()
        if existing:
            errors.append({"row": index, "email": email, "reason": "Email already registered"})
            skipped += 1
            continue

        if roll_no:
            batch_key = (class_id, roll_no.casefold())
            if batch_key in batch_rolls:
                errors.append(
                    {
                        "row": index,
                        "email": email,
                        "reason": f"Duplicate roll number {roll_no} in this CSV for the same class",
                    }
                )
                skipped += 1
                continue
            try:
                assert_unique_student_roll_no(
                    db,
                    school_id=school_id,
                    class_id=class_id,
                    roll_no=roll_no,
                )
            except ValueError as exc:
                errors.append({"row": index, "email": email, "reason": str(exc)})
                skipped += 1
                continue
            batch_rolls.add(batch_key)

        cls = db.get(ClassSection, class_id)
        db.add(
            User(
                email=email,
                password_hash=hash_password(password),
                password_plain=password,
                full_name=full_name,
                role="student",
                grade=cls.name if cls else get_class_name(db, class_id, class_raw),
                roll_no=roll_no,
                class_id=class_id,
                avatar_initials=_initials(full_name),
                school_id=school_id,
            )
        )
        created += 1

    db.commit()
    return {"created": created, "skipped": skipped, "errors": errors}
