"""Seed demo users, school tenant, classes, and teacher assignments."""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from src.lms.auth.password import hash_password
from src.lms.models import (
    Assignment,
    AtRiskLog,
    TopicProficiency,
    User,
)
from src.lms.seed_quizzes import purge_legacy_demo_quizzes
from src.lms.services.classes import seed_classes
from src.lms.services.schools import seed_school

HEATMAP_TOPICS = ["Forces", "Motion", "Optics", "Cells", "Chem Rxn", "Acids"]

DEMO_STUDENTS = [
    ("aarav@student.vidyasetu.in", "Aarav Sharma", "01", [90, 85, 78, 88, 72, 80]),
    ("priya@student.vidyasetu.in", "Priya Tiwari", "14", [35, 42, 38, 45, 40, 43]),
    ("rahul@student.vidyasetu.in", "Rahul Sharma", "24", [90, 88, 82, 85, 78, 76]),
    ("sneha@student.vidyasetu.in", "Sneha Tiwari", "22", [45, 48, 42, 50, 38, 40]),
    ("amit@student.vidyasetu.in", "Amit Joshi", "09", [68, 65, 49, 70, 48, 52]),
    ("pooja@student.vidyasetu.in", "Pooja Reddy", "18", [55, 52, 50, 58, 47, 46]),
    ("vikram@student.vidyasetu.in", "Vikram Singh", "11", [75, 72, 68, 80, 65, 70]),
    ("ananya@student.vidyasetu.in", "Ananya Das", "05", [82, 80, 75, 78, 70, 72]),
]


DEMO_PASSWORDS = {
    "admin@vidyasetu.in": "admin123",
    "ravi@teacher.vidyasetu.in": "teacher123",
    "meera@teacher.vidyasetu.in": "teacher123",
}

STUDENT_DEMO_PASSWORD = "student123"


def backfill_password_plain(db: Session) -> None:
    """Store admin-visible passwords for demo accounts and any row missing it."""
    role_defaults = {
        "admin": "admin123",
        "teacher": "teacher123",
        "student": STUDENT_DEMO_PASSWORD,
    }
    for user in db.query(User).all():
        if user.password_plain:
            continue
        if user.email in DEMO_PASSWORDS:
            user.password_plain = DEMO_PASSWORDS[user.email]
        elif user.role in role_defaults:
            user.password_plain = role_defaults[user.role]
    db.commit()


def _initials(name: str) -> str:
    parts = name.split()
    return "".join(p[0].upper() for p in parts[:2])[:2]


def _add_student_profilency(db: Session, student_id: int, scores: list[float]) -> None:
    for topic, score in zip(HEATMAP_TOPICS, scores):
        subject = (
            "Physics"
            if topic in ("Forces", "Motion", "Optics")
            else "Biology"
            if topic == "Cells"
            else "Chemistry"
        )
        db.add(
            TopicProficiency(
                student_id=student_id,
                topic=topic,
                subject=subject,
                score=float(score),
            )
        )


def seed_quizzes_and_link_assignments(db: Session) -> None:
    """Remove legacy demo quizzes; backfill assignment teacher_id/subject."""
    purge_legacy_demo_quizzes(db)
    teacher = db.query(User).filter(User.role == "teacher").first()
    if not teacher:
        return
    for asgn in db.query(Assignment).all():
        if not asgn.teacher_id:
            asgn.teacher_id = teacher.id
    db.commit()


