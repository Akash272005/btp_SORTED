"""Legacy demo quiz cleanup — no demo quizzes are seeded for new databases."""

from __future__ import annotations

from sqlalchemy.orm import Session

from src.lms.models import Quiz

# Fixed IDs from early demo seed; removed on startup so My Quizzes stays teacher-only.
LEGACY_DEMO_QUIZ_IDS = (
    "quiz-forces-1",
    "quiz-optics-1",
    "quiz-cells-1",
)

# Kept for imports; empty — demo quizzes are not inserted anymore.
DEMO_QUIZZES: list[tuple] = []


def purge_legacy_demo_quizzes(db: Session) -> None:
    """Delete built-in demo quizzes so only teacher-created quizzes remain."""
    from src.lms.services.quiz_flow import delete_teacher_quiz_cascade

    for qid in LEGACY_DEMO_QUIZ_IDS:
        quiz = db.get(Quiz, qid)
        if quiz:
            delete_teacher_quiz_cascade(db, quiz)
