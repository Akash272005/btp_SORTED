"""Teacher quiz & assignment routes (Phase 0)."""

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.lms.auth.dependencies import require_roles
from src.lms.db import get_db
from src.lms.models import Assignment, Quiz, QuizAttempt, User
from src.lms.schemas import (
    AssignmentAttemptsOut,
    AssignmentCreateIn,
    AssignmentDeleteOut,
    AssignmentOut,
    GenerateFromNcertIn,
    GenerateFromNcertOut,
    QuizCreateIn,
    QuizDeleteOut,
    QuizOut,
    QuizUpdateIn,
    StudentAttemptRowOut,
    TeacherQuizAttemptDetailOut,
)
from src.lms.services.ncert_quiz_generate import generate_questions_from_ncert
from src.lms.services.classes import safe_resolve_class_id
from src.lms.services.quiz_flow import (
    teacher_assignment_submitted_counts,
    teacher_class_student_count,
    build_teacher_quiz_attempt_detail,
    delete_teacher_assignment_cascade,
    delete_teacher_quiz_cascade,
    due_label,
    get_quiz_for_assignment,
    new_assignment_id,
    new_quiz_id,
    verify_teacher_assignment,
)

router = APIRouter(prefix="/api/teacher", tags=["lms-teacher"])


@router.get("/quizzes", response_model=list[QuizOut])
def list_quizzes(
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    return (
        db.query(Quiz)
        .filter(Quiz.teacher_id == user.id)
        .order_by(Quiz.created_at.desc())
        .all()
    )


@router.post("/quizzes/generate-from-ncert", response_model=GenerateFromNcertOut)
async def generate_quiz_from_ncert(
    body: GenerateFromNcertIn,
    user: User = Depends(require_roles("teacher", "admin")),
):
    """Generate MCQs from NCERT chapter (no difficulty option — fixed medium internally)."""
    result = await generate_questions_from_ncert(
        chapter_label=body.chapter_label.strip(),
        subject=body.subject.strip(),
        kb_name=body.resolved_kb_name(),
        pdf_url=body.pdf_url,
        count=body.count,
        ncert_class=body.ncert_class,
    )
    title = body.title or f"{body.subject} — {body.chapter_label}"
    return GenerateFromNcertOut(
        success=bool(result.get("success")),
        questions=result.get("questions") or [],
        requested=result.get("requested", body.count),
        completed=result.get("completed", 0),
        failed=result.get("failed", 0),
        duration_secs=result.get("duration_secs"),
        stage_times=result.get("stage_times"),
        error=result.get("error"),
        suggested_title=title[:255],
    )


@router.post("/quizzes", response_model=QuizOut)
def create_quiz(
    body: QuizCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    quiz = Quiz(
        id=new_quiz_id(),
        teacher_id=user.id,
        title=body.title.strip(),
        subject=body.subject.strip(),
        questions=body.questions,
        status="draft",
        duration_mins=body.duration_mins,
        total_marks=body.total_marks,
        ncert_class=body.ncert_class,
        chapter_label=body.chapter_label,
        kb_name=body.kb_name,
        pdf_url=body.pdf_url,
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return quiz


@router.get("/quizzes/{quiz_id}", response_model=QuizOut)
def get_quiz(
    quiz_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz or quiz.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


@router.put("/quizzes/{quiz_id}", response_model=QuizOut)
def update_quiz(
    quiz_id: str,
    body: QuizUpdateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz or quiz.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    data = body.model_dump(exclude_unset=True)
    for key, val in data.items():
        setattr(quiz, key, val)
    db.commit()
    db.refresh(quiz)
    return quiz


@router.delete("/quizzes/{quiz_id}", response_model=QuizDeleteOut)
def delete_quiz(
    quiz_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """Permanently delete quiz and linked assignments / student attempts."""
    quiz = db.get(Quiz, quiz_id)
    if not quiz or quiz.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    stats = delete_teacher_quiz_cascade(db, quiz)
    return QuizDeleteOut(
        quiz_id=str(stats["quiz_id"]),
        assignments_removed=int(stats["assignments_removed"]),
        attempts_removed=int(stats["attempts_removed"]),
    )


@router.post("/quizzes/{quiz_id}/publish", response_model=QuizOut)
def publish_quiz(
    quiz_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    quiz = db.get(Quiz, quiz_id)
    if not quiz or quiz.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if not quiz.questions:
        raise HTTPException(status_code=400, detail="Add at least one question")
    quiz.status = "published"
    db.commit()
    db.refresh(quiz)
    return quiz


@router.get("/assignments", response_model=list[AssignmentOut])
def list_teacher_assignments(
    class_id: str | None = Query(None),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    # Respects teacher class mappings — returns [] when unassigned.
    cid = safe_resolve_class_id(db, class_id, user)  # respects teacher class mappings
    if not cid:
        return []
    rows = (
        db.query(Assignment)
        .filter(Assignment.class_id == cid)
        .order_by(Assignment.created_at.desc())
        .all()
    )
    visible = [
        a
        for a in rows
        if not (a.teacher_id and a.teacher_id != user.id and user.role != "admin")
    ]
    student_count = teacher_class_student_count(db, cid)
    submitted_map = teacher_assignment_submitted_counts(
        db, [a.id for a in visible]
    )
    out: list[AssignmentOut] = []
    for a in visible:
        out.append(
            AssignmentOut(
                id=a.id,
                title=a.title,
                teacher_name=a.teacher_name,
                subject=a.subject,
                marks=a.marks,
                duration_mins=a.duration_mins,
                due_at=a.due_at,
                due_label=due_label(a.due_at),
                attempts_used=0,
                max_attempts=3,
                can_attempt=False,
                status="published",
                quiz_id=a.quiz_id,
                student_count=student_count,
                submitted_count=submitted_map.get(a.id, 0),
            )
        )
    return out


@router.post("/assignments", response_model=AssignmentOut)
def create_assignment(
    body: AssignmentCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    quiz = db.get(Quiz, body.quiz_id)
    if not quiz or quiz.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.status != "published":
        raise HTTPException(status_code=400, detail="Publish the quiz first")

    assignment = Assignment(
        id=new_assignment_id(),
        title=body.title.strip(),
        teacher_name=user.full_name,
        teacher_id=user.id,
        subject=body.subject or quiz.subject,
        class_id=body.class_id,
        marks=body.marks or quiz.total_marks,
        duration_mins=body.duration_mins or quiz.duration_mins,
        due_at=body.due_at,
        quiz_id=quiz.id,
        policy_id=body.policy_id,
        instructions=body.instructions,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return AssignmentOut(
        id=assignment.id,
        title=assignment.title,
        teacher_name=assignment.teacher_name,
        subject=assignment.subject,
        marks=assignment.marks,
        duration_mins=assignment.duration_mins,
        due_at=assignment.due_at,
        due_label=due_label(assignment.due_at),
        attempts_used=0,
        max_attempts=3,
        can_attempt=False,
        status="published",
        quiz_id=assignment.quiz_id,
    )


@router.delete("/assignments/{assignment_id}", response_model=AssignmentDeleteOut)
def delete_assignment(
    assignment_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """Remove assignment from class; deletes student attempts and clears their dashboards."""
    assignment = db.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if assignment.teacher_id and assignment.teacher_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not your assignment")
    stats = delete_teacher_assignment_cascade(db, assignment)
    return AssignmentDeleteOut(
        assignment_id=str(stats["assignment_id"]),
        quiz_id=str(stats["quiz_id"]) if stats.get("quiz_id") else None,
        quiz_deleted=bool(stats.get("quiz_deleted")),
        attempts_removed=int(stats.get("attempts_removed", 0)),
        assignments_removed=int(stats.get("assignments_removed", 0)),
    )


@router.get("/assignments/{assignment_id}/attempts", response_model=AssignmentAttemptsOut)
def assignment_attempts(
    assignment_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    assignment = verify_teacher_assignment(db, assignment_id, user)

    students = (
        db.query(User)
        .filter(User.role == "student", User.class_id == assignment.class_id)
        .order_by(User.full_name)
        .all()
    )
    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.assignment_id == assignment.id)
        .all()
    )
    by_student: dict[int, QuizAttempt] = {}
    for att in attempts:
        prev = by_student.get(att.student_id)
        if not prev or att.attempt_number >= prev.attempt_number:
            by_student[att.student_id] = att

    rows: list[StudentAttemptRowOut] = []
    for s in students:
        att = by_student.get(s.id)
        if not att:
            rows.append(
                StudentAttemptRowOut(
                    student_id=s.id,
                    full_name=s.full_name,
                    roll_no=s.roll_no,
                    status="not_started",
                )
            )
        else:
            rows.append(
                StudentAttemptRowOut(
                    student_id=s.id,
                    full_name=s.full_name,
                    roll_no=s.roll_no,
                    status=att.status,
                    score=att.score,
                    max_score=att.max_score,
                    attempt_number=att.attempt_number,
                    attempt_id=att.id,
                    completed_at=att.completed_at,
                )
            )

    return AssignmentAttemptsOut(
        assignment_id=assignment.id,
        title=assignment.title,
        class_id=assignment.class_id,
        subject=assignment.subject,
        marks=assignment.marks,
        duration_mins=assignment.duration_mins,
        due_label=due_label(assignment.due_at),
        students=rows,
    )


@router.get(
    "/assignments/{assignment_id}/attempts/{attempt_id}",
    response_model=TeacherQuizAttemptDetailOut,
)
def assignment_attempt_detail(
    assignment_id: str,
    attempt_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    assignment = verify_teacher_assignment(db, assignment_id, user)
    attempt = db.get(QuizAttempt, attempt_id)
    if not attempt or attempt.assignment_id != assignment.id:
        raise HTTPException(status_code=404, detail="Attempt not found")
    student = db.get(User, attempt.student_id)
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    quiz = db.get(Quiz, assignment.quiz_id) if assignment.quiz_id else None
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    payload = build_teacher_quiz_attempt_detail(assignment, quiz, attempt, student)
    return TeacherQuizAttemptDetailOut(**payload)


@router.get("/assignments/{assignment_id}/export")
def export_assignment_scores(
    assignment_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """CSV export of per-student submission status and scores."""
    assignment = verify_teacher_assignment(db, assignment_id, user)
    students = (
        db.query(User)
        .filter(User.role == "student", User.class_id == assignment.class_id)
        .order_by(User.full_name)
        .all()
    )
    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.assignment_id == assignment.id)
        .all()
    )
    by_student: dict[int, QuizAttempt] = {}
    for att in attempts:
        prev = by_student.get(att.student_id)
        if not prev or att.attempt_number >= prev.attempt_number:
            by_student[att.student_id] = att

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(
        [
            "student_name",
            "roll_no",
            "status",
            "score",
            "max_score",
            "percentage",
            "attempt_number",
            "completed_at",
        ]
    )
    for s in students:
        att = by_student.get(s.id)
        if not att:
            writer.writerow([s.full_name, s.roll_no or "", "not_started", "", "", "", "", ""])
            continue
        pct = ""
        if att.score is not None and att.max_score:
            pct = str(round((att.score / att.max_score) * 100, 1))
        writer.writerow(
            [
                s.full_name,
                s.roll_no or "",
                att.status,
                att.score if att.score is not None else "",
                att.max_score if att.max_score is not None else "",
                pct,
                att.attempt_number,
                att.completed_at.isoformat() if att.completed_at else "",
            ]
        )

    filename = f"assignment-{assignment.id}-scores.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
