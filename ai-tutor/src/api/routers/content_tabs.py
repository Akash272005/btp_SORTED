"""
Content Tabs Router
====================
FastAPI router for the 4-pillar content strategy:
  - Tab 1: NCERT RAG (syllabus-accurate, local knowledge base)
  - Tab 2: Web Search (live internet results)
  - Tab 3: NPTEL (IIT lecture videos from YouTube)
  - Tab 4: YouTube (general video explanations)

Endpoints:
    POST /api/v1/content/ncert    → RAG search on NCERT knowledge base
    POST /api/v1/content/web      → Live web search
    POST /api/v1/content/nptel    → NPTEL YouTube channel search
    POST /api/v1/content/youtube       → General YouTube search
    POST /api/v1/content/youtube-home → Topic-ranked YouTube cards for Home chat

All endpoints respect the guardrails.yaml student_mode settings.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.services.video.youtube_service import (
    build_home_suggested_prompts,
    search_nptel,
    search_youtube,
    search_youtube_home_trusted,
)
from src.tools.rag_tool import rag_search
from src.tools.web_search import web_search

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/content", tags=["Content Tabs"])


# ─── Request / Response Models ────────────────────────────────────────────────


class ContentQuery(BaseModel):
    query: str = Field(..., description="Student's question or topic")
    class_level: Optional[str] = Field(None, description="Student's class (e.g., '10')")
    subject: Optional[str] = Field(None, description="Subject (e.g., 'science')")
    language: Optional[str] = Field("en", description="Response language: en | hi")
    max_results: Optional[int] = Field(5, description="Max results for video tabs")
    student_mode: Optional[bool] = Field(True, description="Enforce bullet-point output")


class NCERTResponse(BaseModel):
    query: str
    answer: str
    source: str = "ncert"
    kb_name: str
    mode: str


class WebResponse(BaseModel):
    query: str
    answer: str
    source: str = "web"
    citations: list = []


class VideoResponse(BaseModel):
    query: str
    source: str
    videos: list
    answer: str


class YoutubeHomeBody(BaseModel):
    query: str = Field(..., description="Student question or topic (home chat)")
    language: Optional[str] = Field("en", description="UI / search preference: en | hi")
    max_results: Optional[int] = Field(3, ge=1, le=12, description="Max video cards")


class YoutubeHomeResponse(BaseModel):
    query: str
    videos: list
    suggested_prompts: list[str] = Field(
        ...,
        description=(
            "Optional follow-up study prompts for the same topic; the current home web "
            "UI does not display them (video cards only)."
        ),
    )
    fallback: bool = Field(
        ...,
        description=(
            "True only when returning a manual YouTube search-results link (no cards); "
            "False when listing real watch URLs (including Education-category fill)"
        ),
    )


# ─── Student Mode System Prompt ───────────────────────────────────────────────

STUDENT_MODE_PROMPT_SUFFIX = """

=== STUDENT MODE ACTIVE ===
You are tutoring a Class {class_level} student studying {subject}.
Rules you MUST follow:
1. ONLY answer if the question is related to {subject} for Class {class_level}.
2. If the question is off-topic, politely say: 
   "This is outside your {subject} syllabus. Let's focus on your subject!"
