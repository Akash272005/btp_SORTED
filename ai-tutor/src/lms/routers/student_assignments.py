"""Student assignment & quiz attempt routes (Phase 0)."""

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from src.lms.auth.dependencies import require_roles
from src.lms.db import get_db
from src.lms.models import Assignment, QuizAttempt, User
from src.lms.schemas import (
    AssignmentDetailOut,
    AssignmentOut,
    AssignmentResultOut,
    AttemptDraftIn,
    AttemptStartOut,
    AttemptSubmitIn,
    AttemptSubmitOut,
)
from src.lms.services.quiz_flow import (
    assignment_list_tab,
    build_assignment_out,
    get_assignment_for_student,
    get_quiz_for_assignment,
    invalidate_student_dashboard,
    latest_attempts_by_quiz,
    max_attempts_for_assignment,
    score_submission,
    strip_correct_answers,
)

router = APIRouter(prefix="/api/student", tags=["lms-student"])


def _list_assignments(
    db: Session, student: User, status: str | None = None
) -> list[AssignmentOut]:
    if not student.class_id:
        return []
    rows = (
        db.query(Assignment)
        .filter(Assignment.class_id == student.class_id)
        .order_by(Assignment.due_at)
        .all()
    )
    quiz_ids = [a.quiz_id for a in rows if a.quiz_id]
    attempts = latest_attempts_by_quiz(db, student.id, quiz_ids)
    out: list[AssignmentOut] = []
    for a in rows:
        att = attempts.get(a.quiz_id) if a.quiz_id else None
        item = build_assignment_out(db, a, student.id, att)
        tab = assignment_list_tab(a, att)
        if status and status != "all" and tab != status:
            continue
        out.append(item)
    return out


@router.get("/assignments", response_model=list[AssignmentOut])
def list_student_assignments(
    status: str | None = Query(None, pattern="^(pending|submitted|overdue|all)$"),
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    return _list_assignments(db, user, status)


@router.get("/assignments/{assignment_id}", response_model=AssignmentDetailOut)
def get_student_assignment(
    assignment_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    assignment = get_assignment_for_student(db, assignment_id, user)
    quiz = get_quiz_for_assignment(db, assignment)
    attempt = None
    if assignment.quiz_id:
        attempt = (
            db.query(QuizAttempt)
            .filter(
                QuizAttempt.student_id == user.id,
                QuizAttempt.assignment_id == assignment.id,
            )
            .order_by(QuizAttempt.attempt_number.desc())
            .first()
        )
    base = build_assignment_out(db, assignment, user.id, attempt)
    return AssignmentDetailOut(
        assignment=base,
        questions=strip_correct_answers(quiz.questions or []),
        attempt_id=attempt.id if attempt else None,
        in_progress=bool(attempt and attempt.status == "in_progress"),
    )


@router.post(
    "/quizzes/{assignment_id}/start",
    response_model=AttemptStartOut,
)
def start_quiz_attempt(
    assignment_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    assignment = get_assignment_for_student(db, assignment_id, user)
    quiz = get_quiz_for_assignment(db, assignment)

    existing = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == user.id,
            QuizAttempt.assignment_id == assignment.id,
            QuizAttempt.status == "in_progress",
        )
        .first()
    )
    if existing:
        return AttemptStartOut(
            attempt_id=existing.id,
            assignment_id=assignment.id,
            quiz_id=quiz.id,
            attempt_number=existing.attempt_number,
            questions=strip_correct_answers(quiz.questions or []),
            duration_mins=assignment.duration_mins,
            started_at=existing.started_at,
            saved_answers=existing.answers_json or [],
            marked_for_review=existing.marked_for_review or [],
        )

    latest = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == user.id,
            QuizAttempt.assignment_id == assignment.id,
        )
        .order_by(QuizAttempt.attempt_number.desc())
        .first()
    )
    next_num = (latest.attempt_number + 1) if latest else 1
    max_att = max_attempts_for_assignment(db, assignment)
    if latest and latest.status == "completed" and latest.attempt_number >= max_att:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="Maximum attempts reached")

    attempt = QuizAttempt(
        student_id=user.id,
        quiz_id=quiz.id,
        assignment_id=assignment.id,
        attempt_number=next_num,
        max_score=float(assignment.marks),
        status="in_progress",
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    return AttemptStartOut(
        attempt_id=attempt.id,
        assignment_id=assignment.id,
        quiz_id=quiz.id,
        attempt_number=attempt.attempt_number,
        questions=strip_correct_answers(quiz.questions or []),
        duration_mins=assignment.duration_mins,
        started_at=attempt.started_at,
        saved_answers=[],
        marked_for_review=[],
    )


@router.post(
    "/quizzes/{assignment_id}/submit",
    response_model=AttemptSubmitOut,
)
def submit_quiz_attempt(
    assignment_id: str,
    body: AttemptSubmitIn,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    assignment = get_assignment_for_student(db, assignment_id, user)
    quiz = get_quiz_for_assignment(db, assignment)

    attempt = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == user.id,
            QuizAttempt.assignment_id == assignment.id,
            QuizAttempt.status == "in_progress",
        )
        .order_by(QuizAttempt.id.desc())
        .first()
    )
    if not attempt:
        from fastapi import HTTPException

        raise HTTPException(
            status_code=400,
            detail="No in-progress attempt. Call start first.",
        )

    answers = [a.model_dump() for a in body.answers]
    score, max_score, feedback = score_submission(
        quiz.questions or [],
        answers,
        assignment.marks,
    )
    attempt.score = score
    attempt.max_score = max_score
    attempt.status = "completed"
    attempt.completed_at = datetime.utcnow()
    attempt.answers_json = answers
    attempt.feedback_json = feedback
    db.commit()
    db.refresh(attempt)
    invalidate_student_dashboard(user.id)

    pct = round((score / max_score) * 100, 1) if max_score else 0.0
    return AttemptSubmitOut(
        attempt_id=attempt.id,
        score=score,
        max_score=max_score,
        percentage=pct,
        status="completed",
        feedback=feedback,
    )


