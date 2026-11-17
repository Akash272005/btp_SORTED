"""
Video Learning Router
======================
Endpoints for the Video Learning section.

    POST /api/v1/video/transcript  → Fetch timestamped transcript for a YouTube URL
    POST /api/v1/video/ask         → Answer a student doubt using video transcript context
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from src.services.video.video_transcriber import (
    extract_video_id,
    fetch_transcript_with_timestamps,
    is_english_text,
)
from src.api.utils.history import ActivityType, history_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/video", tags=["Video Learning"])


# ─── Models ──────────────────────────────────────────────────────────────────

class TranscriptRequest(BaseModel):
    url: str = Field(..., description="YouTube video URL or video ID")


class TranscriptChunk(BaseModel):
    text: str
    start: float
    duration: float


class TranscriptResponse(BaseModel):
    success: bool
    video_id: Optional[str] = None
    title: Optional[str] = None
    url: str
    text: str = ""
    word_count: int = 0
    chunks: List[TranscriptChunk] = []
    error: Optional[str] = None


class AskRequest(BaseModel):
    question: str = Field(..., description="Student's doubt or question")
    timestamp: float = Field(..., description="Video timestamp (seconds) when doubt was raised")
    context_text: str = Field(..., description="Relevant transcript window around the timestamp")
    video_url: str = Field(..., description="YouTube video URL for reference")


class AskResponse(BaseModel):
    answer: str
    timestamp: float


# ─── Endpoints ───────────────────────────────────────────────────────────────

@router.post("/transcript", response_model=TranscriptResponse, summary="Fetch YouTube Transcript")
async def get_transcript(body: TranscriptRequest):
    """
    Fetch the transcript for a YouTube video with per-snippet timestamps.
    Prefers English; falls back to first available language.
    """
    url = body.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    video_id = extract_video_id(url)
    if not video_id:
        raise HTTPException(
            status_code=422,
            detail="Could not extract a valid YouTube video ID from the provided URL.",
        )

    try:
        result = fetch_transcript_with_timestamps(url)
        if not result.get("success"):
            return TranscriptResponse(
                success=False,
                video_id=result.get("video_id", video_id),
                url=url,
                error=result.get("error", "Unknown error"),
            )

        text = result.get("text", "")
        raw_chunks = result.get("chunks", [])
        chunks = [TranscriptChunk(**c) for c in raw_chunks]
        final_video_id = result.get("video_id", video_id)
        title = result.get("title", f"YouTube: {final_video_id}")
        word_count = len(text.split()) if text else 0

        # Save to history
        try:
            # Use empty summary so only the title shows in history
            summary_text = ""
            
            history_manager.add_entry(
                activity_type=ActivityType.VIDEO,
                title=title,  # Use the actual video title
                content={
                    "video_id": final_video_id,
                    "title": title,
                    "url": url,
                    "text": text,
                    "word_count": word_count,
                    "chunks": raw_chunks,
                },
                summary=summary_text,
            )
        except Exception as e:
            logger.warning(f"Failed to save video transcript to history: {e}")

        return TranscriptResponse(
            success=True,
            video_id=final_video_id,
            title=title,
            url=url,
            text=text,
            word_count=word_count,
            chunks=chunks,
        )
    except Exception as e:
        logger.error(f"Transcript fetch failed for {url}: {e}")
        raise HTTPException(status_code=503, detail=f"Transcript service error: {e}")


@router.post("/ask", response_model=AskResponse, summary="Answer a doubt from video context")
async def ask_doubt(body: AskRequest):
    """
    Answer a student's doubt using the relevant portion of a video transcript.
    The context_text should be the ~2-minute window of transcript around the timestamp.
    """
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question is required")
    if not body.context_text.strip():
        raise HTTPException(status_code=400, detail="Context text is required")

    try:
        from src.services.llm import complete as llm_complete, get_llm_config

        llm_config = get_llm_config()

        minutes = int(body.timestamp // 60)
        seconds = int(body.timestamp % 60)
        timestamp_str = f"{minutes}:{seconds:02d}"

        system_prompt = (
            "You are an expert tutor helping a student understand a video lecture. "
            "Answer the student's question based ONLY on what is explained in the provided "
            "video transcript excerpt. Be clear, concise, and educational. "
            "Use markdown formatting: bold for key terms, bullet points for steps, "
            "and LaTeX notation (\\( \\) for inline, \\[ \\] for block) for any math or formulas. "
            "End with a brief '💡 Key Takeaway:' line."
        )

        prompt = (
            f"The student paused the video at {timestamp_str} and asked:\n"
            f"**Question:** {body.question}\n\n"
            f"**Relevant video transcript (around {timestamp_str}):**\n"
            f"{body.context_text}\n\n"
            "Please answer the question based on what is covered in this transcript excerpt."
        )

        answer = await llm_complete(
            prompt=prompt,
            system_prompt=system_prompt,
            model=llm_config.model,
            api_key=llm_config.api_key,
            base_url=llm_config.base_url,
            binding=llm_config.binding,
            temperature=0.3,
            max_tokens=1000,
        )

        return AskResponse(answer=answer, timestamp=body.timestamp)

    except Exception as e:
        logger.error(f"Doubt solving failed: {e}")
        raise HTTPException(status_code=503, detail=f"Could not answer doubt: {e}")
