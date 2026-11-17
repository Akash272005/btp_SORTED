"""Teacher portal API."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from src.lms.auth.dependencies import require_roles
from src.lms.db import get_db
from src.lms.models import Assignment, QuizAttempt, TeacherReviewQueue, TopicProficiency, User
from src.lms.schemas import (
    AtRiskStudent,
    ClassOut,
    HeatmapStudentOut,
    TeacherDashboardOut,
    TeacherMetricOut,
    WeakStudentRowOut,
    WeakTopicRow,
)
from src.lms.services.at_risk import detect_at_risk_students
from src.lms.services.classes import (
    class_dicts,
    get_class_name,
    list_classes,
    resolve_class_id,
)
from src.lms.services.teacher_subjects import (
    list_mapped_classes,
    mapped_class_dicts,
    resolve_teacher_class_id,
    teaching_subjects_for_class,
)
from src.lms.services.paper_dashboard import (
    teacher_paper_distribution_count,
    teacher_papers_pending_review_count,
)

router = APIRouter(prefix="/api/teacher", tags=["lms-teacher"])

HEATMAP_TOPICS = ["Forces", "Motion", "Optics", "Cells", "Chem Rxn", "Acids"]
TEACHING_SUBJECTS = ["Science", "Mathematics", "English", "Social Science"]
TOPIC_ALIASES = {
    "Chem Bonds": "Chem Rxn",
    "Chemistry": "Chem Rxn",
}


def _short_name(full_name: str) -> str:
    parts = full_name.split()
    if len(parts) >= 2:
        return f"{parts[0]} {parts[1][0]}."
    return full_name[:12]


@router.get("/classes", response_model=list[ClassOut])
def teacher_classes(
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """Teachers see only mapped classes; admins see all classes in their school."""
    if user.role == "teacher":
        return list_mapped_classes(db, user)
    return list_classes(db, school_id=user.school_id)


@router.get("/dashboard", response_model=TeacherDashboardOut)
def teacher_dashboard(
    class_id: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    if user.role == "teacher":
        cid = resolve_teacher_class_id(db, class_id, user)
        if not cid:
            mapped = mapped_class_dicts(db, user)
            return TeacherDashboardOut(
                greeting_name=user.full_name.split()[0] if user.full_name else "Teacher",
                date_label=datetime.utcnow().strftime("%A, %d %B %Y"),
                header_subtitle="No class assignments yet — contact your school admin",
                class_id="",
                class_name="Not assigned",
                classes=mapped,
                metrics=[],
                heatmap_topics=HEATMAP_TOPICS,
                teaching_subjects=[],
                heatmap_students=[],
                weak_students=[],
                assignments_pending_review=0,
                ai_queue_count=0,
                weak_topics=[],
                at_risk_students=[],
                students=[],
                total_students=0,
            )
    else:
        cid = resolve_class_id(db, class_id, user)

    classes = (
        mapped_class_dicts(db, user)
        if user.role == "teacher"
        else class_dicts(db)
    )
    teaching_subjects = (
        teaching_subjects_for_class(db, teacher_id=user.id, class_id=cid)
        if user.role == "teacher"
        else TEACHING_SUBJECTS
    )
    class_label = get_class_name(db, cid, "Class")

    students_all = (
        db.query(User)
        .filter(User.role == "student", User.class_id == cid)
        .order_by(User.full_name)
        .all()
    )
    student_ids = [s.id for s in students_all]
    total = len(students_all)

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

    assignment_q = db.query(Assignment).filter(Assignment.class_id == cid)
    if user.role != "admin":
        assignment_q = assignment_q.filter(
            or_(Assignment.teacher_id.is_(None), Assignment.teacher_id == user.id)
        )
    assignment_count = assignment_q.count()

    month_start = datetime.utcnow().replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    )
    quizzes_this_month = assignment_q.filter(
        Assignment.created_at.isnot(None),
        Assignment.created_at >= month_start,
    ).count()

    papers_pending_review = teacher_papers_pending_review_count(
        db, teacher_id=user.id, class_id=cid
    )
    papers_distributed_count = teacher_paper_distribution_count(
        db, teacher_id=user.id, class_id=cid
    )
    pending_evaluations = queue_count + papers_pending_review

    topic_rows = (
        db.query(TopicProficiency)
        .join(User, User.id == TopicProficiency.student_id)
        .filter(User.class_id == cid, User.role == "student")
        .all()
    )
    topic_map: dict[str, list[float]] = {}
    for row in topic_rows:
        topic_map.setdefault(row.topic, []).append(row.score)

    weak_topics = [
        WeakTopicRow(
            topic=t,
            class_avg=round(sum(scores) / len(scores), 1),
            students_below_threshold=sum(1 for s in scores if s < 50),
        )
        for t, scores in sorted(
            topic_map.items(), key=lambda x: sum(x[1]) / len(x[1])
        )[:8]
    ]

    at_risk = detect_at_risk_students(db, cid)
    weak_count = len(at_risk) or sum(
        1 for s in students_all if _student_avg(db, s.id) < 50
    )

    heatmap_students: list[HeatmapStudentOut] = []
    for s in students_all[:12]:
        profs = (
            db.query(TopicProficiency)
            .filter(TopicProficiency.student_id == s.id)
            .all()
        )
        scores: dict[str, float] = {}
        for p in profs:
            key = TOPIC_ALIASES.get(p.topic, p.topic)
            if key in HEATMAP_TOPICS:
                scores[key] = round(p.score, 0)
        for t in HEATMAP_TOPICS:
            scores.setdefault(t, 0.0)
        heatmap_students.append(
            HeatmapStudentOut(
                id=s.id,
                name=s.full_name,
                short_name=_short_name(s.full_name),
                initials=s.avatar_initials or _initials(s.full_name),
                scores=scores,
            )
        )

    weak_rows: list[WeakStudentRowOut] = []
    student_avgs: list[tuple[User, float, list[str]]] = []
    for s in students_all:
        profs = (
            db.query(TopicProficiency)
            .filter(TopicProficiency.student_id == s.id)
            .all()
        )
        if not profs:
            continue
        avg = sum(p.score for p in profs) / len(profs)
        weak_topic_names = [p.topic for p in profs if p.score < 50]
        student_avgs.append((s, avg, weak_topic_names))

    student_avgs.sort(key=lambda x: x[1])
    for s, avg, weak_topic_names in student_avgs[:6]:
        if avg >= 55 and not weak_topic_names:
            continue
        topics = weak_topic_names[:4] or [
            p.topic
            for p in db.query(TopicProficiency)
            .filter(TopicProficiency.student_id == s.id)
            .all()
            if p.score < 60
        ][:3]
        weak_rows.append(
            WeakStudentRowOut(
                id=s.id,
                full_name=s.full_name,
                initials=s.avatar_initials or _initials(s.full_name),
                topics=topics,
                topics_label=", ".join(topics) if topics else "Multiple topics",
                avg_score=round(avg, 0),
            )
        )

    if len(weak_rows) < 4:
        for s, avg, weak_topic_names in student_avgs[:4]:
            if any(w.id == s.id for w in weak_rows):
                continue
            topics = weak_topic_names or ["Forces", "Optics"]
            weak_rows.append(
                WeakStudentRowOut(
                    id=s.id,
                    full_name=s.full_name,
                    initials=s.avatar_initials or _initials(s.full_name),
                    topics=topics,
                    topics_label=", ".join(topics),
                    avg_score=round(avg, 0),
                )
            )

    offset = (page - 1) * page_size
    students_page = students_all[offset : offset + page_size]
    student_table = []
    for s in students_page:
        avg = _student_avg(db, s.id)
        risk = any(r["student_id"] == s.id for r in at_risk)
        student_table.append(
            {
                "id": s.id,
                "name": s.full_name,
                "roll_no": s.roll_no,
                "accuracy": round(avg),
                "at_risk": risk,
            }
        )

    hour = datetime.utcnow().hour
    greeting = (
        "Good morning"
        if hour < 12
        else "Good afternoon"
        if hour < 17
        else "Good evening"
    )

    new_students_month = (
        db.query(User)
        .filter(
            User.role == "student",
            User.class_id == cid,
            User.created_at >= month_start,
        )
        .count()
    )
    new_students_trend = (
        f"↑ {new_students_month} new this month"
        if new_students_month
        else "No new students this month"
    )

    class_avg_score = _class_quiz_avg_pct(db, cid, month_start)
    quiz_sublabel = (
        f"Avg score: {class_avg_score}%"
        if class_avg_score is not None
        else "No submissions this month"
    )

    metrics = [
        TeacherMetricOut(
            label="Total Students",
            value=total,
            sublabel=f"{class_label} · Science",
            trend=new_students_trend,
            trend_type="up" if new_students_month else "neutral",
        ),
        TeacherMetricOut(
            label="Weak Students",
            value=weak_count,
            sublabel="Below 50% accuracy",
            trend=f"{len(at_risk)} at-risk flagged" if at_risk else "None at-risk",
            trend_type="down" if weak_count else "neutral",
        ),
        TeacherMetricOut(
            label="Quizzes This Month",
            value=quizzes_this_month,
            sublabel=quiz_sublabel,
            trend=f"{assignment_count} total assigned",
            trend_type="neutral",
        ),
        TeacherMetricOut(
            label="Pending Evaluations",
            value=pending_evaluations,
            sublabel="Quizzes + papers awaiting review",
            trend=(
                f"{papers_pending_review} paper(s), {queue_count} quiz item(s)"
                if pending_evaluations
                else "All caught up"
            ),
            trend_type="warn" if pending_evaluations else "neutral",
        ),
    ]

    return TeacherDashboardOut(
        greeting_name=user.full_name.split()[0],
        date_label=datetime.utcnow().strftime("%A, %d %B %Y"),
        header_subtitle=f"{datetime.utcnow().strftime('%A, %d %B %Y')} · {class_label} · {total} Students",
        class_id=cid,
        class_name=class_label,
        classes=classes,
        metrics=metrics,
        heatmap_topics=HEATMAP_TOPICS,
        teaching_subjects=teaching_subjects,
        heatmap_students=heatmap_students,
        weak_students=weak_rows[:6],
        nav_badges={
            "assignments": assignment_count,
            "papers": papers_pending_review,
        },
        papers_pending_review=papers_pending_review,
        papers_distributed_count=papers_distributed_count,
        assignments_pending_review=queue_count,
        ai_queue_count=queue_count,
        weak_topics=weak_topics,
        at_risk_students=[AtRiskStudent(**r) for r in at_risk],
        students=student_table,
        total_students=total,
    )


def _initials(name: str) -> str:
    parts = name.split()
    return "".join(p[0].upper() for p in parts[:2])[:2]


def _student_avg(db: Session, student_id: int) -> float:
    profs = (
        db.query(TopicProficiency)
        .filter(TopicProficiency.student_id == student_id)
        .all()
    )
    if not profs:
        return 0.0
    return sum(p.score for p in profs) / len(profs)


def _class_quiz_avg_pct(
    db: Session, class_id: str, since: datetime
) -> int | None:
    """Average quiz score % for the class since `since`."""
    assignment_ids = [
        a.id
        for a in db.query(Assignment.id)
        .filter(Assignment.class_id == class_id)
        .all()
    ]
    if not assignment_ids:
        return None

    attempts = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.assignment_id.in_(assignment_ids),
            QuizAttempt.status == "completed",
            QuizAttempt.completed_at.isnot(None),
            QuizAttempt.completed_at >= since,
            QuizAttempt.score.isnot(None),
            QuizAttempt.max_score > 0,
        )
        .all()
    )
    if not attempts:
        return None
    pcts = [(a.score / a.max_score) * 100 for a in attempts if a.score is not None]
    if not pcts:
        return None
    return round(sum(pcts) / len(pcts))
