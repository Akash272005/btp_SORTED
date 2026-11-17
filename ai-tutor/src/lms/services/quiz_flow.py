"""Shared quiz / assignment helpers for student and teacher APIs."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from src.lms.models import (
    Assignment,
    Quiz,
    QuizAttempt,
    ReattemptPolicy,
    TeacherReviewQueue,
    User,
)
from src.lms.schemas import AssignmentOut
from src.lms.services.cache import cache_delete


def due_label(due: datetime) -> str:
    delta = (due.date() - datetime.utcnow().date()).days
    if delta <= 0:
        return "Due today"
    if delta == 1:
        return "Due tomorrow"
    return f"{delta} days left"


def max_attempts_for_assignment(db: Session, assignment: Assignment) -> int:
    if assignment.policy_id:
        pol = db.get(ReattemptPolicy, assignment.policy_id)
        if pol:
            return pol.max_attempts
    return 3


def latest_attempts_by_quiz(
    db: Session, student_id: int, quiz_ids: list[str]
) -> dict[str, QuizAttempt]:
    if not quiz_ids:
        return {}
    rows = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.student_id == student_id,
            QuizAttempt.quiz_id.in_(quiz_ids),
        )
        .order_by(QuizAttempt.attempt_number.desc())
        .all()
    )
    out: dict[str, QuizAttempt] = {}
    for row in rows:
        if row.quiz_id not in out:
            out[row.quiz_id] = row
    return out


def assignment_list_tab(assignment: Assignment, attempt: QuizAttempt | None) -> str:
    """pending | submitted | overdue | all — for My Quizzes tabs."""
    now = datetime.utcnow()
    if attempt and attempt.status == "completed":
        return "submitted"
    if assignment.due_at < now and (not attempt or attempt.status != "completed"):
        return "overdue"
    return "pending"


def build_assignment_out(
    db: Session,
    assignment: Assignment,
    student_id: int,
    attempt: QuizAttempt | None,
) -> AssignmentOut:
    used = 0
    status = "pending"
    if attempt:
        if attempt.status == "completed":
            used = attempt.attempt_number
            status = "completed"
        elif attempt.status == "in_progress":
            used = attempt.attempt_number
            status = "in_progress"
        else:
            used = attempt.attempt_number

    max_att = max_attempts_for_assignment(db, assignment)
    can = used < max_att and assignment.due_at >= datetime.utcnow()
    if status == "completed" and used >= max_att:
        can = False
    if status == "in_progress":
        can = True

    last_score = None
    last_max_score = None
    last_percentage = None
    if attempt and attempt.status == "completed" and attempt.score is not None:
        last_score = float(attempt.score)
        last_max_score = float(attempt.max_score or assignment.marks)
        if last_max_score:
            last_percentage = round((last_score / last_max_score) * 100, 1)

    return AssignmentOut(
        id=assignment.id,
        title=assignment.title,
        teacher_name=assignment.teacher_name,
        subject=assignment.subject,
        marks=assignment.marks,
        duration_mins=assignment.duration_mins,
        due_at=assignment.due_at,
        due_label=due_label(assignment.due_at),
        attempts_used=used,
        max_attempts=max_att,
        can_attempt=can,
        status=status,
        quiz_id=assignment.quiz_id,
        instructions=assignment.instructions,
        last_score=last_score,
        last_max_score=last_max_score,
        last_percentage=last_percentage,
    )


def invalidate_student_dashboard(student_id: int) -> None:
    cache_delete(f"student_dashboard:{student_id}")


def strip_correct_answers(questions: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not questions:
        return []
    cleaned: list[dict[str, Any]] = []
    for q in questions:
        item = {k: v for k, v in q.items() if k != "correct_answer"}
        cleaned.append(item)
    return cleaned


def score_submission(
    questions: list[dict[str, Any]],
    answers: list[dict[str, Any]],
    assignment_marks: int,
) -> tuple[float, float, dict[str, str]]:
    """Return score, max_score, per-question feedback map."""
    answer_map = {a.get("question_id"): a.get("answer", "") for a in answers}
    earned = 0.0
    total = 0.0
    feedback: dict[str, str] = {}

    for q in questions:
        qid = q.get("id", "")
        qtype = q.get("type", "mcq")
        qmarks = float(q.get("marks", 1))
        total += qmarks
        student_ans = str(answer_map.get(qid, "")).strip()

        if qtype == "mcq":
            correct = str(q.get("correct_answer", "")).strip()
            if student_ans and student_ans == correct:
                earned += qmarks
                feedback[qid] = "Correct"
            else:
                feedback[qid] = f"Expected: {correct}" if correct else "Incorrect"
        else:
            # short_answer: full marks if non-empty for P0 (AI grading in P4)
            if student_ans:
                earned += qmarks * 0.5
                feedback[qid] = "Submitted — teacher may review"
            else:
                feedback[qid] = "No answer"

    if total <= 0:
        total = float(assignment_marks)
    scale = assignment_marks / total if total else 1.0
    return round(earned * scale, 2), float(assignment_marks), feedback


def new_assignment_id() -> str:
    return f"asgn-{uuid.uuid4().hex[:12]}"


def new_quiz_id() -> str:
    return f"quiz-{uuid.uuid4().hex[:12]}"


def invalidate_class_student_dashboards(db: Session, class_id: str) -> None:
    """Clear cached student dashboards after assignment/quiz changes."""
    rows = (
        db.query(User.id)
        .filter(User.role == "student", User.class_id == class_id)
        .all()
    )
    for (sid,) in rows:
        invalidate_student_dashboard(sid)


def delete_teacher_assignment_cascade(
    db: Session, assignment: Assignment
) -> dict[str, int | str | bool]:
    """
    Remove assignment from class and delete the linked quiz from My Quizzes
    (same end state as deleting the quiz — students lose access everywhere).
    """
    assignment_id = assignment.id
    quiz_id = assignment.quiz_id
    class_id = assignment.class_id

    classes_to_refresh: set[str] = {class_id}
    for (cid,) in (
        db.query(Assignment.class_id)
        .filter(Assignment.quiz_id == quiz_id)
        .distinct()
        .all()
        if quiz_id
        else []
    ):
        classes_to_refresh.add(cid)

    if quiz_id:
        quiz = db.get(Quiz, quiz_id)
        if quiz:
            stats = delete_teacher_quiz_cascade(db, quiz)
            for cid in classes_to_refresh:
                invalidate_class_student_dashboards(db, cid)
            return {
                "assignment_id": assignment_id,
                "quiz_id": quiz_id,
                "quiz_deleted": True,
                "attempts_removed": int(stats["attempts_removed"]),
                "assignments_removed": int(stats["assignments_removed"]),
            }

    attempts_removed = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.assignment_id == assignment_id)
        .delete(synchronize_session=False)
    )
    db.delete(assignment)
    db.commit()
    invalidate_class_student_dashboards(db, class_id)
    return {
        "assignment_id": assignment_id,
        "quiz_id": None,
        "quiz_deleted": False,
        "attempts_removed": attempts_removed,
        "assignments_removed": 1,
    }


def delete_teacher_quiz_cascade(db: Session, quiz: Quiz) -> dict[str, int | str]:
    """
    Remove quiz and all LMS data that references it:
    student attempts, class assignments, reattempt policies, review queue rows.
    """
    quiz_id = quiz.id
    attempts_removed = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.quiz_id == quiz_id)
        .delete(synchronize_session=False)
    )
    assignments_removed = (
        db.query(Assignment)
        .filter(Assignment.quiz_id == quiz_id)
        .delete(synchronize_session=False)
    )
    db.query(TeacherReviewQueue).filter(
        TeacherReviewQueue.quiz_id == quiz_id
    ).delete(synchronize_session=False)
    db.query(ReattemptPolicy).filter(ReattemptPolicy.quiz_id == quiz_id).delete(
        synchronize_session=False
    )
    db.delete(quiz)
    db.commit()
    return {
        "quiz_id": quiz_id,
        "attempts_removed": attempts_removed,
        "assignments_removed": assignments_removed,
    }


def get_assignment_for_student(
    db: Session, assignment_id: str, student: User
) -> Assignment:
    if not student.class_id:
        raise HTTPException(status_code=400, detail="Student has no class assigned")
    row = db.get(Assignment, assignment_id)
    if not row:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if row.class_id != student.class_id:
        raise HTTPException(status_code=403, detail="Assignment not for your class")
    return row


def teacher_class_student_count(db: Session, class_id: str) -> int:
    return (
        db.query(User)
        .filter(User.role == "student", User.class_id == class_id)
        .count()
    )


def teacher_assignment_submitted_counts(
    db: Session, assignment_ids: list[str]
) -> dict[str, int]:
    """Per-assignment count of students whose latest attempt is completed."""
    if not assignment_ids:
        return {}
    attempts = (
        db.query(QuizAttempt)
        .filter(QuizAttempt.assignment_id.in_(assignment_ids))
        .all()
    )
    best: dict[tuple[str, int], QuizAttempt] = {}
    for att in attempts:
        key = (str(att.assignment_id), att.student_id)
        prev = best.get(key)
        if not prev or att.attempt_number >= prev.attempt_number:
            best[key] = att
    counts: dict[str, int] = {}
    for (aid, _), att in best.items():
        if att.status == "completed":
            counts[aid] = counts.get(aid, 0) + 1
    return counts


def get_quiz_for_assignment(db: Session, assignment: Assignment) -> Quiz:
    if not assignment.quiz_id:
        raise HTTPException(status_code=400, detail="Assignment has no linked quiz")
    quiz = db.get(Quiz, assignment.quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="Quiz not found")
    if quiz.status != "published":
        raise HTTPException(status_code=400, detail="Quiz is not published")
    return quiz


def verify_teacher_assignment(
    db: Session, assignment_id: str, user: User
) -> Assignment:
    assignment = db.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    if (
        assignment.teacher_id
        and assignment.teacher_id != user.id
        and user.role != "admin"
    ):
        raise HTTPException(status_code=403, detail="Not your assignment")
    return assignment


def _raw_marks_for_question(q: dict[str, Any], student_ans: str) -> tuple[float, bool | None]:
    """Return raw marks earned and correctness (None for short-answer partial)."""
    qtype = q.get("type", "mcq")
    qmarks = float(q.get("marks", 1))
    ans = student_ans.strip()
    if qtype == "mcq":
        correct = str(q.get("correct_answer", "")).strip()
        if ans and ans == correct:
            return qmarks, True
        return 0.0, False if ans else None
    if ans:
        return qmarks * 0.5, None
    return 0.0, False


def build_teacher_quiz_attempt_detail(
    assignment: Assignment,
    quiz: Quiz,
    attempt: QuizAttempt,
    student: User,
) -> dict[str, Any]:
    """Assemble per-question review payload for teacher attempt detail API."""
    questions = quiz.questions or []
    answer_map = {
        str(a.get("question_id", "")): str(a.get("answer", ""))
        for a in (attempt.answers_json or [])
    }
    feedback_map: dict[str, str] = attempt.feedback_json or {}
    marked = [str(x) for x in (attempt.marked_for_review or [])]

    total_raw = sum(float(q.get("marks", 1)) for q in questions) or float(assignment.marks)
    scale = float(assignment.marks) / total_raw if total_raw else 1.0

    review_questions: list[dict[str, Any]] = []
    for q in questions:
        qid = str(q.get("id", ""))
        student_ans = answer_map.get(qid, "")
        raw_earned, is_correct = _raw_marks_for_question(q, student_ans)
        qmarks = float(q.get("marks", 1))
        marks_awarded = round(raw_earned * scale, 2)
        max_marks = round(qmarks * scale, 2)
        review_questions.append(
            {
                "question_id": qid,
                "text": str(q.get("text", qid)),
                "type": str(q.get("type", "mcq")),
                "marks": max_marks,
                "options": q.get("options"),
                "correct_answer": q.get("correct_answer"),
                "student_answer": student_ans,
                "feedback": feedback_map.get(qid, ""),
                "is_correct": is_correct,
                "marks_awarded": marks_awarded,
                "marked_for_review": qid in marked,
            }
        )

    pct = None
    if attempt.score is not None and attempt.max_score:
        pct = round((attempt.score / attempt.max_score) * 100, 1)

    time_taken = None
    if attempt.completed_at and attempt.started_at:
        delta = attempt.completed_at - attempt.started_at
        time_taken = max(1, int(delta.total_seconds() // 60))

    return {
        "assignment_id": assignment.id,
        "attempt_id": attempt.id,
        "title": assignment.title,
        "subject": assignment.subject,
        "class_id": assignment.class_id,
        "student_id": student.id,
        "student_name": student.full_name,
        "roll_no": student.roll_no,
        "status": attempt.status,
        "score": attempt.score,
        "max_score": attempt.max_score,
        "percentage": pct,
        "attempt_number": attempt.attempt_number,
        "started_at": attempt.started_at,
        "completed_at": attempt.completed_at,
        "time_taken_mins": time_taken,
        "questions": review_questions,
        "marked_for_review": marked,
    }
