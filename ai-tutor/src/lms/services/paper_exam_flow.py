"""Online paper exam — all sections, AI grading, teacher override."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from src.lms.schemas import GradeAnswerRequest
from src.lms.services.grading import grade_answer, grade_mcq
from src.lms.services.quiz_flow import strip_correct_answers


def extract_filled_exam_questions(sections: dict | None) -> list[dict[str, Any]]:
    if not isinstance(sections, dict):
        return []
    out: list[dict[str, Any]] = []
    for sec in sections.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        sid = str(sec.get("id", "A"))
        sec_type = str(sec.get("type", "short")).lower()
        for q in sec.get("questions") or []:
            if not isinstance(q, dict):
                continue
            text = str(q.get("text") or "").strip()
            if not text:
                continue
            item = dict(q)
            item["section_id"] = sid
            item["type"] = str(q.get("type") or sec_type).lower()
            out.append(item)
    return out


def strip_exam_questions(questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return strip_correct_answers(questions)


def exam_time_remaining_seconds(
    started_at: datetime, duration_mins: int, *, now: datetime | None = None
) -> int:
    """Seconds left in an online exam (UTC naive datetimes, same as DB)."""
    now = now or datetime.utcnow()
    duration_secs = max(60, (duration_mins or 60) * 60)
    elapsed = (now - started_at).total_seconds()
    return max(0, int(duration_secs - elapsed))


def _grade_type_for_paper(qtype: str) -> str:
    if qtype == "mcq":
        return "mcq"
    if qtype == "long":
        return "short_answer"
    return "short_answer"


async def _grade_one_question(q: dict[str, Any], student_answer: str) -> dict[str, Any]:
    qid = str(q.get("id", ""))
    qtype = str(q.get("type", "short")).lower()
    max_marks = float(q.get("marks", 1) or 1)
    correct = str(q.get("correct_answer") or "").strip()
    answer = student_answer.strip()

    requires_review = qtype in {"short", "long"}

    if qtype == "mcq":
        # Match stored option text or letter prefix
        graded = grade_mcq(answer, correct, max_marks)
        if graded.score <= 0 and answer and correct:
            opts = q.get("options") or []
            if isinstance(opts, list):
                for i, opt in enumerate(opts):
                    if str(opt).strip() == answer:
                        letter = chr(65 + i)
                        alt = grade_mcq(letter, correct, max_marks)
                        if alt.score > 0:
                            graded = alt
                        break
        return {
            "question_id": qid,
            "section_id": str(q.get("section_id", "")),
            "type": qtype,
            "question_text": str(q.get("text", "")),
            "max_marks": max_marks,
            "student_answer": answer,
            "ai_marks": round(float(graded.score), 2),
            "ai_feedback": graded.feedback,
            "confidence": float(graded.confidence),
            "requires_teacher_review": False,
            "teacher_marks": None,
            "teacher_comment": None,
            "final_marks": round(float(graded.score), 2),
        }

    gtype = _grade_type_for_paper(qtype)
    req = GradeAnswerRequest(
        question_type=gtype,  # type: ignore[arg-type]
        student_answer=answer,
        correct_answer=correct or None,
        max_marks=max_marks,
        rubric="CBSE school exam — award partial marks for key ideas.",
    )
    graded = await grade_answer(req)
    ai_marks = round(float(graded.score), 2) if answer else 0.0
    needs_review = bool(graded.requires_teacher_review or requires_review or qtype == "long")
    return {
        "question_id": qid,
        "section_id": str(q.get("section_id", "")),
        "type": qtype,
        "question_text": str(q.get("text", "")),
        "max_marks": max_marks,
        "student_answer": answer,
        "ai_marks": ai_marks,
        "ai_feedback": graded.feedback,
        "confidence": float(graded.confidence),
        "requires_teacher_review": needs_review,
        "teacher_marks": None,
        "teacher_comment": None,
        "final_marks": ai_marks if not needs_review else ai_marks,
    }


async def grade_online_exam_submission(
    questions: list[dict[str, Any]],
    answers: list[dict[str, Any]],
) -> tuple[dict[str, Any], float, float]:
    """Return grading_json, ai_score, max_score."""
    answer_map = {str(a.get("question_id", "")): str(a.get("answer", "")) for a in answers}
    items: list[dict[str, Any]] = []
    max_score = 0.0
    ai_score = 0.0

    for q in questions:
        qid = str(q.get("id", ""))
        max_marks = float(q.get("marks", 1) or 1)
        max_score += max_marks
        row = await _grade_one_question(q, answer_map.get(qid, ""))
        items.append(row)
        ai_score += float(row["ai_marks"])

    grading = {"items": items}
    return grading, round(ai_score, 2), round(max_score, 2)


def apply_teacher_grades(
    grading_json: dict | None,
    updates: list[dict[str, Any]],
    *,
    finalize: bool,
) -> tuple[dict[str, Any], float | None, str]:
    """Merge teacher marks; return updated grading, teacher_score, grading_status."""
    base = dict(grading_json or {})
    items = list(base.get("items") or [])
    by_id = {str(u.get("question_id", "")): u for u in updates}

    teacher_score = 0.0
    for item in items:
        qid = str(item.get("question_id", ""))
        patch = by_id.get(qid)
        if patch:
            if patch.get("teacher_marks") is not None:
                try:
                    item["teacher_marks"] = round(float(patch["teacher_marks"]), 2)
                except (TypeError, ValueError):
                    pass
            if patch.get("teacher_comment") is not None:
                item["teacher_comment"] = str(patch["teacher_comment"] or "")

        tm = item.get("teacher_marks")
        if tm is not None and finalize:
            item["final_marks"] = round(float(tm), 2)
        elif item.get("final_marks") is None:
            item["final_marks"] = float(item.get("ai_marks") or 0)

        teacher_score += float(item.get("final_marks") or 0)

    base["items"] = items
    status = "teacher_finalized" if finalize else "ai_graded"
    return base, round(teacher_score, 2) if finalize else None, status


def sum_final_score(grading_json: dict | None) -> float:
    items = (grading_json or {}).get("items") or []
    return round(sum(float(i.get("final_marks") or 0) for i in items), 2)
