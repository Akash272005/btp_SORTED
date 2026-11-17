"""Admin dashboard aggregation — KPIs, class performance, at-risk, activity feed."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from src.lms.models import Assignment, QuizAttempt, TeacherReviewQueue, User
from src.lms.services.at_risk import detect_at_risk_students
from src.lms.services.classes import get_class_name, list_classes, student_count_for_class
from src.lms.services.paper_dashboard import teacher_papers_pending_review_count
from src.lms.services.schools import get_school_for_admin, school_class_ids, school_user_ids


def _attempt_percentage(score: float | None, max_score: float | None) -> float | None:
    if score is None or not max_score or max_score <= 0:
        return None
    return round((float(score) / float(max_score)) * 100, 1)


def _avg_attempt_percentage(
    db: Session,
    student_ids: list[int] | None = None,
    *,
    since: datetime | None = None,
    until: datetime | None = None,
) -> float | None:
    q = db.query(QuizAttempt).filter(
        QuizAttempt.status == "completed",
        QuizAttempt.score.isnot(None),
    )
    if student_ids is not None:
        if not student_ids:
            return None
        q = q.filter(QuizAttempt.student_id.in_(student_ids))
    if since is not None:
        q = q.filter(QuizAttempt.completed_at.isnot(None), QuizAttempt.completed_at >= since)
    if until is not None:
        q = q.filter(QuizAttempt.completed_at < until)
    rows = q.all()
    pcts = [
        p
        for row in rows
        if (p := _attempt_percentage(row.score, row.max_score)) is not None
    ]
    if not pcts:
        return None
    return round(sum(pcts) / len(pcts), 1)


def _score_trend(db: Session, student_ids: list[int]) -> tuple[str | None, str | None]:
    """Compare avg score last 30 days vs prior 30 days."""
    if not student_ids:
        return None, "neutral"
    now = datetime.utcnow()
    recent = _avg_attempt_percentage(
        db, student_ids, since=now - timedelta(days=30), until=now + timedelta(seconds=1)
    )
    prior = _avg_attempt_percentage(
        db,
        student_ids,
        since=now - timedelta(days=60),
        until=now - timedelta(days=30),
    )
    if recent is None or prior is None:
        return None, "neutral"
    diff = round(recent - prior, 1)
    if diff == 0:
        return "Flat vs prior 30 days", "neutral"
    if diff > 0:
        return f"↑ {diff}% vs prior 30 days", "up"
    return f"↓ {abs(diff)}% vs prior 30 days", "down"


def _school_pending_reviews(db: Session, *, school_id: str, class_ids: list[str]) -> int:
    student_ids = school_user_ids(db, school_id, role="student")
    queue_count = 0
    if student_ids:
        queue_count = (
            db.query(TeacherReviewQueue)
            .filter(
                TeacherReviewQueue.status == "pending",
                TeacherReviewQueue.student_id.in_(student_ids),
            )
            .count()
        )
    paper_pending = 0
    teachers = db.query(User).filter(User.role == "teacher", User.school_id == school_id).all()
    for teacher in teachers:
        for cid in class_ids:
            paper_pending += teacher_papers_pending_review_count(
                db, teacher_id=teacher.id, class_id=cid
            )
    return int(queue_count + paper_pending)


def _students_added_this_month(db: Session, *, school_id: str) -> int:
    month_start = datetime.utcnow().replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    return (
        db.query(User)
        .filter(
            User.role == "student",
            User.school_id == school_id,
            User.created_at.isnot(None),
            User.created_at >= month_start,
        )
        .count()
    )


def _recent_activity(
    db: Session,
    *,
    school_id: str,
    class_ids: list[str],
    limit: int = 30,
) -> list[dict[str, Any]]:
    events: list[tuple[datetime, str, str | None]] = []
    class_set = set(class_ids)

    if class_ids:
        for row in (
            db.query(Assignment)
            .filter(Assignment.created_at.isnot(None), Assignment.class_id.in_(class_ids))
            .order_by(Assignment.created_at.desc())
            .limit(10)
            .all()
        ):
            class_label = get_class_name(db, row.class_id, row.class_id or "class")
            events.append(
                (
                    row.created_at,
                    f"{row.teacher_name} assigned “{row.title}” to {class_label}",
                    "assignment",
                )
            )

    for row in (
        db.query(User)
        .filter(
            User.role == "student",
            User.school_id == school_id,
            User.created_at.isnot(None),
        )
        .order_by(User.created_at.desc())
        .limit(10)
        .all()
    ):
        if row.class_id and row.class_id not in class_set:
            continue
        class_label = get_class_name(db, row.class_id, "school")
        events.append(
            (
                row.created_at,
                f"New student {row.full_name} added to {class_label}",
                "student",
            )
        )

    student_ids = school_user_ids(db, school_id, role="student")
    if student_ids:
        for att in (
            db.query(QuizAttempt)
            .filter(
                QuizAttempt.student_id.in_(student_ids),
                QuizAttempt.status == "completed",
                QuizAttempt.completed_at.isnot(None),
            )
            .order_by(QuizAttempt.completed_at.desc())
            .limit(10)
            .all()
        ):
            student = db.get(User, att.student_id)
            name = student.full_name if student else "A student"
            pct = _attempt_percentage(att.score, att.max_score)
            detail = f" — {pct}%" if pct is not None else ""
            events.append(
                (
                    att.completed_at,
                    f"{name} submitted a quiz{detail}",
                    "quiz",
                )
            )

    events.sort(key=lambda x: x[0], reverse=True)
    return [
        {"timestamp": ts, "label": label, "kind": kind}
        for ts, label, kind in events[:limit]
    ]


def build_admin_dashboard(db: Session, *, admin_user: User) -> dict[str, Any]:
    school = get_school_for_admin(db, admin_user)
    school_id = school.id
    classes = list_classes(db, school_id=school_id)
    class_ids = [c.id for c in classes]

    students = (
        db.query(User)
        .filter(User.role == "student", User.school_id == school_id)
        .all()
    )
    student_count = len(students)
    teacher_count = (
        db.query(User)
        .filter(User.role == "teacher", User.school_id == school_id)
        .count()
    )
    class_count = len(classes)
    student_ids = [s.id for s in students]

    avg_score = _avg_attempt_percentage(db, student_ids)
    score_trend, score_trend_type = _score_trend(db, student_ids)

    at_risk_rows = [
        row
        for row in detect_at_risk_students(db)
        if row["student_id"] in student_ids
    ]
    at_risk_count = len(at_risk_rows)

    student_by_id = {u.id: u for u in students}
    at_risk_by_class: dict[str, int] = {}
    for row in at_risk_rows:
        student = student_by_id.get(row["student_id"])
        cid = student.class_id if student else None
        if cid:
            at_risk_by_class[cid] = at_risk_by_class.get(cid, 0) + 1

    pending_reviews = _school_pending_reviews(db, school_id=school_id, class_ids=class_ids)
    new_students_month = _students_added_this_month(db, school_id=school_id)

    class_performance: list[dict[str, Any]] = []
    for cls in classes:
        ids_in_class = [s.id for s in students if s.class_id == cls.id]
        class_performance.append(
            {
                "id": cls.id,
                "name": cls.name,
                "student_count": student_count_for_class(db, cls.id),
                "avg_score": _avg_attempt_percentage(db, ids_in_class),
                "at_risk_count": at_risk_by_class.get(cls.id, 0),
            }
        )

    at_risk_students = []
    for row in at_risk_rows:
        student = student_by_id.get(row["student_id"])
        at_risk_students.append(
            {
                "student_id": row["student_id"],
                "full_name": row["full_name"],
                "class_id": student.class_id if student else None,
                "class_name": get_class_name(db, student.class_id if student else None),
                "subjects": row["subjects"],
                "avg_score": row["avg_score"],
            }
        )

    metrics = [
        {
            "label": "Students",
            "value": student_count,
            "sublabel": f"{new_students_month} added this month"
            if new_students_month
            else "Enrolled learners",
            "trend": f"+{new_students_month} this month" if new_students_month else None,
            "trend_type": "up" if new_students_month else "neutral",
        },
        {
            "label": "Teachers",
            "value": teacher_count,
            "sublabel": "Active staff accounts",
            "trend": None,
            "trend_type": "neutral",
        },
        {
            "label": "Classes",
            "value": class_count,
            "sublabel": "Active sections",
            "trend": None,
            "trend_type": "neutral",
        },
        {
            "label": "Avg Score",
            "value": f"{avg_score}%" if avg_score is not None else "—",
            "sublabel": "Quiz attempts school-wide"
            if avg_score is not None
            else "No completed attempts yet",
            "trend": score_trend,
            "trend_type": score_trend_type,
        },
        {
            "label": "At-Risk Students",
            "value": at_risk_count,
            "sublabel": "Below threshold in 2+ subjects",
            "trend": "Needs attention" if at_risk_count else "All clear",
            "trend_type": "warn" if at_risk_count else "neutral",
        },
        {
            "label": "Pending Reviews",
            "value": pending_reviews,
            "sublabel": "AI queue + papers to grade",
            "trend": "Awaiting teacher action" if pending_reviews else "Up to date",
            "trend_type": "warn" if pending_reviews else "neutral",
        },
    ]

    first_name = admin_user.full_name.split()[0] if admin_user.full_name else "Admin"

    return {
        "school_name": school.name,
        "academic_year": school.academic_year,
        "greeting_name": first_name,
        "date_label": datetime.utcnow().strftime("%A, %d %B %Y"),
        "header_subtitle": f"{student_count} students · {teacher_count} teachers · {class_count} classes",
        "metrics": metrics,
        "class_performance": class_performance,
        "at_risk_students": at_risk_students,
        "recent_activity": _recent_activity(
            db, school_id=school_id, class_ids=class_ids or school_class_ids(db, school_id)
        ),
        "pending_reviews": pending_reviews,
    }
