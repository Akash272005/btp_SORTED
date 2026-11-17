"""Paper distribution delete cascades and file cleanup."""

from __future__ import annotations

import shutil
from pathlib import Path

from sqlalchemy.orm import Session

from typing import Any

from src.lms.models import (
    ExamCalendarSlot,
    PaperDistribution,
    PaperPracticeAttempt,
    PaperStudentEvent,
    PaperWrittenSubmission,
    QuestionPaper,
)
from src.lms.services.paper_pdf_export import answer_key_pdf_path, paper_pdf_path
from src.lms.services.quiz_flow import invalidate_class_student_dashboards


def _submission_root() -> Path:
    return (
        Path(__file__).resolve().parent.parent.parent.parent
        / "data"
        / "user"
        / "paper-submissions"
    )


def extract_mcq_questions(sections: dict | None) -> list[dict[str, Any]]:
    """MCQ slots from paper sections (Section A practice)."""
    if not isinstance(sections, dict):
        return []
    out: list[dict[str, Any]] = []
    for sec in sections.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        sid = str(sec.get("id", "A"))
        for q in sec.get("questions") or []:
            if not isinstance(q, dict):
                continue
            if str(q.get("type", "")).lower() != "mcq":
                continue
            text = str(q.get("text") or "").strip()
            if not text:
                continue
            item = dict(q)
            item["section_id"] = sid
            out.append(item)
    return out


def build_practice_attempt_review_items(
    paper: QuestionPaper, attempt: PaperPracticeAttempt
) -> list[dict[str, Any]]:
    """Per-question student vs correct answers for teacher review."""
    questions = extract_mcq_questions(paper.sections)
    answer_map = {
        str(a.get("question_id", "")): str(a.get("answer", ""))
        for a in (attempt.answers_json or [])
        if isinstance(a, dict)
    }
    items: list[dict[str, Any]] = []
    for q in questions:
        qid = str(q.get("id", ""))
        student_answer = answer_map.get(qid, "").strip()
        correct = str(q.get("correct_answer") or "").strip()
        marks = float(q.get("marks", 1) or 1)
        is_correct = bool(student_answer and student_answer == correct)
        marks_awarded = marks if is_correct else 0.0
        items.append(
            {
                "question_id": qid,
                "section_id": str(q.get("section_id", "")),
                "type": "mcq",
                "question_text": str(q.get("text", "")),
                "max_marks": marks,
                "student_answer": student_answer or "(no answer)",
                "correct_answer": correct or None,
                "is_correct": is_correct,
                "marks_awarded": round(marks_awarded, 2),
                "feedback": "Correct" if is_correct else "Incorrect",
            }
        )
    return items


def remove_distribution_upload_files(distribution_id: str) -> None:
    root = _submission_root() / distribution_id
    if root.is_dir():
        shutil.rmtree(root, ignore_errors=True)


def remove_paper_pdf_files(paper_id: int) -> None:
    for path in (paper_pdf_path(paper_id), answer_key_pdf_path(paper_id)):
        try:
            if path.is_file():
                path.unlink()
        except OSError:
            pass


def delete_paper_distribution_data(
    db: Session, distribution_ids: list[str]
) -> dict[str, int]:
    """Remove all LMS rows (and upload dirs) tied to distribution ids."""
    if not distribution_ids:
        return {
            "events_removed": 0,
            "attempts_removed": 0,
            "written_removed": 0,
            "distributions_removed": 0,
        }

    events_removed = (
        db.query(PaperStudentEvent)
        .filter(PaperStudentEvent.distribution_id.in_(distribution_ids))
        .delete(synchronize_session=False)
    )
    attempts_removed = (
        db.query(PaperPracticeAttempt)
        .filter(PaperPracticeAttempt.distribution_id.in_(distribution_ids))
        .delete(synchronize_session=False)
    )
    written_removed = (
        db.query(PaperWrittenSubmission)
        .filter(PaperWrittenSubmission.distribution_id.in_(distribution_ids))
        .delete(synchronize_session=False)
    )
    distributions_removed = (
        db.query(PaperDistribution)
        .filter(PaperDistribution.id.in_(distribution_ids))
        .delete(synchronize_session=False)
    )

    for dist_id in distribution_ids:
        remove_distribution_upload_files(dist_id)

    return {
        "events_removed": int(events_removed or 0),
        "attempts_removed": int(attempts_removed or 0),
        "written_removed": int(written_removed or 0),
        "distributions_removed": int(distributions_removed or 0),
    }


def delete_teacher_paper_cascade(
    db: Session, paper: QuestionPaper, *, teacher_id: int
) -> dict[str, int | str]:
    """
    Permanently remove a question paper and every student-facing record:
    distributions, events, practice/exam attempts, written submissions, PDFs.
    """
    paper_id = paper.id
    dist_rows = (
        db.query(PaperDistribution.id, PaperDistribution.class_id)
        .filter(
            PaperDistribution.paper_id == paper_id,
            PaperDistribution.teacher_id == teacher_id,
        )
        .all()
    )
    distribution_ids = [str(row[0]) for row in dist_rows]
    class_ids = {str(row[1]) for row in dist_rows if row[1]}

    stats = delete_paper_distribution_data(db, distribution_ids)

    # Exam calendar slots may reference this paper; clear FK before delete.
    db.query(ExamCalendarSlot).filter(
        ExamCalendarSlot.linked_paper_id == paper_id
    ).update({"linked_paper_id": None}, synchronize_session=False)

    db.delete(paper)
    db.commit()

    remove_paper_pdf_files(paper_id)
    for class_id in class_ids:
        invalidate_class_student_dashboards(db, class_id)

    return {
        "paper_id": paper_id,
        **stats,
    }
