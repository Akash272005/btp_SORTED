from pathlib import Path
import sys
import traceback
from typing import Literal

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

# Ensure co_writer module can be imported
project_root = Path(__file__).parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

import json

from src.agents.co_writer.edit_agent import (
    TOOL_CALLS_DIR,
    EditAgent,
    load_history,
    print_stats,
)
from src.agents.co_writer.narrator_agent import NarratorAgent
from src.agents.co_writer.start_writing_agent import StartWritingAgent
from src.app_logging import get_logger
from src.services.config import load_config_with_main
from src.services.settings.interface_settings import get_ui_language
from src.services.tts import get_tts_config

router = APIRouter()

# Initialize logger with config
project_root = Path(__file__).parent.parent.parent.parent
config = load_config_with_main("solve_config.yaml", project_root)  # Use any config to get main.yaml
log_dir = config.get("paths", {}).get("user_log_dir") or config.get("logging", {}).get("log_dir")
logger = get_logger("CoWriter", level="INFO", log_dir=log_dir)

# Singleton agent instances - use refresh_config() before each request
# to pick up any configuration changes from Settings
_edit_agent: EditAgent | None = None
_narrator_agent: NarratorAgent | None = None
_start_writing_agent: StartWritingAgent | None = None


def _current_language() -> str:
    # Prefer UI settings, fall back to main.yaml system.language
    return get_ui_language(default=config.get("system", {}).get("language", "en"))


def get_edit_agent() -> EditAgent:
    """
    Get the singleton EditAgent instance with refreshed configuration.

    Uses a singleton pattern with refresh_config() to ensure:
    1. Efficient reuse of the agent instance
    2. Latest LLM configuration from Settings is always used
    """
    global _edit_agent
    lang = _current_language()
    if _edit_agent is None or getattr(_edit_agent, "language", None) != lang:
        _edit_agent = EditAgent(language=lang)
    # Refresh config to pick up any changes from Settings
    _edit_agent.refresh_config()
    return _edit_agent


def get_narrator_agent() -> NarratorAgent:
    """
    Get the singleton NarratorAgent instance with refreshed configuration.
    """
    global _narrator_agent
    lang = _current_language()
    if _narrator_agent is None or getattr(_narrator_agent, "language", None) != lang:
        _narrator_agent = NarratorAgent(language=lang)
    _narrator_agent.refresh_config()
    return _narrator_agent


def get_start_writing_agent() -> StartWritingAgent:
    """Get the singleton StartWritingAgent instance with refreshed configuration."""
    global _start_writing_agent
    lang = _current_language()
    if _start_writing_agent is None or getattr(_start_writing_agent, "language", None) != lang:
        _start_writing_agent = StartWritingAgent(language=lang)
    _start_writing_agent.refresh_config()
    return _start_writing_agent


class CitationItem(BaseModel):
    snippet: str
    kb_name: str | None = None
    score: float | None = None
    source_file: str | None = None
    url: str | None = None
    source_type: str | None = None


class EditRequest(BaseModel):
    text: str
    instruction: str
    action: Literal["rewrite", "shorten", "expand"] = "rewrite"
    source: Literal["rag", "web", "both"] | None = None
    kb_name: str | None = None
    perspective: Literal["teacher", "student"] = "teacher"
    class_key: str | None = None
    subject_key: str | None = None
    chapter_label: str | None = None
    enable_thinking: bool = False
    teacher_description: str | None = None


class EditResponse(BaseModel):
    edited_text: str
    operation_id: str
    citations: list[CitationItem] = []
    kb_name: str | None = None


class StartWritingRequest(BaseModel):
    class_key: str
    subject_key: str
    chapter_label: str | None = None
    kb_name: str | None = None
    description: str | None = None
    perspective: Literal["teacher", "student"] = "teacher"
    source: Literal["rag", "web", "both"] | None = "rag"
    enable_thinking: bool = False


class StartWritingResponse(BaseModel):
    content: str
    operation_id: str
    kb_name: str | None = None
    perspective: str
    citations: list[CitationItem] = []


class AutoMarkRequest(BaseModel):
    text: str


class AutoMarkResponse(BaseModel):
    marked_text: str
    operation_id: str


@router.post("/edit", response_model=EditResponse)
async def edit_text(request: EditRequest):
    try:
        # Get agent with refreshed LLM configuration from Settings
        agent = get_edit_agent()

        result = await agent.process(
            text=request.text,
            instruction=request.instruction,
            action=request.action,
            source=request.source,
            kb_name=request.kb_name,
            perspective=request.perspective,
            class_key=request.class_key,
            subject_key=request.subject_key,
            chapter_label=request.chapter_label,
            enable_thinking=request.enable_thinking,
            teacher_description=request.teacher_description,
        )

        # Print token stats
        print_stats()

        return result

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/start_writing", response_model=StartWritingResponse)
async def start_writing(request: StartWritingRequest):
    """Generate an initial markdown draft for Co-Writer."""
    try:
        agent = get_start_writing_agent()
        result = await agent.start_writing(
            class_key=request.class_key,
            subject_key=request.subject_key,
            chapter_label=request.chapter_label,
            kb_name=request.kb_name,
            description=request.description,
            perspective=request.perspective,
            source=request.source,
            enable_thinking=request.enable_thinking,
        )
        print_stats()
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/automark", response_model=AutoMarkResponse)
async def auto_mark_text(request: AutoMarkRequest):
    """AI auto-mark text"""
    try:
        # Get agent with refreshed LLM configuration from Settings
        agent = get_edit_agent()

        result = await agent.auto_mark(text=request.text)

        # Print token stats
        print_stats()

        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history")
