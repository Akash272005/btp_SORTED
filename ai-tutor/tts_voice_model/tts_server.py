"""
tts_server.py — FastAPI REST Server for F5-TTS Voice Cloning
=============================================================
Serves Anjali's cloned voice via HTTP REST API.

Start server:
    python tts_server.py

Swagger UI:
    http://localhost:8765/docs
"""

from __future__ import annotations

import multiprocessing
multiprocessing.freeze_support()   # Required on Windows before any other imports

import os
import asyncio
import logging
import threading
import time
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, validator
from dotenv import load_dotenv

# ── Config ────────────────────────────────────────────────────────────────────
load_dotenv()

PORT   = int(os.getenv("PORT",   8765))
HOST   = os.getenv("HOST",       "127.0.0.1")
OUTPUT_DIR             = os.getenv("OUTPUT_DIR",             "outputs")
AUDIO_CLEANUP_SECONDS  = int(os.getenv("AUDIO_CLEANUP_SECONDS", 3600))

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("tts_server")

# ── Global Engine State ───────────────────────────────────────────────────────
_engine      = None          # TTSEngine instance (populated in background)
_engine_lock = threading.Lock()
_engine_ready = threading.Event()   # signalled when engine finishes loading
_engine_error: Optional[str] = None # set if loading failed


def _load_engine_background():
    """Load TTSEngine in a daemon thread so Uvicorn starts immediately."""
    global _engine, _engine_error
    try:
        from tts_engine import TTSEngine
        logger.info("Background thread: loading F5-TTS model …")
        _engine = TTSEngine()
        logger.info("Background thread: F5-TTS model ready ✓")
    except Exception as exc:
        _engine_error = str(exc)
        logger.error(f"Background thread: engine load FAILED — {exc}", exc_info=True)
    finally:
        _engine_ready.set()


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Kick off model loading in a background thread
    t = threading.Thread(target=_load_engine_background, daemon=True)
    t.start()
    logger.info("Server is UP. F5-TTS loading in background — first request will wait.")

    # Start cleanup coroutine
    if AUDIO_CLEANUP_SECONDS > 0:
        asyncio.create_task(cleanup_old_files())

    yield
    logger.info("Shutting down TTS Server.")


# ── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="F5-TTS Voice Cloning API",
    description=(
        "Zero-shot voice cloning powered by F5-TTS. "
        "Synthesizes speech in Anjali's voice from any text input."
    ),
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Path(OUTPUT_DIR).mkdir(parents=True, exist_ok=True)
app.mount("/audio", StaticFiles(directory=OUTPUT_DIR), name="audio")


# ── Helper: get engine (blocks until ready) ───────────────────────────────────
def get_engine():
    """Return the engine, waiting up to 120 s for it to load."""
    if not _engine_ready.is_set():
        logger.info("Waiting for engine to finish loading …")
        _engine_ready.wait(timeout=120)

    if _engine_error:
        raise RuntimeError(f"Engine failed to load: {_engine_error}")
    if _engine is None:
        raise RuntimeError("Engine not available (timeout or not started).")
    return _engine


# ── Helper: background cleanup ────────────────────────────────────────────────
async def cleanup_old_files():
    """Periodically remove audio files older than AUDIO_CLEANUP_SECONDS."""
    while True:
        await asyncio.sleep(AUDIO_CLEANUP_SECONDS // 2)
        now  = time.time()
        out  = Path(OUTPUT_DIR)
        count = 0
        for f in out.glob("*.wav"):
            if now - f.stat().st_mtime > AUDIO_CLEANUP_SECONDS:
                f.unlink(missing_ok=True)
                count += 1
        if count:
            logger.info(f"Cleaned up {count} old audio file(s).")


def resolve_voice_path(voice_name: Optional[str]) -> str:
    """Resolve a short voice name to its file path in voices/."""
    engine = get_engine()
    if voice_name is None:
        return engine.default_speaker_wav

    voices_dir = Path("voices")
    for ext in [".mp3", ".wav", ".flac", ".ogg"]:
        candidate = voices_dir / f"{voice_name}{ext}"
        if candidate.exists():
            return str(candidate)

    logger.warning(f"Voice '{voice_name}' not found — falling back to default.")
    return engine.default_speaker_wav


# ── Pydantic Models ───────────────────────────────────────────────────────────
class SynthesizeRequest(BaseModel):
    text: str = Field(
        ...,
        min_length=1,
        max_length=5000,
        example="Hello! I am Anjali. How can I help you today?",
        description="Text to synthesize into speech.",
    )
    language: Optional[str] = Field(
        default="en",
        example="en",
        description="Language code. E.g. en, hi, fr, de, es, it …",
    )
    voice: Optional[str] = Field(
        default=None,
        example="anjali",
        description="Voice name from the voices/ folder (without extension).",
    )
    ref_text: Optional[str] = Field(
        default=None,
        description=(
            "Exact transcript of the reference audio. "
            "CRITICAL for matching pitch, tone and pace. "
            "Defaults to the transcript configured in .env (DEFAULT_REF_TEXT)."
        ),
    )
    nfe_step: Optional[int] = Field(
        default=None,
        ge=16, le=128,
        example=64,
        description="Inference steps. Higher = better voice fidelity. Default: 64.",
    )
    cfg_strength: Optional[float] = Field(
        default=None,
        ge=1.0, le=4.0,
        example=2.5,
        description="CFG guidance strength. Higher = more faithful to reference voice. Default: 2.5.",
    )
    speed: Optional[float] = Field(
        default=None,
        ge=0.5, le=2.0,
        example=1.0,
        description="Speaking speed multiplier vs reference audio. 1.0 = match reference pace.",
    )

    @validator("text")
    def text_must_not_be_blank(cls, v):
        if not v.strip():
            raise ValueError("text cannot be blank or whitespace only.")
        return v.strip()

    @validator("language")
    def language_must_be_valid(cls, v):
        supported = {
            "en", "hi", "fr", "de", "es", "it", "pt",
            "pl", "tr", "ru", "nl", "cs", "ar", "zh",
            "hu", "ko", "ja",
        }
        if v and v.lower() not in supported:
            raise ValueError(
                f"Unsupported language '{v}'. "
                f"Supported: {', '.join(sorted(supported))}"
            )
        return v.lower() if v else "en"


class SynthesizeResponse(BaseModel):
    status: str
    filename: str
    audio_url: str
    duration_seconds: float
    text: str
    language: str
    processing_time_seconds: float


class HealthResponse(BaseModel):
    status: str
    engine_ready: bool
    model: Optional[str]
    device: Optional[str]
    gpu_name: Optional[str]
    default_voice: Optional[str]


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse, tags=["Status"])
def health_check():
    """Health check — non-blocking; reports engine readiness."""
    ready = _engine_ready.is_set() and _engine is not None and _engine_error is None
    if ready:
        info = _engine.info()
        return HealthResponse(
            status="ok",
            engine_ready=True,
            model=info["model"],
            device=info["device"],
            gpu_name=info["gpu_name"],
            default_voice=info["default_voice"],
        )
    elif _engine_error:
        return HealthResponse(
            status="error",
            engine_ready=False,
            model=None,
            device=None,
            gpu_name=None,
            default_voice=None,
        )
    else:
        return HealthResponse(
            status="loading",
            engine_ready=False,
            model=None,
            device=None,
            gpu_name=None,
            default_voice=None,
        )


