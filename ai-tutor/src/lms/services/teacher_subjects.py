"""Teacher ↔ class ↔ subject mappings — admin assign; teacher portal class scope."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy.orm import Session

from src.lms.models import ClassSection, ClassTeacherSubject, User
from src.lms.services.classes import get_class_name, list_classes
from src.lms.services.schools import get_school_for_admin, resolve_admin_school_id

DEFAULT_SUBJECTS = [
    "Mathematics",
    "Science",
    "English",
    "Hindi",
    "Social Science",
    "Computer Science",
    "General",
]


def _normalize_subjects(subjects: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in subjects:
        s = raw.strip()
        if not s:
            continue
        key = s.casefold()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(s)
    return cleaned


def list_mapped_class_ids(db: Session, teacher_id: int) -> list[str]:
    rows = (
        db.query(ClassTeacherSubject.class_id)
        .filter(ClassTeacherSubject.teacher_id == teacher_id)
        .distinct()
        .all()
    )
    return [r[0] for r in rows]


def list_mapped_classes(db: Session, teacher: User) -> list[ClassSection]:
    class_ids = list_mapped_class_ids(db, teacher.id)
    if not class_ids:
        return []
    rows = (
        db.query(ClassSection)
        .filter(ClassSection.id.in_(class_ids))
        .order_by(ClassSection.grade, ClassSection.section)
        .all()
    )
    return [r for r in rows if r.is_active is not False]


def mapped_class_dicts(db: Session, teacher: User) -> list[dict[str, str]]:
    return [{"id": c.id, "name": c.name} for c in list_mapped_classes(db, teacher)]


def teaching_subjects_for_class(db: Session, *, teacher_id: int, class_id: str) -> list[str]:
    rows = (
        db.query(ClassTeacherSubject.subject)
        .filter(
            ClassTeacherSubject.teacher_id == teacher_id,
            ClassTeacherSubject.class_id == class_id,
        )
        .order_by(ClassTeacherSubject.subject)
        .all()
    )
    return [r[0] for r in rows]


def resolve_teacher_class_id(
    db: Session,
    class_id: str | None,
    teacher: User,
) -> str | None:
    mapped = list_mapped_class_ids(db, teacher.id)
    if not mapped:
        return None
    if class_id and class_id in mapped:
        return class_id
    return mapped[0]


def _assignment_groups(
    db: Session, *, school_id: str
) -> dict[tuple[int, str], list[ClassTeacherSubject]]:
    rows = (
        db.query(ClassTeacherSubject)
        .filter(ClassTeacherSubject.school_id == school_id)
        .order_by(ClassTeacherSubject.teacher_id, ClassTeacherSubject.class_id)
        .all()
    )
    groups: dict[tuple[int, str], list[ClassTeacherSubject]] = defaultdict(list)
    for row in rows:
        groups[(row.teacher_id, row.class_id)].append(row)
    return groups


def list_admin_teacher_subjects(db: Session, *, admin_user: User) -> dict[str, Any]:
    school_id = resolve_admin_school_id(db, admin_user)
    groups = _assignment_groups(db, school_id=school_id)

    teachers = (
        db.query(User)
        .filter(User.school_id == school_id, User.role == "teacher")
        .order_by(User.full_name)
        .all()
    )
    teacher_by_id = {t.id: t for t in teachers}
    assigned_teacher_ids = {tid for tid, _ in groups.keys()}

    assignments: list[dict[str, Any]] = []
    for (teacher_id, class_id), rows in sorted(
        groups.items(),
        key=lambda item: (
            teacher_by_id[item[0][0]].full_name if item[0][0] in teacher_by_id else "",
            item[0][1],
        ),
    ):
        teacher = teacher_by_id.get(teacher_id)
        if not teacher:
            continue
        subjects = sorted({r.subject for r in rows}, key=str.casefold)
        assignments.append(
            {
                "id": min(r.id for r in rows),
                "teacher_id": teacher_id,
                "teacher_name": teacher.full_name,
                "teacher_email": teacher.email,
                "class_id": class_id,
                "class_name": get_class_name(db, class_id, class_id),
                "subjects": subjects,
                "academic_year": rows[0].academic_year,
            }
        )

    unassigned = [
        {
            "id": t.id,
            "full_name": t.full_name,
            "email": t.email,
        }
        for t in teachers
        if t.id not in assigned_teacher_ids
    ]

    return {
        "assignments": assignments,
        "unassigned_teachers": unassigned,
        "available_subjects": DEFAULT_SUBJECTS,
    }


def _validate_teacher_and_class(
    db: Session, *, school_id: str, teacher_id: int, class_id: str
) -> tuple[User, ClassSection]:
    teacher = db.get(User, teacher_id)
    if not teacher or teacher.school_id != school_id or teacher.role != "teacher":
        raise ValueError("Teacher not found")
    cls = db.get(ClassSection, class_id)
    if not cls or cls.school_id != school_id:
        raise ValueError("Class not found")
    if cls.is_active is False:
        raise ValueError("Cannot assign to an archived class")
    return teacher, cls


def create_teacher_assignment(
    db: Session,
    *,
    admin_user: User,
    teacher_id: int,
    class_id: str,
    subjects: list[str],
    academic_year: str | None = None,
) -> dict[str, Any]:
    school = get_school_for_admin(db, admin_user)
    teacher, _cls = _validate_teacher_and_class(
        db, school_id=school.id, teacher_id=teacher_id, class_id=class_id
    )
    subject_list = _normalize_subjects(subjects)
    if not subject_list:
        raise ValueError("Select at least one subject")

    year = (academic_year or school.academic_year or "2025-26").strip()
    existing = (
        db.query(ClassTeacherSubject)
        .filter(
            ClassTeacherSubject.teacher_id == teacher_id,
            ClassTeacherSubject.class_id == class_id,
            ClassTeacherSubject.school_id == school.id,
        )
        .all()
    )
    existing_subjects = {r.subject.casefold(): r for r in existing}

    for subject in subject_list:
        key = subject.casefold()
        if key in existing_subjects:
            row = existing_subjects[key]
            row.academic_year = year
            continue
        db.add(
            ClassTeacherSubject(
                teacher_id=teacher.id,
                class_id=class_id,
                subject=subject,
                academic_year=year,
                school_id=school.id,
            )
        )

    db.commit()
    payload = list_admin_teacher_subjects(db, admin_user=admin_user)
    created = next(
        (
            a
            for a in payload["assignments"]
            if a["teacher_id"] == teacher_id and a["class_id"] == class_id
        ),
        None,
    )
    if not created:
        raise LookupError("Assignment not found after save")
    return created


def _group_for_mapping_id(db: Session, *, school_id: str, mapping_id: int) -> tuple[int, str]:
    row = db.get(ClassTeacherSubject, mapping_id)
    if not row or row.school_id != school_id:
        raise LookupError("Assignment not found")
    return row.teacher_id, row.class_id


def update_teacher_assignment(
    db: Session,
    *,
    admin_user: User,
    mapping_id: int,
    class_id: str | None = None,
    subjects: list[str] | None = None,
    academic_year: str | None = None,
) -> dict[str, Any]:
    school_id = resolve_admin_school_id(db, admin_user)
    teacher_id, current_class_id = _group_for_mapping_id(
        db, school_id=school_id, mapping_id=mapping_id
    )

    target_class_id = class_id.strip() if class_id else current_class_id
    if class_id:
        _validate_teacher_and_class(
            db, school_id=school_id, teacher_id=teacher_id, class_id=target_class_id
        )

    if target_class_id != current_class_id:
        conflict = (
            db.query(ClassTeacherSubject)
            .filter(
                ClassTeacherSubject.teacher_id == teacher_id,
                ClassTeacherSubject.class_id == target_class_id,
                ClassTeacherSubject.school_id == school_id,
            )
            .first()
        )
        if conflict:
            raise ValueError("This teacher is already assigned to that class")

    year = None
    if academic_year is not None:
        year = academic_year.strip()
        if not year:
            raise ValueError("Academic year cannot be empty")

    if subjects is not None:
        subject_list = _normalize_subjects(subjects)
        if not subject_list:
            raise ValueError("Select at least one subject")
        (
            db.query(ClassTeacherSubject)
            .filter(
                ClassTeacherSubject.teacher_id == teacher_id,
                ClassTeacherSubject.class_id == current_class_id,
                ClassTeacherSubject.school_id == school_id,
            )
            .delete(synchronize_session=False)
        )
        school = get_school_for_admin(db, admin_user)
        use_year = year or school.academic_year or "2025-26"
        for subject in subject_list:
            db.add(
                ClassTeacherSubject(
                    teacher_id=teacher_id,
                    class_id=target_class_id,
                    subject=subject,
                    academic_year=use_year,
                    school_id=school_id,
                )
            )
    elif target_class_id != current_class_id:
        rows = (
            db.query(ClassTeacherSubject)
            .filter(
                ClassTeacherSubject.teacher_id == teacher_id,
                ClassTeacherSubject.class_id == current_class_id,
                ClassTeacherSubject.school_id == school_id,
            )
            .all()
        )
        for row in rows:
            row.class_id = target_class_id
            if year:
                row.academic_year = year
    elif year:
        (
            db.query(ClassTeacherSubject)
            .filter(
                ClassTeacherSubject.teacher_id == teacher_id,
                ClassTeacherSubject.class_id == current_class_id,
                ClassTeacherSubject.school_id == school_id,
            )
            .update({"academic_year": year}, synchronize_session=False)
        )

    db.commit()
    payload = list_admin_teacher_subjects(db, admin_user=admin_user)
    updated = next(
        (
            a
            for a in payload["assignments"]
            if a["teacher_id"] == teacher_id and a["class_id"] == target_class_id
        ),
        None,
    )
    if not updated:
        raise LookupError("Assignment not found after update")
    return updated


def delete_teacher_assignment(
    db: Session, *, admin_user: User, mapping_id: int
) -> None:
    school_id = resolve_admin_school_id(db, admin_user)
    teacher_id, class_id = _group_for_mapping_id(
        db, school_id=school_id, mapping_id=mapping_id
    )
    (
        db.query(ClassTeacherSubject)
        .filter(
            ClassTeacherSubject.teacher_id == teacher_id,
            ClassTeacherSubject.class_id == class_id,
            ClassTeacherSubject.school_id == school_id,
        )
        .delete(synchronize_session=False)
    )
    db.commit()
