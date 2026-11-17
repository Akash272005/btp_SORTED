"""Question paper summaries for student/teacher dashboards and nav badges."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from src.lms.models import (
    PaperDistribution,
    PaperPracticeAttempt,
    PaperStudentEvent,
    PaperWrittenSubmission,
    QuestionPaper,
    User,
)
from src.lms.schemas import StudentPaperOut
from src.lms.services.paper_tracking import (
    distribution_mode,
    distribution_mode_label,
    paper_list_tab,
    student_list_progress,
)
from src.lms.services.quiz_flow import due_label


def paper_score_summary(
    *,
    mode: str,
    exam: PaperPracticeAttempt | None,
    practice: PaperPracticeAttempt | None,
    written: PaperWrittenSubmission | None,
) -> tuple[float | None, float | None, float | None]:
    if mode == "online_exam" and exam and exam.submitted_at:
        display = (
            exam.teacher_score
            if exam.grading_status == "teacher_finalized" and exam.teacher_score is not None
            else exam.ai_score
        )
        max_score = float(exam.max_score or 0)
        if display is not None and max_score > 0:
            pct = round((float(display) / max_score) * 100, 1)
            return float(display), max_score, pct
    if mode == "written" and written and written.status == "graded":
        if written.teacher_score is not None and written.max_score:
            max_score = float(written.max_score)
            pct = round((float(written.teacher_score) / max_score) * 100, 1)
            return float(written.teacher_score), max_score, pct
    if practice and practice.status == "submitted" and practice.ai_score is not None:
        max_score = float(practice.max_score or 0)
        if max_score > 0:
            pct = round((float(practice.ai_score) / max_score) * 100, 1)
            return float(practice.ai_score), max_score, pct
    return None, None, None


def build_student_paper_out_list(
    db: Session,
    user: User,
    *,
    status_filter: str | None = None,
) -> list[StudentPaperOut]:
    """Build student paper rows (same shape as GET /api/student/papers)."""
    rows = (
        db.query(PaperDistribution)
        .filter(PaperDistribution.class_id == user.class_id)
        .order_by(PaperDistribution.due_at.asc())
        .all()
    )
    dist_ids = [d.id for d in rows]
    written_by_dist: dict[str, PaperWrittenSubmission] = {}
    if dist_ids:
        for sub in (
            db.query(PaperWrittenSubmission)
            .filter(
                PaperWrittenSubmission.distribution_id.in_(dist_ids),
                PaperWrittenSubmission.student_id == user.id,
            )
            .all()
        ):
            if sub.distribution_id not in written_by_dist:
                written_by_dist[sub.distribution_id] = sub

    exam_by_dist: dict[str, PaperPracticeAttempt] = {}
    practice_by_dist: dict[str, PaperPracticeAttempt] = {}
    if dist_ids:
        for att in (
            db.query(PaperPracticeAttempt)
            .filter(
                PaperPracticeAttempt.distribution_id.in_(dist_ids),
                PaperPracticeAttempt.student_id == user.id,
            )
            .order_by(PaperPracticeAttempt.started_at.desc())
            .all()
        ):
            if att.attempt_type == "online_exam" and att.distribution_id not in exam_by_dist:
                exam_by_dist[att.distribution_id] = att
            elif att.attempt_type == "mcq_practice" and att.distribution_id not in practice_by_dist:
                practice_by_dist[att.distribution_id] = att

    teachers: dict[int, User] = {}
    teacher_ids = {d.teacher_id for d in rows}
    if teacher_ids:
        for t in db.query(User).filter(User.id.in_(teacher_ids)).all():
            teachers[t.id] = t

    out: list[StudentPaperOut] = []
    now = datetime.utcnow()
    for d in rows:
        paper = db.get(QuestionPaper, d.paper_id)
        if not paper:
            continue
        events = (
            db.query(PaperStudentEvent)
            .filter(
                PaperStudentEvent.distribution_id == d.id,
                PaperStudentEvent.student_id == user.id,
            )
            .all()
        )
        has_downloaded = any(e.event_type == "downloaded" for e in events)
        has_submitted = any(
            e.event_type in ("practice_submitted", "exam_submitted", "written_submitted")
            for e in events
        )
        mode = distribution_mode(d)
        # Download-only: fetching the PDF is the student's required action.
        if mode == "download" and has_downloaded:
            has_submitted = True

        paper_status: str = "new"
        if has_submitted:
            paper_status = "completed"
        elif d.due_at < now:
            paper_status = "overdue"
        elif has_downloaded:
            paper_status = "downloaded"

        tab = paper_list_tab(has_submitted=has_submitted, due_at=d.due_at, now=now)
        if status_filter and status_filter != "all" and tab != status_filter:
            continue

        chapter_label = None
        if isinstance(paper.chapter_scope, dict):
            chapter_label = paper.chapter_scope.get("chapter_label")
        written = written_by_dist.get(d.id)
        exam = exam_by_dist.get(d.id)
        practice = practice_by_dist.get(d.id)
        progress = student_list_progress(
            mode=mode,
            status=paper_status,
            written_status=written.status if written else None,
            exam_grading_status=exam.grading_status if exam else None,
        )
        last_score, last_max_score, last_pct = paper_score_summary(
            mode=mode,
            exam=exam,
            practice=practice,
            written=written,
        )
        teacher = teachers.get(d.teacher_id)
        out.append(
            StudentPaperOut(
                distribution_id=d.id,
                paper_id=paper.id,
                title=d.title or paper.title,
                subject=paper.subject,
                board=paper.board,
                exam_type=paper.exam_type,
                total_marks=paper.total_marks,
                duration_mins=paper.duration_mins,
                due_at=d.due_at,
                due_label=due_label(d.due_at),
                status=paper_status,  # type: ignore[arg-type]
                allow_download=bool(d.allow_download),
                allow_online_practice=bool(d.allow_online_practice),
                allow_online_exam=bool(getattr(d, "allow_online_exam", False)),
                allow_written_submission=bool(getattr(d, "allow_written_submission", False)),
                submission_mode=mode,
                submission_mode_label=distribution_mode_label(mode),
                progress_label=progress,
                chapter_label=chapter_label,
                teacher_name=teacher.full_name if teacher else None,
                last_score=last_score,
                last_max_score=last_max_score,
                last_percentage=last_pct,
            )
        )
    return out


def student_paper_dashboard_slice(
    db: Session, user: User
) -> tuple[int, int, list[StudentPaperOut]]:
    """Returns (papers_pending, papers_due_tomorrow, up to 2 recent pending papers)."""
    all_papers = build_student_paper_out_list(db, user)
    now = datetime.utcnow()
    pending: list[StudentPaperOut] = []
    for p in all_papers:
        has_submitted = p.status == "completed"
        tab = paper_list_tab(has_submitted=has_submitted, due_at=p.due_at, now=now)
        if tab == "pending":
            pending.append(p)
    due_tomorrow = sum(1 for p in pending if p.due_label == "Due tomorrow")
    recent = pending[:2]
    return len(pending), due_tomorrow, recent


def distribution_pending_grade_count(db: Session, distribution_id: str) -> int:
    """Exam/written submissions awaiting teacher marks for one distribution."""
    exam_pending = (
        db.query(PaperPracticeAttempt)
        .filter(
            PaperPracticeAttempt.distribution_id == distribution_id,
            PaperPracticeAttempt.attempt_type == "online_exam",
            PaperPracticeAttempt.status == "submitted",
            PaperPracticeAttempt.grading_status != "teacher_finalized",
        )
        .count()
    )
    written_pending = (
        db.query(PaperWrittenSubmission)
        .filter(
            PaperWrittenSubmission.distribution_id == distribution_id,
            PaperWrittenSubmission.status == "submitted",
        )
        .count()
    )
    return int(exam_pending + written_pending)


def teacher_papers_pending_review_count(
    db: Session, *, teacher_id: int, class_id: str
) -> int:
    """Submissions needing teacher marks (online exam or written)."""
    dist_ids = [
        row[0]
        for row in db.query(PaperDistribution.id)
        .filter(
            PaperDistribution.teacher_id == teacher_id,
            PaperDistribution.class_id == class_id,
        )
        .all()
    ]
    if not dist_ids:
        return 0

    exam_pending = (
        db.query(PaperPracticeAttempt)
        .filter(
            PaperPracticeAttempt.distribution_id.in_(dist_ids),
            PaperPracticeAttempt.attempt_type == "online_exam",
            PaperPracticeAttempt.status == "submitted",
            PaperPracticeAttempt.grading_status != "teacher_finalized",
        )
        .count()
    )
    written_pending = (
        db.query(PaperWrittenSubmission)
        .filter(
            PaperWrittenSubmission.distribution_id.in_(dist_ids),
            PaperWrittenSubmission.status == "submitted",
        )
        .count()
    )
    return int(exam_pending + written_pending)


def teacher_paper_distribution_count(
    db: Session, *, teacher_id: int, class_id: str
) -> int:
    return (
        db.query(PaperDistribution)
        .filter(
            PaperDistribution.teacher_id == teacher_id,
            PaperDistribution.class_id == class_id,
        )
        .count()
    )
