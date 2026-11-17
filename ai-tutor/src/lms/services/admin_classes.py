"""Admin class section CRUD — create, archive, join codes; scoped by school."""

from __future__ import annotations

from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from src.lms.models import (
    Assignment,
    ClassSection,
    ClassTeacherSubject,
    ExamCalendar,
    PaperDistribution,
    User,
)
from src.lms.services.classes import student_count_for_class
from src.lms.services.schools import (
    get_school_for_admin,
    join_code_for_class,
    resolve_admin_school_id,
)


def _normalize_grade(grade: str | None) -> str:
    cleaned = (grade or "").strip()
    if not cleaned:
        raise ValueError("Grade is required")
    return cleaned


def _normalize_section(section: str | None) -> str | None:
    cleaned = (section or "").strip().upper()
    return cleaned or None


def _class_id_from_parts(grade: str, section: str | None) -> str:
    g = grade.strip().lower().replace(" ", "")
    s = (_normalize_section(section) or "").lower().replace(" ", "")
    if s:
        return f"class-{g}{s}"
    return f"class-{g}"


def _default_display_name(grade: str, section: str | None) -> str:
    g = grade.strip()
    s = _normalize_section(section)
    if s:
        return f"Class {g}-{s}"
    return f"Class {g}"


def _unique_join_code(
    db: Session,
    *,
    grade: str,
    section: str | None,
    academic_year: str,
    exclude_class_id: str | None = None,
) -> str:
    base = join_code_for_class(grade, section, academic_year)
    candidate = base
    suffix = 2
    while True:
        q = db.query(ClassSection).filter(ClassSection.join_code == candidate)
        if exclude_class_id:
            q = q.filter(ClassSection.id != exclude_class_id)
        if not q.first():
            return candidate
        candidate = f"{base}-{suffix}"
        suffix += 1


def _class_row_dict(db: Session, cls: ClassSection) -> dict[str, Any]:
    return {
        "id": cls.id,
        "name": cls.name,
        "grade": cls.grade,
        "section": _normalize_section(cls.section),
        "school_id": cls.school_id,
        "join_code": cls.join_code,
        "academic_year": cls.academic_year,
        "is_active": bool(cls.is_active),
        "student_count": student_count_for_class(db, cls.id),
    }


def _get_scoped_class(db: Session, *, admin: User, class_id: str) -> ClassSection:
    school_id = resolve_admin_school_id(db, admin)
    row = db.get(ClassSection, class_id)
    if not row or row.school_id != school_id:
        raise LookupError("Class not found")
    return row


def _migrate_class_id(db: Session, *, old_id: str, new_id: str) -> None:
    if old_id == new_id:
        return
    if db.get(ClassSection, new_id):
        raise ValueError("A class with this grade and section already exists")

    db.query(User).filter(User.class_id == old_id).update(
        {"class_id": new_id}, synchronize_session=False
    )
    db.query(ClassTeacherSubject).filter(ClassTeacherSubject.class_id == old_id).update(
        {"class_id": new_id}, synchronize_session=False
    )
    db.query(Assignment).filter(Assignment.class_id == old_id).update(
        {"class_id": new_id}, synchronize_session=False
    )
    db.query(PaperDistribution).filter(PaperDistribution.class_id == old_id).update(
        {"class_id": new_id}, synchronize_session=False
    )
    db.query(ExamCalendar).filter(ExamCalendar.class_id == old_id).update(
        {"class_id": new_id}, synchronize_session=False
    )
    db.execute(
        text("UPDATE class_sections SET id = :new_id WHERE id = :old_id"),
        {"new_id": new_id, "old_id": old_id},
    )
    db.flush()


def list_admin_classes(db: Session, *, admin_user: User) -> list[dict[str, Any]]:
    school_id = resolve_admin_school_id(db, admin_user)
    rows = (
        db.query(ClassSection)
        .filter(ClassSection.school_id == school_id)
        .order_by(ClassSection.grade, ClassSection.section)
        .all()
    )
    return [_class_row_dict(db, cls) for cls in rows]


def create_admin_class(
    db: Session,
    *,
    admin_user: User,
    grade: str,
    section: str | None = None,
    academic_year: str | None = None,
) -> dict[str, Any]:
    grade_norm = _normalize_grade(grade)
    section_norm = _normalize_section(section)

    school = get_school_for_admin(db, admin_user)
    year = (academic_year or school.academic_year or "2025-26").strip()
    class_id = _class_id_from_parts(grade_norm, section_norm)

    existing = db.get(ClassSection, class_id)
    if existing and existing.school_id == school.id:
        raise ValueError(f"Class {existing.name} already exists")

    join_code = _unique_join_code(
        db, grade=grade_norm, section=section_norm, academic_year=year
    )
    row = ClassSection(
        id=class_id,
        name=_default_display_name(grade_norm, section_norm),
        grade=grade_norm,
        section=section_norm,
        school_id=school.id,
        academic_year=year,
        is_active=True,
        join_code=join_code,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _class_row_dict(db, row)


def update_admin_class(
    db: Session,
    *,
    admin_user: User,
    class_id: str,
    name: str | None = None,
    grade: str | None = None,
    section: str | None = None,
    academic_year: str | None = None,
    is_active: bool | None = None,
) -> dict[str, Any]:
    row = _get_scoped_class(db, admin=admin_user, class_id=class_id)
    current_id = row.id

    if grade is not None:
        grade_norm = _normalize_grade(grade)
    else:
        grade_norm = row.grade

    if section is not None:
        section_norm = _normalize_section(section)
    else:
        section_norm = _normalize_section(row.section)

    structure_changed = grade is not None or section is not None
    if structure_changed:
        new_id = _class_id_from_parts(grade_norm, section_norm)
        if new_id != current_id:
            _migrate_class_id(db, old_id=current_id, new_id=new_id)
            row = db.get(ClassSection, new_id)
            if not row:
                raise LookupError("Class not found")
        row.grade = grade_norm
        row.section = section_norm
        year = (row.academic_year or "2025-26").strip()
        row.join_code = _unique_join_code(
            db,
            grade=grade_norm,
            section=section_norm,
            academic_year=year,
            exclude_class_id=row.id,
        )
        if name is None:
            row.name = _default_display_name(grade_norm, section_norm)

    if name is not None:
        cleaned = name.strip()
        if not cleaned:
            raise ValueError("Class name cannot be empty")
        row.name = cleaned

    if academic_year is not None:
        year = academic_year.strip()
        if not year:
            raise ValueError("Academic year cannot be empty")
        row.academic_year = year
        row.join_code = _unique_join_code(
            db,
            grade=row.grade,
            section=row.section,
            academic_year=year,
            exclude_class_id=row.id,
        )

    if is_active is not None:
        row.is_active = is_active

    db.commit()
    db.refresh(row)
    return _class_row_dict(db, row)


def delete_admin_class(db: Session, *, admin_user: User, class_id: str) -> None:
    row = _get_scoped_class(db, admin=admin_user, class_id=class_id)
    count = student_count_for_class(db, row.id)
    if count > 0:
        raise ValueError(
            f"Cannot delete {row.name}: {count} student(s) enrolled. Move or remove them first."
        )
    db.delete(row)
    db.commit()
