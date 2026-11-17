"""Admin portal API — school-scoped CRUD for dashboard, settings, classes, teachers, students, and users."""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from src.lms.auth.dependencies import require_roles
from src.lms.auth.password import hash_password
from src.lms.db import get_db
from src.lms.models import User
from src.lms.schemas import (
    AdminClassCreate,
    AdminClassListOut,
    AdminClassUpdate,
    AdminDashboardOut,
    AdminSettingsOut,
    AdminSettingsUpdate,
    AdminStudentImportOut,
    AdminStudentImportRequest,
    AdminStudentMove,
    AdminTeacherAssignmentOut,
    AdminTeacherSubjectCreate,
    AdminTeacherSubjectUpdate,
    AdminTeacherSubjectsListOut,
    AdminUserCreate,
    AdminUserOut,
    AdminUserUpdate,
)
from src.lms.services.admin_classes import (
    create_admin_class,
    delete_admin_class,
    list_admin_classes,
    update_admin_class,
)
from src.lms.services.admin_dashboard import build_admin_dashboard
from src.lms.services.admin_settings import get_admin_settings, save_school_logo, update_admin_settings
from src.lms.services.admin_students import (
    assert_unique_student_roll_no,
    import_students,
    move_student_class,
    normalize_roll_no,
)
from src.lms.services.schools import resolve_admin_school_id
from src.lms.services.teacher_subjects import (
    create_teacher_assignment,
    delete_teacher_assignment,
    list_admin_teacher_subjects,
    update_teacher_assignment,
)

router = APIRouter(prefix="/api/admin", tags=["lms-admin"])


def _initials(name: str) -> str:
    parts = name.split()
    return "".join(p[0].upper() for p in parts[:2])[:2]


def _scoped_user_query(db: Session, admin: User):
    """Return a User query limited to the admin's school tenant."""
    school_id = resolve_admin_school_id(db, admin)
    return db.query(User).filter(User.school_id == school_id)


# ── Dashboard & school settings ──────────────────────────────────────────────