3. Format your ENTIRE answer as exactly 3-5 bullet points.
4. Each bullet point = ONE clear sentence. No paragraphs.
5. Use simple English. Hindi words are welcome if helpful (Hinglish is fine).
6. End with ONE "💡 Key Takeaway:" line.
"""


def _build_student_prompt(query: str, class_level: str, subject: str) -> str:
    """Wrap the raw query with student-mode system context."""
    suffix = STUDENT_MODE_PROMPT_SUFFIX.format(
        class_level=class_level or "10",
        subject=subject or "General Science",
    )
    return f"{query}\n\n{suffix}"


# ─── Endpoints ────────────────────────────────────────────────────────────────


@router.post("/ncert", response_model=NCERTResponse, summary="Query NCERT Knowledge Base")
async def query_ncert(body: ContentQuery):
    """
    Tab 1 — NCERT Verified Answers.
    Queries the local NCERT RAG knowledge base (class 1-12 textbooks).
    Answers are strictly scoped to syllabus content only.
    """
    try:
        # Determine KB name from class level
        # Prefer per-class-subject KB; fall back to per-class when no subject given
        if body.class_level and body.subject:
            subj_slug = body.subject.lower().replace(" ", "-")
            kb_name = f"ncert-class-{body.class_level}-{subj_slug}"
        elif body.class_level:
            kb_name = f"ncert-class-{body.class_level}"
        else:
            kb_name = "ncert-class-8"  # safe default

        query = body.query
        if body.student_mode and body.class_level and body.subject:
            query = _build_student_prompt(body.query, body.class_level, body.subject)

        result = await rag_search(
            query=query,
            kb_name=kb_name,
            mode="naive",
        )

        return NCERTResponse(
            query=body.query,
            answer=result.get("answer", "No answer found in NCERT knowledge base."),
            kb_name=result.get("kb_name", kb_name),
            mode=result.get("mode", "naive"),
        )

    except Exception as e:
        logger.warning(f"NCERT RAG search failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=(
                f"NCERT knowledge base unavailable. "
                f"Make sure the '{kb_name}' knowledge base has been ingested. "
                f"Run: python3 scripts/ingest_ncert.py"
            ),
        )


@router.post("/web", response_model=WebResponse, summary="Live Web Search")
async def query_web(body: ContentQuery):
    """
    Tab 2 — Current Web Information.
    Searches the internet for up-to-date information on the topic.
    """
    try:
        result = await web_search(query=body.query)

        citations = []
        if hasattr(result, "results"):
            citations = [
                {"title": r.title, "url": r.url}
                for r in result.results
            ]

        answer = result.answer if hasattr(result, "answer") else str(result)

        return WebResponse(
            query=body.query,
            answer=answer,
            citations=citations,
        )

    except Exception as e:
        logger.error(f"Web search failed: {e}")
        raise HTTPException(status_code=503, detail=f"Web search unavailable: {e}")


@router.post("/nptel", response_model=VideoResponse, summary="NPTEL IIT Lecture Videos")
async def query_nptel(body: ContentQuery):
    """
    Tab 3 — NPTEL (IIT/IISc Lecture Videos).
    Searches the official NPTEL YouTube channel for free IIT professor videos.
    Requires YOUTUBE_API_KEY in .env (free Google Cloud API key).
    """
    try:
        # Enrich query with class context
        enriched_query = body.query
        if body.class_level and body.subject:
            enriched_query = f"{body.query} {body.subject} class {body.class_level}"

        videos = await search_nptel(
            query=enriched_query,
            max_results=body.max_results or 5,
            language=body.language,
        )

        answer = (
            f"Found {len(videos)} NPTEL lecture video(s) for **{body.query}** "
            f"from IIT/IISc professors:"
            if videos
            else "No NPTEL videos found. Try a broader search term."
        )

        return VideoResponse(
            query=body.query,
            source="nptel",
            videos=[v.to_dict() for v in videos],
            answer=answer,
        )

    except Exception as e:
        logger.error(f"NPTEL search failed: {e}")
        raise HTTPException(status_code=503, detail=f"NPTEL search failed: {e}")


@router.post("/youtube", response_model=VideoResponse, summary="YouTube Video Explanations")
async def query_youtube(body: ContentQuery):
    """
    Tab 4 — YouTube Video Explanations.
    Searches all of YouTube for educational video explanations.
    Safe search is enforced (strict mode).
    """
    try:
        enriched_query = body.query
        if body.class_level and body.subject:
            enriched_query = f"{body.query} {body.subject} class {body.class_level} explained"

        videos = await search_youtube(
            query=enriched_query,
            max_results=body.max_results or 5,
            language=body.language,
        )

        answer = (
            f"Found {len(videos)} YouTube explanation(s) for **{body.query}**:"
            if videos
            else "No YouTube videos found. Try different search terms."
        )

        return VideoResponse(
            query=body.query,
            source="youtube",
            videos=[v.to_dict() for v in videos],
            answer=answer,
        )

    except Exception as e:
        logger.error(f"YouTube search failed: {e}")
        raise HTTPException(status_code=503, detail=f"YouTube search failed: {e}")


@router.post(
    "/youtube-home",
    response_model=YoutubeHomeResponse,
    summary="Home chat: topic-ranked YouTube videos",
)
async def youtube_home_suggestions(body: YoutubeHomeBody):
    """
    Returns playable video cards with thumbnails for the inferred home-chat topic.

    Prefers educator-focused channels first, then expands to Education-tagged search
    when needed. If the YouTube Data API quota is exceeded or returns no matches,
    uses Tavily (``TAVILY_API_KEY`` / ``SEARCH_API_KEY``) to discover youtube.com
    links before falling back to a generic YouTube search URL.

    Response may include ``suggested_prompts`` for other clients; the web home UI
    only renders the video list.
    """
    query = body.query.strip()
    if len(query) < 2:
        return YoutubeHomeResponse(
            query=body.query,
            videos=[],
            suggested_prompts=[],
            fallback=True,
        )
    videos, fb = await search_youtube_home_trusted(
        query=query,
        max_results=min(body.max_results or 3, 12),
        language=body.language,
    )
    prompts = build_home_suggested_prompts(query, body.language)
    return YoutubeHomeResponse(
        query=body.query,
        videos=[v.to_dict() for v in videos],
        suggested_prompts=prompts,
        fallback=fb,
    )