@app.post("/synthesize", response_model=SynthesizeResponse, tags=["TTS"])
def synthesize(request: SynthesizeRequest, background_tasks: BackgroundTasks):
    """
    Synthesize speech from text using zero-shot voice cloning.

    - **text**: Text to convert to speech (up to 5000 chars)
    - **language**: Language code (default: `en`)
    - **voice**: Voice name from voices/ folder (default: `anjali`)
    """
    engine       = get_engine()
    speaker_wav  = resolve_voice_path(request.voice)
    t0           = time.time()

    try:
        result = engine.synthesize(
            text=request.text,
            speaker_wav=speaker_wav,
            language=request.language,
            ref_text=request.ref_text,       # exact transcript → accurate pitch/tone
            nfe_step=request.nfe_step,       # quality steps override
            cfg_strength=request.cfg_strength,  # voice fidelity override
            speed=request.speed,             # speaking pace override
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc:
        logger.error(f"Synthesis error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {exc}")

    processing_time = round(time.time() - t0, 2)
    audio_url       = f"/audio/{result['filename']}"

    return SynthesizeResponse(
        status="success",
        filename=result["filename"],
        audio_url=audio_url,
        duration_seconds=result["duration"],
        text=result["text"],
        language=result["language"],
        processing_time_seconds=processing_time,
    )


@app.get("/listen", response_class=FileResponse, tags=["TTS"])
def listen_tts(
    text: str,
    language: str = "en",
    voice: Optional[str] = None,
):
    """
    Synthesize and **stream** the WAV file directly.
    Use this in Swagger UI `/docs` to get an inline audio player.
    """
    if not text or not text.strip():
        raise HTTPException(status_code=422, detail="Text cannot be empty.")

    engine      = get_engine()
    speaker_wav = resolve_voice_path(voice)

    try:
        result = engine.synthesize(
            text=text,
            speaker_wav=speaker_wav,
            language=language,
        )
    except Exception as exc:
        logger.error(f"Synthesis error: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {exc}")

    return FileResponse(
        path=result["output_path"],
        media_type="audio/wav",
        filename=result["filename"],
    )


@app.get("/voices", tags=["Voices"])
def list_voices():
    """List all available voice reference files in the voices/ directory."""
    engine = get_engine()
    voices = engine.list_voices()
    return {
        "status": "ok",
        "voices": voices,
        "default_voice": engine.default_speaker_wav,
        "count": len(voices),
    }


@app.get("/audio/{filename}", tags=["Audio"])
def get_audio(filename: str):
    """Download a generated audio file by filename."""
    file_path = Path(OUTPUT_DIR) / filename
    try:
        file_path.resolve().relative_to(Path(OUTPUT_DIR).resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied.")
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"'{filename}' not found.")
    return FileResponse(path=str(file_path), media_type="audio/wav", filename=filename)


@app.get("/", tags=["Status"])
def root():
    """API root — available endpoints."""
    return {
        "name":    "F5-TTS Voice Cloning API",
        "version": "2.0.0",
        "voice":   "Anjali (Warm, Cheerful, Clear)",
        "docs":    "/docs",
        "endpoints": {
            "POST /synthesize":    "Generate speech, returns JSON + URL",
            "GET  /listen":        "Generate speech, streams WAV directly",
            "GET  /voices":        "List available voice references",
            "GET  /audio/{file}":  "Download a generated audio file",
            "GET  /health":        "Server health & engine status",
        },
    }


# ── Entry Point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    logger.info(f"Starting TTS server on http://{HOST}:{PORT}")
    uvicorn.run(
        "tts_server:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info",
        access_log=False,
        workers=1,
    )
