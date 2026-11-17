"""Student portal API."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from src.lms.auth.dependencies import require_roles
from src.lms.db import get_db
from src.lms.models import (
    Assignment,
    ExamCalendar,
    ExamCalendarSlot,
    TopicProficiency,
    User,
)
from src.lms.schemas import (
    ExamCalendarOut,
    ExamCalendarSlotChapterOut,
    ExamCalendarSlotOut,
    StudentClassOut,
    StudentDashboardOut,
    StudentExamCalendarOut,
    SubjectProficiency,
    TopicHeatmapCell,
)
from src.lms.services.classes import get_class, get_class_name, resolve_class_id, student_count_for_class
from src.lms.services.exam_calendar import (
    load_chapters_by_slot,
    load_distribution_ids_by_paper,
)
from src.lms.services.cache import cache_get, cache_set
from src.lms.services.paper_dashboard import student_paper_dashboard_slice
from src.lms.services.quiz_flow import build_assignment_out, latest_attempts_by_quiz
from src.lms.services.student_dashboard_metrics import (
    next_exam_days_left,
    student_accuracy_delta,
    student_ai_insight,
    student_streak_days,
    student_xp_rank_label,
    student_xp_this_week,
)

router = APIRouter(prefix="/api/student", tags=["lms-student"])

SUBJECT_COLORS = {
    "Physics": "#3B82F6",
    "Chemistry": "#EF4444",
    "Biology": "#22C55E",
    "Maths": "#F97316",
}


def _due_label(due: datetime) -> str:
    delta = (due.date() - datetime.utcnow().date()).days
    if delta <= 0:
        return "Due today"
    if delta == 1:
        return "Due tomorrow"
    return f"{delta} days left"


def _heatmap_level(score: float) -> str:
    if score >= 70:
        return "high"
    if score >= 50:
        return "medium"
    return "low"


@router.get("/classes/me", response_model=StudentClassOut)
def student_class_me(
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    if not user.class_id:
        raise HTTPException(status_code=404, detail="No class assigned to this student")
    row = get_class(db, user.class_id)
    if not row:
        raise HTTPException(status_code=404, detail="Class not found")
    return StudentClassOut(
        id=row.id,
        name=row.name,
        grade=row.grade,
        section=row.section,
        student_count=student_count_for_class(db, row.id),
    )


@router.get("/dashboard", response_model=StudentDashboardOut)
def student_dashboard(
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    cache_key = f"student_dashboard:{user.id}"
    cached = cache_get(cache_key)
    if cached:
        return StudentDashboardOut(**cached)

    assignments_db = (
        db.query(Assignment)
        .filter(Assignment.class_id == user.class_id)
        .order_by(Assignment.due_at)
        .all()
    )
    quiz_ids = [a.quiz_id for a in assignments_db if a.quiz_id]
    attempts = latest_attempts_by_quiz(db, user.id, quiz_ids)

    assignment_out = []
    quizzes_due_tomorrow = 0
    for a in assignments_db:
        att = attempts.get(a.quiz_id) if a.quiz_id else None
        out = build_assignment_out(db, a, user.id, att)
        if out.due_label == "Due tomorrow":
            quizzes_due_tomorrow += 1
        assignment_out.append(out)

    proficiencies = (
        db.query(TopicProficiency)
        .filter(TopicProficiency.student_id == user.id)
        .all()
    )
    heatmap = [
        TopicHeatmapCell(
            topic=p.topic,
            subject=p.subject,
            score=p.score,
            level=_heatmap_level(p.score),  # type: ignore[arg-type]
        )
        for p in proficiencies
    ]

    subject_scores: dict[str, list[float]] = {}
    for p in proficiencies:
        subject_scores.setdefault(p.subject, []).append(p.score)
    subject_prof = [
        SubjectProficiency(
            subject=subj,
            accuracy=round(sum(vals) / len(vals)),
            color=SUBJECT_COLORS.get(subj, "#534AB7"),
        )
        for subj, vals in subject_scores.items()
    ]

    mastered = sum(1 for p in proficiencies if p.score >= 70)
    total_topics = len(proficiencies) or 1
    overall = (
        round(sum(p.score for p in proficiencies) / len(proficiencies))
        if proficiencies
        else 0
    )

    class_name = get_class_name(db, user.class_id, user.grade or "Class")
    exam_days_left, exam_message = next_exam_days_left(db, user.class_id)
    streak = student_streak_days(db, user.id)
    accuracy_delta = student_accuracy_delta(db, user.id)
    xp_week = student_xp_this_week(db, user.id)
    xp_rank = student_xp_rank_label(db, user.id, user.class_id)
    ai_insight = student_ai_insight(db, user.id)

    papers_pending, papers_due_tomorrow, recent_papers = student_paper_dashboard_slice(
        db, user
    )

    payload = StudentDashboardOut(
        greeting_name=user.full_name.split()[0],
        date_label=datetime.utcnow().strftime("%A, %d %B %Y"),
        class_label=f"{class_name} · Term 2",
        streak_days=streak,
        exam_days_left=exam_days_left,
        exam_message=exam_message,
        ai_insight=ai_insight,
        overall_accuracy=overall,
        accuracy_delta=accuracy_delta,
        # Pending = not submitted yet (reattempts do not count as pending)
        quizzes_pending=sum(
            1 for a in assignment_out if a.status in ("pending", "in_progress")
        ),
        quizzes_due_tomorrow=quizzes_due_tomorrow,
        papers_pending=papers_pending,
        papers_due_tomorrow=papers_due_tomorrow,
        recent_papers=recent_papers,
        topics_mastered=mastered,
        topics_total=total_topics,
        xp_this_week=xp_week,
        xp_rank_label=xp_rank,
        assignments=assignment_out,
        topic_heatmap=heatmap,
        subject_proficiency=subject_prof,
        nav_badges={
            "quizzes": sum(
                1 for a in assignment_out if a.status in ("pending", "in_progress")
            ),
            "papers": papers_pending,
        },
    )
    cache_set(cache_key, payload.model_dump(), ttl=60)
    return payload


def _student_slot_out(
    slot,
    chapters,
    distribution_by_paper: dict[int, str],
) -> ExamCalendarSlotOut:
    dist_id = (
        distribution_by_paper.get(slot.linked_paper_id)
        if slot.linked_paper_id
        else None
    )
    return ExamCalendarSlotOut(
        id=slot.id,
        sort_order=slot.sort_order,
        slot_type=slot.slot_type,
        title=slot.title,
        exam_date=slot.exam_date,
        marks=slot.marks,
        duration_mins=slot.duration_mins,
        instructions=slot.instructions,
        linked_paper_id=slot.linked_paper_id,
        linked_assignment_id=slot.linked_assignment_id,
        linked_distribution_id=dist_id,
        chapters=[
            ExamCalendarSlotChapterOut(
                id=c.id,
                chapter_key=c.chapter_key,
                chapter_label=c.chapter_label,
                ncert_class=c.ncert_class,
                pdf_url=c.pdf_url,
            )
            for c in chapters
        ],
    )


@router.get("/exam-calendar", response_model=StudentExamCalendarOut)
def student_exam_calendar(
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    class_id = resolve_class_id(db, user.class_id, user)
    calendars = (
        db.query(ExamCalendar)
        .filter(
            ExamCalendar.class_id == class_id,
            ExamCalendar.status == "published",
        )
        .order_by(ExamCalendar.subject.asc(), ExamCalendar.academic_year.desc())
        .all()
    )
    out: list[ExamCalendarOut] = []
    for cal in calendars:
        slots = (
            db.query(ExamCalendarSlot)
            .filter(ExamCalendarSlot.calendar_id == cal.id)
            .order_by(ExamCalendarSlot.sort_order.asc())
            .all()
        )
        chapters_by_slot = load_chapters_by_slot(db, [s.id for s in slots])
        paper_ids = [s.linked_paper_id for s in slots if s.linked_paper_id]
        distribution_by_paper = load_distribution_ids_by_paper(
            db, class_id, paper_ids
        )
        out.append(
            ExamCalendarOut(
                id=cal.id,
                class_id=cal.class_id,
                subject=cal.subject,
                academic_year=cal.academic_year,
                template_id=cal.template_id,
                status=cal.status,
                slots=[
                    _student_slot_out(
                        s,
                        chapters_by_slot.get(s.id, []),
                        distribution_by_paper,
                    )
                    for s in slots
                ],
                published_at=cal.published_at,
                created_at=cal.created_at,
                updated_at=cal.updated_at,
            )
        )
    return StudentExamCalendarOut(calendars=out)