@router.get(
    "/assignments/{assignment_id}/result",
    response_model=AssignmentResultOut,
)
def get_assignment_result(
    assignment_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    assignment = get_assignment_for_student(db, assignment_id, user)
    quiz = get_quiz_for_assignment(db, assignment)
    attempt = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == user.id,
            QuizAttempt.assignment_id == assignment.id,
            QuizAttempt.status == "completed",
        )
        .order_by(QuizAttempt.attempt_number.desc())
        .first()
    )
    if not attempt:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="No completed attempt found")

    pct = None
    if attempt.score is not None and attempt.max_score:
        pct = round((attempt.score / attempt.max_score) * 100, 1)

    time_taken = None
    if attempt.completed_at and attempt.started_at:
        delta = attempt.completed_at - attempt.started_at
        time_taken = max(1, int(delta.total_seconds() // 60))

    questions_with_answers = []
    qmap = {q.get("id"): q for q in (quiz.questions or [])}
    ans_map = {a.get("question_id"): a.get("answer") for a in (attempt.answers_json or [])}
    feedback = attempt.feedback_json or {}
    for qid, q in qmap.items():
        row = dict(q)
        row["student_answer"] = ans_map.get(qid, "")
        row["feedback"] = feedback.get(qid, "")
        questions_with_answers.append(row)

    return AssignmentResultOut(
        assignment_id=assignment.id,
        title=assignment.title,
        attempt_id=attempt.id,
        score=attempt.score,
        max_score=attempt.max_score,
        percentage=pct,
        feedback=feedback,
        answers=attempt.answers_json or [],
        questions=questions_with_answers,
        attempt_number=attempt.attempt_number,
        completed_at=attempt.completed_at,
        time_taken_mins=time_taken,
    )


@router.patch("/quizzes/{assignment_id}/draft")
def save_attempt_draft(
    assignment_id: str,
    body: AttemptDraftIn,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    assignment = get_assignment_for_student(db, assignment_id, user)
    attempt = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == user.id,
            QuizAttempt.assignment_id == assignment.id,
            QuizAttempt.status == "in_progress",
        )
        .order_by(QuizAttempt.id.desc())
        .first()
    )
    if not attempt:
        from fastapi import HTTPException

        raise HTTPException(status_code=400, detail="No in-progress attempt")

    attempt.answers_json = [a.model_dump() for a in body.answers]
    attempt.marked_for_review = body.marked_for_review
    db.commit()
    return {"ok": True, "attempt_id": attempt.id}
