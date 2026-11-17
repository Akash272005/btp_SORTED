"""Written answer sheet uploads and manual teacher grading."""

from __future__ import annotations

import re
import uuid
from pathlib import Path

from src.lms.models import QuestionPaper

ALLOWED_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
MAX_FILE_BYTES = 15 * 1024 * 1024
MAX_FILES = 5


def _project_root() -> Path:
    return Path(__file__).resolve().parent.parent.parent.parent


def submission_storage_dir(distribution_id: str, student_id: int) -> Path:
    root = _project_root() / "data" / "user" / "paper-submissions" / distribution_id / str(student_id)
    root.mkdir(parents=True, exist_ok=True)
    return root


def public_url_for_saved_file(distribution_id: str, student_id: int, filename: str) -> str:
    return f"/api/outputs/paper-submissions/{distribution_id}/{student_id}/{filename}"


def sanitize_filename(name: str) -> str:
    base = Path(name).name
    safe = re.sub(r"[^\w.\-]", "_", base)[:100] or "upload"
    return safe


def validate_upload_suffix(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in ALLOWED_SUFFIXES:
        raise ValueError(
            f"Unsupported file type. Allowed: {', '.join(sorted(ALLOWED_SUFFIXES))}"
        )
    return suffix


def new_submission_id() -> str:
    return f"pwsub-{uuid.uuid4().hex[:12]}"


def build_manual_grading_template(paper: QuestionPaper) -> dict:
    """Empty per-question rows for teacher manual marking."""
    items: list[dict] = []
    sections = (paper.sections or {}).get("sections", []) if isinstance(paper.sections, dict) else []
    for sec in sections:
        if not isinstance(sec, dict):
            continue
        sid = str(sec.get("id", ""))
        for q in sec.get("questions") or []:
            if not isinstance(q, dict):
                continue
            text = str(q.get("text") or "").strip()
            if not text:
                continue
            qid = str(q.get("id", ""))
            marks = float(q.get("marks", 1) or 1)
            items.append(
                {
                    "question_id": qid,
                    "section_id": sid,
                    "type": str(q.get("type") or sec.get("type") or "short"),
                    "question_text": text,
                    "max_marks": marks,
                    "teacher_marks": None,
                    "teacher_comment": None,
                    "final_marks": None,
                }
            )
    max_score = round(sum(float(i["max_marks"]) for i in items), 2)
    return {"items": items, "max_score": max_score}


def apply_teacher_written_grades(
    grading_json: dict | None,
    updates: list[dict],
    *,
    finalize: bool,
) -> tuple[dict, float | None, str]:
    base = dict(grading_json or {})
    items = list(base.get("items") or [])
    by_id = {str(u.get("question_id", "")): u for u in updates}
    teacher_score = 0.0
    for item in items:
        qid = str(item.get("question_id", ""))
        patch = by_id.get(qid)
        if patch and patch.get("teacher_marks") is not None:
            try:
                item["teacher_marks"] = round(float(patch["teacher_marks"]), 2)
            except (TypeError, ValueError):
                pass
        if patch and patch.get("teacher_comment") is not None:
            item["teacher_comment"] = str(patch["teacher_comment"] or "")
        tm = item.get("teacher_marks")
        if finalize and tm is not None:
            item["final_marks"] = round(float(tm), 2)
        elif finalize:
            item["final_marks"] = 0.0
        teacher_score += float(item.get("final_marks") or 0)
    base["items"] = items
    status = "graded" if finalize else "grading_draft"
    return base, round(teacher_score, 2) if finalize else None, status


def sum_final_written(grading_json: dict | None) -> float:
    items = (grading_json or {}).get("items") or []
    return round(sum(float(i.get("final_marks") or 0) for i in items), 2)
