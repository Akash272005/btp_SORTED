"""AI grading — MCQ, fill-blank, short answer, math; essays need teacher review."""

import re
from difflib import SequenceMatcher

from src.lms.schemas import GradeAnswerRequest, GradeAnswerResponse


def _levenshtein_ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def grade_mcq(student: str, correct: str, max_marks: float) -> GradeAnswerResponse:
    match = student.strip().upper() == (correct or "").strip().upper()
    score = max_marks if match else 0.0
    return GradeAnswerResponse(
        score=score,
        max_score=max_marks,
        feedback="Correct!" if match else f"Expected {correct}.",
        confidence=1.0 if match else 0.95,
    )


def grade_fill_blank(student: str, correct: str, max_marks: float) -> GradeAnswerResponse:
    ratio = _levenshtein_ratio(student, correct or "")
    if ratio >= 0.95:
        score, feedback, conf = max_marks, "Exact match.", 1.0
    elif ratio >= 0.75:
        score = max_marks * 0.8
        feedback = "Close match (fuzzy)."
        conf = 0.85
    else:
        score = 0.0
        feedback = f"Expected something like: {correct}"
        conf = 0.9
    return GradeAnswerResponse(
        score=round(score, 2),
        max_score=max_marks,
        feedback=feedback,
        confidence=conf,
    )


def grade_math(student: str, correct: str, max_marks: float) -> GradeAnswerResponse:
    try:
        import sympy
        from sympy.parsing.sympy_parser import parse_expr

        lhs = parse_expr(student, evaluate=True)
        rhs = parse_expr(correct or "0", evaluate=True)
        equiv = sympy.simplify(lhs - rhs) == 0
        score = max_marks if equiv else max_marks * 0.5
        feedback = "Mathematically equivalent." if equiv else "Partial — check steps."
        return GradeAnswerResponse(
            score=round(score, 2),
            max_score=max_marks,
            feedback=feedback,
            confidence=0.92 if equiv else 0.7,
        )
    except Exception:
        return grade_fill_blank(student, correct, max_marks)


async def grade_with_claude(req: GradeAnswerRequest) -> GradeAnswerResponse:
    """Short answers via LLM; never called from frontend directly."""
    from src.services.llm import get_llm_client

    client = get_llm_client()
    prompt = (
        f"Grade this short answer. Max marks: {req.max_marks}\n"
        f"Student: {req.student_answer}\n"
        f"Reference: {req.correct_answer or 'N/A'}\n"
        f"Rubric: {req.rubric or 'Standard'}\n"
        "Reply JSON only: {\"score\": number, \"feedback\": string, \"confidence\": 0-1}"
    )
    try:
        text = await client.complete(prompt)
        import json

        m = re.search(r"\{.*\}", text, re.DOTALL)
        data = json.loads(m.group()) if m else {}
        return GradeAnswerResponse(
            score=min(float(data.get("score", 0)), req.max_marks),
            max_score=req.max_marks,
            feedback=str(data.get("feedback", "Graded by AI.")),
            confidence=float(data.get("confidence", 0.75)),
        )
    except Exception:
        ratio = _levenshtein_ratio(req.student_answer, req.correct_answer or "")
        return GradeAnswerResponse(
            score=round(req.max_marks * ratio, 2),
            max_score=req.max_marks,
            feedback="AI fallback grading.",
            confidence=0.6,
        )


async def grade_answer(req: GradeAnswerRequest) -> GradeAnswerResponse:
    if req.question_type == "essay":
        return GradeAnswerResponse(
            score=0,
            max_score=req.max_marks,
            feedback="Submitted for teacher review.",
            confidence=0.0,
            requires_teacher_review=True,
        )
    if req.question_type == "mcq":
        return grade_mcq(req.student_answer, req.correct_answer or "", req.max_marks)
    if req.question_type == "fill_blank":
        return grade_fill_blank(
            req.student_answer, req.correct_answer or "", req.max_marks
        )
    if req.question_type == "math":
        return grade_math(req.student_answer, req.correct_answer or "", req.max_marks)
    if req.question_type == "short_answer":
        return await grade_with_claude(req)
    return grade_fill_blank(req.student_answer, req.correct_answer or "", req.max_marks)