async def get_history():
    """Get all operation history"""
    try:
        history = load_history()
        return {"history": history, "total": len(history)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/history/{operation_id}")
async def get_operation(operation_id: str):
    """Get single operation details"""
    try:
        history = load_history()
        for op in history:
            if op.get("id") == operation_id:
                return op
        raise HTTPException(status_code=404, detail="Operation not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tool_calls/{operation_id}")
async def get_tool_call(operation_id: str):
    """Get tool call details"""
    try:
        # Find matching file
        for filepath in TOOL_CALLS_DIR.glob(f"{operation_id}_*.json"):
            with open(filepath, encoding="utf-8") as f:
                return json.load(f)
        raise HTTPException(status_code=404, detail="Tool call not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/export/markdown")
async def export_markdown(content: dict):
    """Export as Markdown file"""
    try:
        markdown_content = content.get("content", "")
        filename = content.get("filename", "document.md")

        return Response(
            content=markdown_content,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ================= TTS Narration Feature =================


class NarrateRequest(BaseModel):
    """Narration request"""

    content: str
    style: Literal["friendly", "academic", "concise"] = "friendly"
    voice: str | None = None  # If None, will use default value from config
    skip_audio: bool = False


class NarrateResponse(BaseModel):
    """Narration response"""

    script: str
    key_points: list[str]
    style: str
    original_length: int
    script_length: int
    has_audio: bool
    audio_url: str | None = None
    audio_id: str | None = None
    voice: str | None = None
    audio_error: str | None = None


class ScriptOnlyRequest(BaseModel):
    """Script-only generation request"""

    content: str
    style: Literal["friendly", "academic", "concise"] = "friendly"


@router.post("/narrate", response_model=NarrateResponse)
async def narrate_content(request: NarrateRequest):
    """
    Generate note narration script and optionally generate TTS audio

    - style: Narration style
      - friendly: Friendly and approachable tutor style
      - academic: Rigorous academic lecture style
      - concise: Efficient and concise knowledge delivery style
    - voice: TTS voice role (alloy, echo, fable, onyx, nova, shimmer)
    - skip_audio: Whether to skip audio generation (set to true to return only script)
    """
    try:
        narrator = get_narrator_agent()
        result = await narrator.narrate(
            content=request.content,
            style=request.style,
            voice=request.voice,
            skip_audio=request.skip_audio,
        )
        return result
    except ValueError as e:
        # TTS configuration related error
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/narrate/script")
async def generate_script_only(request: ScriptOnlyRequest):
    """
    Generate script only (no audio generation)

    Fast endpoint, suitable for previewing script effect
    """
    try:
        narrator = get_narrator_agent()
        result = await narrator.generate_script(content=request.content, style=request.style)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/tts/status")
async def get_tts_status():
    """
    Check TTS service status

    Returns whether TTS configuration is available
    """
    try:
        tts_config = get_tts_config()
        return {
            "available": True,
            "model": tts_config.get("model"),
            "default_voice": tts_config.get("voice", "alloy"),
        }
    except ValueError as e:
        return {
            "available": False,
            "error": str(e),
            "hint": "Configure OpenAI-style TTS (TTS_MODEL, TTS_API_KEY, TTS_URL) or Azure Speech (TTS_BINDING=azure_speech, SPEECH_KEY, SPEECH_ENDPOINT).",
        }
    except Exception as e:
        return {"available": False, "error": str(e)}


@router.get("/tts/voices")
async def get_available_voices():
    """
    Get available TTS voice role list (OpenAI TTS voices)
    """
    voices = [
        {
            "id": "alloy",
            "name": "Alloy",
            "description": "Neutral and balanced voice",
        },
        {
            "id": "echo",
            "name": "Echo",
            "description": "Warm and conversational voice",
        },
        {
            "id": "fable",
            "name": "Fable",
            "description": "Expressive and dramatic voice",
        },
        {
            "id": "onyx",
            "name": "Onyx",
            "description": "Deep and authoritative voice",
        },
        {
            "id": "nova",
            "name": "Nova",
            "description": "Friendly and upbeat voice",
        },
        {
            "id": "shimmer",
            "name": "Shimmer",
            "description": "Clear and pleasant voice",
        },
    ]
    return {"voices": voices}