def seed_if_empty(db: Session) -> None:
    """Idempotent demo seed — school, classes, users, quizzes, teacher mappings."""
    school = seed_school(db)
    seed_classes(db, school_id=school.id, academic_year=school.academic_year)
    if db.query(User).first():
        enrich_teacher_demo(db)
        seed_quizzes_and_link_assignments(db)
        seed_school(db)
        backfill_password_plain(db)
        seed_teacher_assignments(db)
        seed_unassigned_demo_teacher(db)
        return

    teacher = User(
        email="ravi@teacher.vidyasetu.in",
        password_hash=hash_password("teacher123"),
        password_plain="teacher123",
        full_name="Ravi Pandey",
        role="teacher",
        class_id="class-8a",
        grade="Science",
        avatar_initials="RP",
        school_id=school.id,
    )
    admin = User(
        email="admin@vidyasetu.in",
        password_hash=hash_password("admin123"),
        password_plain="admin123",
        full_name="VidyaSetu Admin",
        role="admin",
        avatar_initials="VA",
        school_id=school.id,
    )
    db.add_all([teacher, admin])
    meera = User(
        email="meera@teacher.vidyasetu.in",
        password_hash=hash_password("teacher123"),
        password_plain="teacher123",
        full_name="Meera Singh",
        role="teacher",
        grade="English",
        avatar_initials="MS",
        school_id=school.id,
    )
    db.add(meera)
    db.flush()

    student_ids = []
    for email, name, roll, scores in DEMO_STUDENTS:
        grade = "Grade 9-A" if email == "rahul@student.vidyasetu.in" else "Grade 8-A"
        class_id = "class-9a" if email == "rahul@student.vidyasetu.in" else "class-8a"
        s = User(
            email=email,
            password_hash=hash_password("student123"),
            password_plain="student123",
            full_name=name,
            role="student",
            grade=grade,
            roll_no=roll,
            class_id=class_id,
            avatar_initials=_initials(name),
            school_id=school.id,
        )
        db.add(s)
        db.flush()
        student_ids.append((s.id, scores))

    for sid, scores in student_ids:
        _add_student_profilency(db, sid, scores)

    priya_id = student_ids[1][0]
    db.add(
        AtRiskLog(
            student_id=priya_id,
            subjects="Physics,Chemistry",
            avg_score=42,
            weeks_below=2,
        )
    )

    db.commit()
    backfill_password_plain(db)
    seed_teacher_assignments(db)


def seed_teacher_assignments(db: Session) -> None:
    """Demo mapping: Ravi → Class 8-A → Science + Mathematics."""
    from src.lms.models import ClassTeacherSubject

    school = seed_school(db)
    teacher = db.query(User).filter(User.email == "ravi@teacher.vidyasetu.in").first()
    if not teacher:
        return
    existing = (
        db.query(ClassTeacherSubject)
        .filter(ClassTeacherSubject.teacher_id == teacher.id)
        .first()
    )
    if existing:
        return
    year = school.academic_year or "2025-26"
    for subject in ("Science", "Mathematics"):
        db.add(
            ClassTeacherSubject(
                teacher_id=teacher.id,
                class_id="class-8a",
                subject=subject,
                academic_year=year,
                school_id=school.id,
            )
        )
    db.commit()


def seed_unassigned_demo_teacher(db: Session) -> None:
    """Ensure Meera Singh exists as an unassigned teacher (matches admin mockup)."""
    school = seed_school(db)
    existing = db.query(User).filter(User.email == "meera@teacher.vidyasetu.in").first()
    if existing:
        return
    db.add(
        User(
            email="meera@teacher.vidyasetu.in",
            password_hash=hash_password("teacher123"),
            password_plain="teacher123",
            full_name="Meera Singh",
            role="teacher",
            grade="English",
            avatar_initials="MS",
            school_id=school.id,
        )
    )
    db.commit()


def enrich_teacher_demo(db: Session) -> None:
    """Add demo students / update teacher for existing DBs."""
    school = seed_school(db)
    seed_teacher_assignments(db)
    seed_unassigned_demo_teacher(db)
    rahul = db.query(User).filter(User.email == "rahul@student.vidyasetu.in").first()
    if rahul:
        rahul.full_name = "Rahul Sharma"
        rahul.grade = "Grade 9-A"
        rahul.class_id = "class-9a"
        rahul.roll_no = "24"
        rahul.avatar_initials = _initials(rahul.full_name)

    if db.query(User).filter(User.role == "student", User.class_id == "class-8a").count() >= 6:
        db.commit()
        return

    teacher = db.query(User).filter(User.role == "teacher").first()
    if teacher and teacher.full_name in ("Anita Sharma", "Ravi Pandey"):
        teacher.full_name = "Ravi Pandey"
        teacher.avatar_initials = "RP"
        teacher.grade = "Science"

    for email, name, roll, scores in DEMO_STUDENTS:
        if db.query(User).filter(User.email == email).first():
            continue
        s = User(
            email=email,
            password_hash=hash_password("student123"),
            password_plain="student123",
            full_name=name,
            role="student",
            grade="Grade 8-A",
            roll_no=roll,
            class_id="class-8a",
            avatar_initials=_initials(name),
            school_id=school.id,
        )
        db.add(s)
        db.flush()
        _add_student_profilency(db, s.id, scores)

    db.commit()
