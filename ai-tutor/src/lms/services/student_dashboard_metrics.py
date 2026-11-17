"""Computed metrics for the student dashboard (no hardcoded gamification)."""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from src.lms.models import ExamCalendar, ExamCalendarSlot, QuizAttempt, TopicProficiency, User


def student_streak_days(db: Session, student_id: int) -> int:
    """Consecutive calendar days (including today) with at least one completed quiz."""
    attempts = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == student_id,
            QuizAttempt.status == "completed",
            QuizAttempt.completed_at.isnot(None),
        )
        .all()
    )
    if not attempts:
        return 0

    active_days = {a.completed_at.date() for a in attempts if a.completed_at}
    streak = 0
    day = datetime.utcnow().date()
    while day in active_days:
        streak += 1
        day -= timedelta(days=1)
    return streak


def _attempt_score_pct(attempt: QuizAttempt) -> float | None:
    if attempt.score is None or not attempt.max_score:
        return None
    return (attempt.score / attempt.max_score) * 100


def student_accuracy_delta(db: Session, student_id: int) -> float:
    """Change in average quiz score %: last 7 days vs previous 7 days."""
    now = datetime.utcnow()
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    recent: list[float] = []
    prior: list[float] = []
    attempts = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == student_id,
            QuizAttempt.status == "completed",
            QuizAttempt.completed_at.isnot(None),
            QuizAttempt.completed_at >= two_weeks_ago,
        )
        .all()
    )
    for att in attempts:
        pct = _attempt_score_pct(att)
        if pct is None or not att.completed_at:
            continue
        if att.completed_at >= week_ago:
            recent.append(pct)
        else:
            prior.append(pct)

    if not recent or not prior:
        return 0.0
    return round(sum(recent) / len(recent) - sum(prior) / len(prior))


def student_xp_this_week(db: Session, student_id: int) -> int:
    """XP proxy: sum of raw quiz scores from completions in the last 7 days."""
    week_ago = datetime.utcnow() - timedelta(days=7)
    attempts = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == student_id,
            QuizAttempt.status == "completed",
            QuizAttempt.completed_at.isnot(None),
            QuizAttempt.completed_at >= week_ago,
            QuizAttempt.score.isnot(None),
        )
        .all()
    )
    return int(sum(a.score or 0 for a in attempts))


def student_xp_rank_label(db: Session, student_id: int, class_id: str | None) -> str:
    """Rank by XP this week within the student's class."""
    if not class_id:
        return "—"

    classmates = (
        db.query(User.id)
        .filter(User.role == "student", User.class_id == class_id)
        .all()
    )
    if len(classmates) <= 1:
        return "Only student in class"

    scores: list[tuple[int, int]] = []
    for (sid,) in classmates:
        scores.append((sid, student_xp_this_week(db, sid)))
    scores.sort(key=lambda x: x[1], reverse=True)

    rank = next((i + 1 for i, (sid, _) in enumerate(scores) if sid == student_id), 0)
    total = len(scores)
    if rank == 0:
        return "—"
    if rank == 1:
        return f"Top in class ({total} students)"
    if rank <= max(1, total // 5):
        return f"Top {rank} of {total}"
    return f"Rank {rank} of {total}"


def next_exam_days_left(db: Session, class_id: str | None) -> tuple[int, str]:
    """Days until the next published exam slot for this class."""
    if not class_id:
        return 0, "No upcoming exams scheduled"

    now = datetime.utcnow()
    row = (
        db.query(ExamCalendarSlot.exam_date)
        .join(ExamCalendar, ExamCalendar.id == ExamCalendarSlot.calendar_id)
        .filter(
            ExamCalendar.class_id == class_id,
            ExamCalendar.status == "published",
            ExamCalendarSlot.exam_date >= now,
        )
        .order_by(ExamCalendarSlot.exam_date.asc())
        .first()
    )
    if not row:
        return 0, "No upcoming exams scheduled"

    exam_date = row[0]
    days_left = (exam_date.date() - now.date()).days
    if days_left <= 0:
        return 0, "Exam scheduled for today — good luck!"
    if days_left == 1:
        return 1, "Next exam is tomorrow — stay focused!"
    return days_left, f"Next exam in {days_left} days — keep going!"


def student_ai_insight(db: Session, student_id: int) -> str:
    """Short tip from weakest topic proficiency."""
    weak = (
        db.query(TopicProficiency)
        .filter(TopicProficiency.student_id == student_id)
        .order_by(TopicProficiency.score.asc())
        .first()
    )
    if not weak:
        return "Complete a quiz or practice paper to unlock personalised tips."

    if weak.score < 50:
        return f"Focus on {weak.topic} ({weak.subject}) — your weakest topic right now."
    if weak.score < 70:
        return f"You're close on {weak.topic}. A short revision session could push you over 70%."
    return f"Strong progress in {weak.subject}. Try a harder quiz to challenge yourself."
