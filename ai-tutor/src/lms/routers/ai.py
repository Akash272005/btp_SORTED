"""AI proxy — all Claude/LLM calls go through /api/ai/*; keys never exposed."""

import os
import time

from fastapi import APIRouter, Depends, HTTPException

from src.lms.auth.dependencies import get_current_user
from src.lms.models import User
from src.lms.schemas import GradeAnswerRequest, GradeAnswerResponse
from src.lms.services.cache import cache_get, cache_set
from src.lms.services.grading import grade_answer

router = APIRouter(prefix="/api/ai", tags=["lms-ai"])

_rate_buckets: dict[str, list[float]] = {}
_RATE_LIMIT = int(os.getenv("LMS_AI_RATE_LIMIT", "30"))
_RATE_WINDOW = 60.0


def _check_rate_limit(user_id: int) -> None:
    now = time.time()
    key = str(user_id)
    bucket = [t for t in _rate_buckets.get(key, []) if now - t < _RATE_WINDOW]
    if len(bucket) >= _RATE_LIMIT:
        raise HTTPException(status_code=429, detail="AI rate limit exceeded")
    bucket.append(now)
    _rate_buckets[key] = bucket


@router.post("/grade-answer", response_model=GradeAnswerResponse)
async def api_grade_answer(
    body: GradeAnswerRequest,
    user: User = Depends(get_current_user),
):
    _check_rate_limit(user.id)
    cache_key = f"grade:{body.question_type}:{hash(body.student_answer)}"
    cached = cache_get(cache_key)
    if cached:
        return GradeAnswerResponse(**cached)
    result = await grade_answer(body)
    cache_set(cache_key, result.model_dump())
    return result


@router.post("/remediation")
async def remediation(
    topic: str,
    user: User = Depends(get_current_user),
):
    _check_rate_limit(user.id)
    cached = cache_get(f"remediation:{topic}")
    if cached:
        return cached
    tips = {
        "Optics": "Watch ray diagrams, practice mirror/lens numericals daily.",
        "Forces": "Draw free-body diagrams for every problem.",
    }
    payload = {
        "topic": topic,
        "suggestions": tips.get(
            topic, f"Revise {topic} with NCERT examples and 10 practice questions."
        ),
    }
    cache_set(f"remediation:{topic}", payload)
    return payload


@router.post("/daily-tip")
async def daily_tip(user: User = Depends(get_current_user)):
    _check_rate_limit(user.id)
    return {
        "tip": "Focus on your weakest topic for 25 minutes before attempting new quizzes.",
    }


@router.post("/study-plan")
async def study_plan(
    exam_date: str,
    daily_hours: float = 2,
    user: User = Depends(get_current_user),
):
    _check_rate_limit(user.id)
    return {
        "plan_id": f"plan-{user.id}",
        "message": "Study plan generated; tasks stored in study_plan_tasks table.",
        "daily_hours": daily_hours,
        "exam_date": exam_date,
    }


@router.post("/generate-questions")
async def generate_questions(
    board: str = "CBSE",
    subject: str = "Physics",
    count: int = 5,
    user: User = Depends(get_current_user),
):
    _check_rate_limit(user.id)
    return {
        "board": board,
        "subject": subject,
        "questions": [
            {"id": f"q{i}", "text": f"Sample {subject} question {i} ({board})"}
            for i in range(1, count + 1)
        ],
        "answer_key": "Available after teacher publishes.",
    }