@router.get("/dashboard", response_model=AdminDashboardOut)
def admin_dashboard(
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    return build_admin_dashboard(db, admin_user=user)


@router.get("/settings", response_model=AdminSettingsOut)
def admin_settings_get(
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    return get_admin_settings(db, user)


@router.patch("/settings", response_model=AdminSettingsOut)
def admin_settings_patch(
    body: AdminSettingsUpdate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    payload = body.model_dump(exclude_unset=True)
    try:
        return update_admin_settings(db, user, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/settings/logo", response_model=AdminSettingsOut)
async def admin_settings_logo(
    file: UploadFile = File(...),
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    try:
        return await save_school_logo(db, user, file)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Class sections (join codes, archive) ─────────────────────────────────────

@router.get("/classes", response_model=list[AdminClassListOut])
def admin_classes(
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    return list_admin_classes(db, admin_user=user)


@router.post("/classes", response_model=AdminClassListOut, status_code=201)
def admin_create_class(
    body: AdminClassCreate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    try:
        return create_admin_class(
            db,
            admin_user=user,
            grade=body.grade,
            section=body.section,
            academic_year=body.academic_year,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/classes/{class_id}", response_model=AdminClassListOut)
def admin_update_class(
    class_id: str,
    body: AdminClassUpdate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    try:
        return update_admin_class(
            db,
            admin_user=user,
            class_id=class_id,
            name=body.name,
            grade=body.grade,
            section=body.section,
            academic_year=body.academic_year,
            is_active=body.is_active,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Class not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/classes/{class_id}", status_code=204)
def admin_delete_class(
    class_id: str,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    try:
        delete_admin_class(db, admin_user=user, class_id=class_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Class not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── Teacher ↔ class ↔ subject mappings ───────────────────────────────────────

@router.get("/teacher-subjects", response_model=AdminTeacherSubjectsListOut)
def admin_list_teacher_subjects(
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    return list_admin_teacher_subjects(db, admin_user=user)


@router.post("/teacher-subjects", response_model=AdminTeacherAssignmentOut, status_code=201)
def admin_create_teacher_subject(
    body: AdminTeacherSubjectCreate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    try:
        return create_teacher_assignment(
            db,
            admin_user=user,
            teacher_id=body.teacher_id,
            class_id=body.class_id,
            subjects=body.subjects,
            academic_year=body.academic_year,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Assignment not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.patch("/teacher-subjects/{mapping_id}", response_model=AdminTeacherAssignmentOut)
def admin_update_teacher_subject(
    mapping_id: int,
    body: AdminTeacherSubjectUpdate,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    try:
        return update_teacher_assignment(
            db,
            admin_user=user,
            mapping_id=mapping_id,
            class_id=body.class_id,
            subjects=body.subjects,
            academic_year=body.academic_year,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Assignment not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/teacher-subjects/{mapping_id}", status_code=204)
def admin_delete_teacher_subject(
    mapping_id: int,
    user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    try:
        delete_teacher_assignment(db, admin_user=user, mapping_id=mapping_id)
    except LookupError:
        raise HTTPException(status_code=404, detail="Assignment not found") from None


# ── Students (class ops + bulk import) ───────────────────────────────────────

@router.patch("/students/{student_id}/class", response_model=AdminUserOut)
def admin_move_student_class(
    student_id: int,
    body: AdminStudentMove,
    admin: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    try:
        return move_student_class(
            db,
            admin_user=admin,
            student_id=student_id,
            class_id=body.class_id,
            roll_no=body.roll_no,
        )
    except LookupError:
        raise HTTPException(status_code=404, detail="Student not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/students/import", response_model=AdminStudentImportOut)
def admin_import_students(
    body: AdminStudentImportRequest,
    admin: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if not body.rows:
        raise HTTPException(status_code=400, detail="No rows to import")
    try:
        row_dicts = [row.model_dump(by_alias=True) for row in body.rows]
        return import_students(
            db,
            admin_user=admin,
            rows=row_dicts,
            default_password=body.default_password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


# ── List users ────────────────────────────────────────────────────────────────

@router.get("/users", response_model=list[AdminUserOut])
def list_users(
    role: str | None = Query(None, description="Filter by role: student | teacher | admin"),
    class_id: str | None = Query(None, description="Filter by class_id, e.g. class-9a"),
    search: str | None = Query(None, description="Name or email substring search"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    admin: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    q = _scoped_user_query(db, admin)
    if role:
        q = q.filter(User.role == role)
    if class_id:
        q = q.filter(User.class_id == class_id)
    if search:
        like = f"%{search}%"
        q = q.filter(User.full_name.ilike(like) | User.email.ilike(like))
    return q.order_by(User.created_at.desc()).offset(skip).limit(limit).all()


# ── Get single user ───────────────────────────────────────────────────────────

@router.get("/users/{user_id}", response_model=AdminUserOut)
def get_user(
    user_id: int,
    admin: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    school_id = resolve_admin_school_id(db, admin)
    user = db.get(User, user_id)
    if not user or user.school_id != school_id:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# ── Create user ───────────────────────────────────────────────────────────────

@router.post("/users", response_model=AdminUserOut, status_code=201)
def create_user(
    body: AdminUserCreate,
    admin: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    school_id = resolve_admin_school_id(db, admin)
    roll_no = normalize_roll_no(body.roll_no) if body.role == "student" else body.roll_no
    if body.role == "student":
        try:
            assert_unique_student_roll_no(
                db,
                school_id=school_id,
                class_id=body.class_id,
                roll_no=roll_no,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        password_plain=body.password,
        full_name=body.full_name,
        role=body.role,
        grade=body.grade,
        roll_no=roll_no,
        class_id=body.class_id,
        avatar_initials=_initials(body.full_name),
        school_id=school_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


# ── Update user ───────────────────────────────────────────────────────────────

@router.patch("/users/{user_id}", response_model=AdminUserOut)
def update_user(
    user_id: int,
    body: AdminUserUpdate,
    admin: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    school_id = resolve_admin_school_id(db, admin)
    user = db.get(User, user_id)
    if not user or user.school_id != school_id:
        raise HTTPException(status_code=404, detail="User not found")
    if body.full_name is not None:
        user.full_name = body.full_name
        user.avatar_initials = _initials(body.full_name)
    if body.grade is not None:
        user.grade = body.grade
    if body.roll_no is not None:
        user.roll_no = normalize_roll_no(body.roll_no) if user.role == "student" else body.roll_no
    if body.class_id is not None:
        user.class_id = body.class_id
    if body.password is not None:
        user.password_hash = hash_password(body.password)
        user.password_plain = body.password
    if user.role == "student":
        try:
            assert_unique_student_roll_no(
                db,
                school_id=school_id,
                class_id=user.class_id,
                roll_no=user.roll_no,
                exclude_user_id=user.id,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    db.commit()
    db.refresh(user)
    return user


# ── Delete user ───────────────────────────────────────────────────────────────

@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    current: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if user_id == current.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account")
    school_id = resolve_admin_school_id(db, current)
    user = db.get(User, user_id)
    if not user or user.school_id != school_id:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(user)
    db.commit()
