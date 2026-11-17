"""Labels and summaries for question-paper distribution tracking."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from src.lms.models import PaperDistribution


def distribution_mode(d: PaperDistribution) -> str:
    if getattr(d, "allow_online_exam", False):
        return "online_exam"
    if getattr(d, "allow_written_submission", False):
        return "written"
    if d.allow_online_practice:
        return "practice"
    if d.allow_download:
        return "download"
    return "other"


def paper_list_tab(*, has_submitted: bool, due_at: datetime, now: datetime | None = None) -> str:
    """pending | submitted | overdue — for student My Papers tabs (matches quizzes)."""
    now = now or datetime.utcnow()
    if has_submitted:
        return "submitted"
    if due_at < now:
        return "overdue"
    return "pending"


def distribution_mode_label(mode: str) -> str:
    return {
        "online_exam": "Online test",
        "written": "Written paper",
        "practice": "MCQ practice",
        "download": "Download only",
        "other": "Paper",
    }.get(mode, "Paper")


def student_row_progress(
    *,
    mode: str,
    viewed: bool,
    downloaded: bool,
    practice_submitted: bool,
    exam_submitted: bool,
    written_submitted: bool,
    grading_status: str | None,
    score: float | None,
) -> str:
    if mode == "online_exam":
        if grading_status == "teacher_finalized" and score is not None:
            return "Final marks published"
        if exam_submitted:
            if grading_status == "ai_graded":
                return "Submitted — awaiting teacher review"
            return "Online test submitted"
        if viewed:
            return "Opened — not submitted"
        return "Not started"

    if mode == "written":
        if grading_status == "graded" and score is not None:
            return "Graded"
        if grading_status == "grading_draft":
            return "Marks draft saved"
        if written_submitted or grading_status == "submitted":
            return "Submitted — awaiting marks"
        if downloaded:
            return "Downloaded — upload pending"
        if viewed:
            return "Opened — not submitted"
        return "Not started"

    if practice_submitted:
        return "Practice completed"
    if exam_submitted:
        return "Submitted"
    if downloaded:
        return "Downloaded"
    if viewed:
        return "Viewed"
    return "Not started"


def student_list_progress(
    *,
    mode: str,
    status: str,
    written_status: str | None,
    exam_grading_status: str | None,
) -> str:
    if status == "completed":
        if mode == "written" and written_status == "graded":
            return "Graded"
        if mode == "written":
            return "Submitted — awaiting marks"
        if mode == "online_exam" and exam_grading_status == "teacher_finalized":
            return "Final marks"
        if mode == "online_exam":
            return "Submitted"
        return "Completed"
    if status == "overdue":
        return "Overdue"
    if status == "downloaded":
        if mode == "written":
            return "Downloaded — upload pending"
        return "Downloaded"
    if mode == "written":
        return "Not submitted"
    if mode == "online_exam":
        return "Not started"
    return "Not started"


def build_distribution_summary(students: list[dict[str, Any]], mode: str) -> dict[str, int]:
    n = len(students)
    viewed = sum(1 for s in students if s.get("viewed"))
    downloaded = sum(1 for s in students if s.get("downloaded"))
    submitted = sum(
        1
        for s in students
        if s.get("exam_submitted")
        or s.get("written_submitted")
        or s.get("practice_submitted")
    )
    graded = 0
    pending_grade = 0
    for s in students:
        if mode == "online_exam" and s.get("exam_submitted"):
            if s.get("grading_status") == "teacher_finalized":
                graded += 1
            else:
                pending_grade += 1
        elif mode == "written" and s.get("written_submitted"):
            gs = s.get("grading_status")
            if gs == "graded":
                graded += 1
            elif gs == "submitted":
                pending_grade += 1
    return {
        "student_count": n,
        "viewed_count": viewed,
        "downloaded_count": downloaded,
        "submitted_count": submitted,
        "graded_count": graded,
        "pending_grade_count": pending_grade,
    }
