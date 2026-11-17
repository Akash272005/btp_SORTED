"""
TTS (Text-to-Speech) Router
============================
Provides audio narration for AI-generated answers.

Endpoint:
    POST /api/v1/tts/synthesize

Uses the existing get_tts_config() from src/services/tts/config.py so all
configuration (including unified Settings page config) is respected.

Supports:
  - Standard OpenAI TTS  (tts-1, tts-1-hd)
  - Azure OpenAI TTS     (needs TTS_BINDING_API_VERSION in .env)
  - Azure Speech (SSML)  (TTS_BINDING=azure_speech, SPEECH_KEY, SPEECH_ENDPOINT, neural TTS_VOICE)
"""

import logging
import os
import asyncio
import re
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from src.utils.tls_env import httpx_verify_arg

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/tts", tags=["TTS Narration"])

MAX_TTS_CHARS = 4000

# Devanagari Unicode block — strong signal of Hindi text. Used by this router
# to prefer Hindi voice / language detection when passage text contains enough
# Devanagari (e.g. student query or summary text while UI locale is English).
_DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")


def _looks_like_hindi(text: str | None, *, min_chars: int = 2) -> bool:
    """Return True if `text` contains at least `min_chars` Devanagari characters."""
    if not text:
        return False
    found = _DEVANAGARI_RE.findall(text)
    return len(found) >= min_chars
# Voice preference per language (OpenAI built-in names; gpt-4o-mini-tts supports more voices)
_LANG_VOICE = {
    "en": "nova",       # warm, natural; pair with instructions on gpt-4o-mini-tts for Indian English
    "hi": "nova",       # nova handles Hindi/Hinglish best
    "hinglish": "nova",
}

# Used only when TTS_MODEL is gpt-4o-mini-tts (tts-1 / tts-1-hd ignore accent instructions).
_DEFAULT_INDIAN_ENGLISH_INSTRUCTIONS = (
    "Speak in clear Indian English for a student audience in India. "
    "Warm, friendly, educational tone; natural rhythm and melody typical of urban Indian English; "
    "clear articulation with lightly retroflex t/d/r where natural; avoid British RP and avoid "
    "American network-news accent."
)


# Many gateways (incl. some Azure / compat proxies) only accept the original six OpenAI TTS voices.
_OPENAI_TTS_VOICES_CLASSIC = frozenset({"alloy", "nova", "shimmer", "echo", "fable", "onyx"})


def _normalize_tts_voice(voice: str | None, *, fallback: str = "nova") -> str:
    """Avoid 400 invalid voice — map unknown names to a safe classic voice."""
    fb = fallback if fallback in _OPENAI_TTS_VOICES_CLASSIC else "nova"
    x = (voice or fb).strip().lower()
    if x in _OPENAI_TTS_VOICES_CLASSIC:
        return x
    logger.warning(
        "TTS voice %r is not accepted by this endpoint (allowed: %s); using %s",
        voice,
        ", ".join(sorted(_OPENAI_TTS_VOICES_CLASSIC)),
        fb,
    )
    return fb


def _model_supports_speech_instructions(model: str) -> bool:
    """gpt-4o-mini-tts accepts `instructions`. Azure deployment names often omit that substring."""
    flag = os.getenv("TTS_SUPPORTS_INSTRUCTIONS", "").strip().lower()
    if flag in ("1", "true", "yes", "on"):
        return True
    m = (model or "").lower()
    return "gpt-4o-mini-tts" in m or "4o-mini-tts" in m


# ─── Request Model ────────────────────────────────────────────────────────────


class TTSRequest(BaseModel):
    text: str = Field(..., description="Text to convert to speech")
    language: str = Field("en", description="Language: en | hi | hinglish")
    voice: str = Field(None, description="Override voice: alloy|nova|shimmer|echo|fable|onyx")
    speed: float = Field(1.0, description="Playback speed (0.25 – 4.0)")
    instructions: str | None = Field(
        None,
        description="Optional speech-style instructions (only applied for gpt-4o-mini-tts models)",
    )


# ─── Helpers ─────────────────────────────────────────────────────────────────


def _clean_text_for_tts(text: str, max_chars: int = MAX_TTS_CHARS) -> str:
    """Strip markdown formatting, then trim to max_chars at a sentence boundary."""
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text)
    text = re.sub(r"\*(.+?)\*", r"\1", text)
    text = re.sub(r"`(.+?)`", r"\1", text)
    text = re.sub(r"#+\s*", "", text)
    text = re.sub(r"!\[.*?\]\(.*?\)", "", text)
    text = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", text)
    text = re.sub(r"[-*•]\s+", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = text.strip()

    if len(text) > max_chars:
        trimmed = text[:max_chars]
        last_period = trimmed.rfind(".")
        if last_period > max_chars // 2:
            trimmed = trimmed[: last_period + 1]
        return trimmed + " …"

    return text


def _load_tts_config() -> dict:
    """
    Load TTS config via the unified config service (respects Settings page).
    Falls back to raw env vars if the config service raises an error.
    Returns a dict with: api_key, base_url, model, api_version, voice.
    Raises HTTPException(503) if the config is genuinely missing.
    """
    # 1. Try the existing unified config service first
    try:
        from src.services.tts.config import get_tts_config

        return get_tts_config()
    except ValueError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception:
        pass  # Fall through to manual env-var loading below

    # 2. Manual env-var fallback — handle empty strings explicitly
    def _env(key: str, default: str = "") -> str:
        val = os.getenv(key, default).strip().strip("\"'")
        return val if val else default

    api_key = _env("TTS_API_KEY") or _env("LLM_API_KEY")
    base_url = _env("TTS_URL") or "https://api.openai.com/v1"
    model    = _env("TTS_MODEL", "tts-1")
    version  = _env("TTS_BINDING_API_VERSION")
    voice    = _env("TTS_VOICE", "alloy")

    if not api_key:
        raise HTTPException(
            status_code=503,
            detail=(
                "TTS not configured: set TTS_API_KEY (or TTS_MODEL / TTS_URL) "
                "in your .env file or via the Settings page."
            ),
        )

    return {"api_key": api_key, "base_url": base_url, "model": model,
            "api_version": version, "voice": voice}


def _build_tts_request(
    cfg: dict,
    text: str,
    voice: str,
    speed: float,
    instructions: str | None = None,
):
    """
    Build the httpx call parameters for OpenAI-compatible TTS.
    Handles Azure OpenAI (api-version query param + api-key header).
    """
    base_url = cfg["base_url"].rstrip("/")
    model    = cfg["model"]
    api_key  = cfg["api_key"]
    version  = cfg.get("api_version") or ""

    url = f"{base_url}/audio/speech"

    # Azure OpenAI uses ?api-version and api-key header instead of Bearer
    if version:
        url = f"{url}?api-version={version}"
        headers = {
            "api-key": api_key,
            "Content-Type": "application/json",
        }
    else:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }

    payload = {
        "model": model,
        "input": text,
        "voice": voice,
        "speed": max(0.25, min(4.0, speed)),
        "response_format": "mp3",
    }
    # `synthesize_tts` already decided whether this host supports instructions; attach if present.
    if instructions:
        payload["instructions"] = instructions

    # Respect DISABLE_SSL_VERIFY env var (used elsewhere in the project)
    verify = httpx_verify_arg()

    return url, headers, payload, verify


# Microsoft Learn TTS samples use 2025-04-01-preview for /audio/speech; older
# api-version strings occasionally return DeploymentNotFound for gpt-4o-mini-tts
# even when the deployment exists in Foundry.
_AZURE_TTS_API_VERSION_FALLBACK = "2025-04-01-preview"


def _azure_tts_api_version_attempts(cfg: dict) -> list[str]:
    """Ordered api-version query values to try for Azure OpenAI speech."""
    base = (cfg.get("base_url") or "").lower()
    v = (cfg.get("api_version") or "").strip()
    if "openai.azure.com" not in base or not v:
        return [v]
    out = [v]
    if v != _AZURE_TTS_API_VERSION_FALLBACK:
        out.append(_AZURE_TTS_API_VERSION_FALLBACK)
    return out


# ─── Endpoint ────────────────────────────────────────────────────────────────


@router.post(
    "/synthesize",
    summary="Generate TTS audio for an answer",
    response_class=Response,
    responses={
        200: {"content": {"audio/mpeg": {}}, "description": "MP3 audio stream"},
        503: {"description": "TTS service unavailable or not configured"},
    },
)
async def synthesize_tts(body: TTSRequest):
    """
    Convert text to speech using the configured TTS provider.
    Returns raw MP3 audio bytes — play directly with Web Audio API.

    Frontend example:
        const res = await fetch('/api/v1/tts/synthesize', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ text: answer, language: 'hi' })
        });
        const blob = await res.blob();
        new Audio(URL.createObjectURL(blob)).play();
    """
    # Load config (raises HTTPException 503 if not configured)
    cfg = _load_tts_config()

    clean = _clean_text_for_tts(body.text)
    if not clean:
        raise HTTPException(status_code=400, detail="Empty text provided for TTS.")

    # ── Azure AI Speech (neural Indian voices) — separate from OpenAI / Azure OpenAI TTS ──
    if (cfg.get("provider") or "").lower() == "azure_speech":
        neural = cfg.get("voice") or "en-IN-NeerjaNeural"
        if body.language in ("hi", "hinglish"):
            neural = cfg.get("azure_speech_voice_hi") or neural
        if body.voice and (
            "Neural" in body.voice or body.voice.startswith(("en-", "hi-"))
        ):
            neural = body.voice.strip()
        try:
            from src.services.tts.azure_speech import synthesize_azure_speech_mp3

            mp3 = await synthesize_azure_speech_mp3(
                clean,
                subscription_key=cfg["api_key"],
                speech_endpoint=cfg["base_url"],
                voice_name=neural,
            )
            logger.info(
                "TTS Azure Speech: chars=%s voice=%r lang=%s",
                len(clean),
                neural,
                body.language,
            )
            return Response(
                content=mp3,
                media_type="audio/mpeg",
                headers={"Cache-Control": "no-store"},
            )
        except httpx.HTTPStatusError as e:
            err_preview = (e.response.text or "")[:300]
            logger.error(
                "Azure Speech TTS HTTP error %s: %s | request_url=%s",
                e.response.status_code,
                err_preview,
                getattr(e.request, "url", None),
            )
            raise HTTPException(
                status_code=503,
                detail=f"Azure Speech returned HTTP {e.response.status_code}. "
                       f"Check SPEECH_KEY, SPEECH_ENDPOINT; optional SPEECH_REGION or AZURE_SPEECH_TTS_URL.",
            ) from e
        except Exception as e:
            logger.error(f"Azure Speech TTS failed: {e}")
            raise HTTPException(
                status_code=503,
                detail=f"Azure Speech unavailable: {e}. Check SPEECH_KEY and SPEECH_ENDPOINT.",
            ) from e

    # Indian English: only models that accept `instructions` (e.g. gpt-4o-mini-tts) can change accent.
    speech_instructions: str | None = None
    if body.instructions and body.instructions.strip():
        speech_instructions = body.instructions.strip()
    elif (
        body.language in ("en", "en-IN", "en_IN")
        and os.getenv("TTS_INDIAN_ENGLISH", "true").strip().lower() not in ("0", "false", "no", "off")
    ):
        custom = os.getenv("TTS_INSTRUCTIONS_EN", "").strip()
        speech_instructions = custom or _DEFAULT_INDIAN_ENGLISH_INSTRUCTIONS

    if speech_instructions and not _model_supports_speech_instructions(cfg["model"]):
        logger.warning(
            "TTS: Indian-English accent not applied — deployment model %r does not look like "
            "gpt-4o-mini-tts, so `instructions` were skipped (tts-1 cannot do accents). "
            "Set TTS_MODEL=gpt-4o-mini-tts on OpenAI, or on Azure set TTS_SUPPORTS_INSTRUCTIONS=true "
            "if your deployment is already a mini-TTS model that supports instructions.",
            cfg.get("model"),
        )
        speech_instructions = None

    # Voice: explicit override → per-language default → Settings/env default
    voice = (
        body.voice
        or _LANG_VOICE.get(body.language)
        or cfg.get("voice", "alloy")
    )
    if (
        speech_instructions
        and not body.voice
        and body.language in ("en", "en-IN", "en_IN")
    ):
        # Optional override; do not default to "ballad" — many hosts only allow classic six voices.
        tve = os.getenv("TTS_VOICE_EN", "").strip()
        if tve:
            voice = _normalize_tts_voice(tve, fallback=voice)

    voice = _normalize_tts_voice(voice, fallback="nova")

    if body.language in ("en", "en-IN", "en_IN"):
        logger.info(
            "TTS English request: model=%r voice=%r instructions=%s chars=%s TTS_SUPPORTS_INSTRUCTIONS=%r",
            cfg.get("model"),
            voice,
            "yes" if speech_instructions else "no",
            len(speech_instructions) if speech_instructions else 0,
            os.getenv("TTS_SUPPORTS_INSTRUCTIONS", ""),
        )

    api_versions = _azure_tts_api_version_attempts(cfg)
    last_http: httpx.HTTPStatusError | None = None

    try:
        for idx, api_ver in enumerate(api_versions):
            attempt_cfg = {**cfg, "api_version": api_ver}
            url, headers, payload, verify = _build_tts_request(
                attempt_cfg, clean, voice, body.speed, speech_instructions
            )
            try:
                async with httpx.AsyncClient(timeout=60.0, verify=verify) as client:
                    response = await client.post(url, json=payload, headers=headers)
                    response.raise_for_status()

                if idx > 0:
                    logger.info(
                        "TTS synthesized after retry: api-version=%r (first attempt had Azure DeploymentNotFound)",
                        api_ver,
                    )
                else:
                    logger.info(
                        f"TTS synthesized: {len(clean)} chars, model={cfg['model']}, "
                        f"voice={voice}, lang={body.language}, "
                        f"instructions={'yes' if payload.get('instructions') else 'no'}"
                    )
                return Response(
                    content=response.content,
                    media_type="audio/mpeg",
                    headers={"Cache-Control": "no-store"},
                )

            except httpx.HTTPStatusError as e:
                last_http = e
                err_body = e.response.text or ""
                is_deploy_404 = (
                    e.response.status_code == 404 and "DeploymentNotFound" in err_body
                )
                if is_deploy_404 and idx < len(api_versions) - 1:
                    logger.warning(
                        "TTS Azure DeploymentNotFound with api-version=%r; retrying with %r",
                        api_ver,
                        api_versions[idx + 1],
                    )
                    continue
                err_preview = err_body[:300]
                logger.error(
                    "TTS API HTTP error %s: %s | request_url=%s | cfg_model=%r",
                    e.response.status_code,
                    err_preview,
                    getattr(e.request, "url", None),
                    cfg.get("model"),
                )
                raise HTTPException(
                    status_code=503,
                    detail=f"TTS service returned HTTP {e.response.status_code}. "
                           f"Check TTS_API_KEY and TTS_URL in .env.",
                ) from e

        if last_http:
            raise HTTPException(
                status_code=503,
                detail=f"TTS service returned HTTP {last_http.response.status_code}. "
                       f"Check TTS_API_KEY and TTS_URL in .env.",
            ) from last_http
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS failed: {e}")
        raise HTTPException(
            status_code=503,
            detail=f"TTS unavailable: {e}. Check TTS_URL and TTS_API_KEY in .env.",
        ) from e


# ─── Concept Summary (3–5 sentence audio brief) ──────────────────────────────


class ConceptSummaryRequest(BaseModel):
    """Request a short student-friendly summary of an AI answer for audio playback."""

    text: str = Field(..., description="Full AI response text to summarize")
    query: str | None = Field(
        None,
        description="The student's original question. Used to auto-detect language "
        "(Devanagari script in the query → Hindi summary).",
    )
    language: Literal["auto", "en", "hi"] = Field(
        "auto",
        description="Force a language, or 'auto' to detect from `query`/`text`.",
    )
    max_sentences: int = Field(5, ge=3, le=6, description="Hard cap on output sentences (3–6).")


class ConceptSummaryResponse(BaseModel):
    summary: str
    language: Literal["en", "hi"]
    sentence_count: int


# Plain-prose, TTS-friendly prompts. No markdown / lists / formulas — these
# do not survive in speech and create awkward pauses.
_SUMMARY_SYSTEM_EN = (
    "You are a friendly tutor preparing a SHORT spoken summary for a student. "
    "Rewrite the given answer as 3 to 5 complete sentences of plain prose suitable "
    "for text-to-speech. Cover ONLY the core concept and the final result. "
    "No bullet points, no headings, no markdown, no LaTeX, no code, no emojis, "
    "no parenthetical citations. End every sentence with a period. "
    "Speak in clear, simple English suitable for a school student in India."
)

_SUMMARY_SYSTEM_HI = (
    "आप एक मित्रवत शिक्षक हैं जो किसी छात्र के लिए संक्षिप्त मौखिक सारांश तैयार कर रहे हैं। "
    "दिए गए उत्तर को 3 से 5 पूर्ण वाक्यों में सरल हिंदी गद्य में लिखें, जो टेक्स्ट-टू-स्पीच के लिए उपयुक्त हो। "
    "केवल मुख्य अवधारणा और अंतिम परिणाम बताएं। बुलेट, हेडिंग, मार्कडाउन, LaTeX, कोड या इमोजी का प्रयोग न करें। "
    "हर वाक्य पूर्ण विराम (।) से समाप्त करें। भारत के स्कूली छात्र के लिए सरल हिंदी में बोलें।"
)


def _resolve_summary_language(
    requested: str,
    query: str | None,
    text: str,
) -> Literal["en", "hi"]:
    """Pick `en` vs `hi` for the summary.

    Priority:
        1. Explicit override (`en` or `hi`).
        2. Hindi script in the student's *query* (strongest signal).
        3. Hindi script majority in the answer `text`.
        4. Default → `en`.
    """
    req = (requested or "auto").lower()
    if req == "hi":
        return "hi"
    if req == "en":
        return "en"
    if _looks_like_hindi(query):
        return "hi"
    # Fallback: a non-trivial amount of Devanagari in the answer itself.
    if _looks_like_hindi(text, min_chars=12):
        return "hi"
    return "en"


def _strip_for_summary_input(text: str, limit: int = 6000) -> str:
    """Reduce markdown noise before sending to the LLM; cap to ~6k chars."""
    out = re.sub(r"```[\s\S]*?```", " ", text)               # code fences
    out = re.sub(r"`([^`]+)`", r"\1", out)                   # inline code
    out = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", out)          # images
    out = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", out)       # links
    out = re.sub(r"#+\s*", "", out)                          # headings
    out = re.sub(r"\*\*([^*]+)\*\*", r"\1", out)             # bold
    out = re.sub(r"\*([^*]+)\*", r"\1", out)                 # italic
    out = re.sub(r"[ \t]+", " ", out)
    out = re.sub(r"\n{3,}", "\n\n", out).strip()
    if len(out) > limit:
        out = out[:limit].rsplit(".", 1)[0] + "."
    return out


def _is_transient_upstream_error(err: Exception) -> bool:
    """
    Heuristic: Azure occasionally returns ``404 Resource not found`` for a
    deployment that is otherwise healthy (visible in chat/embedding paths in
    the same process). Treat it as transient and worth one in-endpoint retry.

    The unified LLM factory only retries on 429/5xx; this catches the narrow
    "transient 404" class while leaving real config errors (which surface
    consistently) to bubble up.
    """
    msg = str(err).lower()
    if "resource not found" in msg:
        return True
    # Generic SDK transports sometimes surface a bare "deploymentnotfound" too.
    if "deploymentnotfound" in msg:
        return True
    return False


def _is_content_filter_error(err: Exception) -> bool:
    """
    True if the LLM call was rejected by a provider content-policy filter
    (Azure OpenAI `content_filter`, OpenAI `safety`/`policy_violation`, etc.).
    These are NOT retriable as-is — we need to soften the prompt or give up.
    """
    msg = str(err).lower()
    needles = (
        "content_filter",
        "content management policy",
        "responsibleaipolicyviolation",
        "responsible_ai_policy_violation",
        "policy_violation",
        "content_policy_violation",
        "safety system",
    )
    return any(n in msg for n in needles)


def _content_filter_safe_text(text: str, *, max_chars: int = 1500) -> str:
    """
    Reduce the chance that a benign passage trips Azure's over-aggressive filter.

    Strategy: keep only the first ``max_chars`` characters and drop tokens that
    routinely (but spuriously) trip the medical/biology/anatomy filters in
    Azure OpenAI when summarising NCERT chapters (e.g. "A Triumph of Surgery").
    """
    snippet = text[:max_chars]
    # Strip a handful of trigger words — replacement preserves meaning enough
    # for a high-level summary, and the second-pass prompt asks the LLM to
    # describe the lesson in general/abstract terms.
    softeners = {
        r"\bsurgery\b": "medical procedure",
        r"\bsurgeon(s)?\b": "doctor",
        r"\bsurgical\b": "medical",
        r"\boperat(?:e|ed|ing|ion|ions)\b": "treat",
        r"\bblood\b": "",
        r"\bwound(s|ed)?\b": "injury",
        r"\binjur(y|ies|ed)\b": "issue",
    }
    out = snippet
    for pattern, replacement in softeners.items():
        out = re.sub(pattern, replacement, out, flags=re.IGNORECASE)
    out = re.sub(r"\s{2,}", " ", out).strip()
    return out


def _post_process_summary(raw: str, language: str, max_sentences: int) -> str:
    """Clean LLM output: drop preambles, markdown, and trim to `max_sentences`."""
    cleaned = raw.strip()
    cleaned = re.sub(r"^(here(?:'s| is) (?:a|the) (?:short |brief )?summary[:\-—]*)", "",
                     cleaned, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    cleaned = re.sub(r"[\u2022\u25E6\u2043\-]\s+", "", cleaned)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()

    # Sentence split that respects both `.` and Hindi danda `।` / double danda `॥`.
    if language == "hi":
        parts = re.split(r"(?<=[।॥.!?])\s+", cleaned)
    else:
        parts = re.split(r"(?<=[.!?])\s+", cleaned)

    parts = [p.strip() for p in parts if p.strip()]
    if len(parts) > max_sentences:
        parts = parts[:max_sentences]

    out = " ".join(parts).strip()
    if out:
        return out
    # Model omitted clear sentence breaks (common in Hindi without danda); keep text.
    if cleaned:
        return " ".join(cleaned.split())[: max_sentences * 800].strip()
    return ""


def _minimal_tts_fallback(raw: str, *, max_chars: int = 8000) -> str:
    """
    Last-resort cleanup when strict sentence splitting still yields nothing
    (e.g. odd markdown fences) but the model did return visible characters.
    """
    s = (raw or "").strip()
    if not s:
        return ""
    s = re.sub(r"^```(?:[a-zA-Z0-9_-]*\n)?", "", s)
    s = re.sub(r"\s*```\s*$", "", s)
    s = re.sub(r"\*\*([^*]+)\*\*", r"\1", s)
    s = re.sub(r"`([^`]+)`", r"\1", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:max_chars] if s else ""


@router.post(
    "/concept-summary",
    response_model=ConceptSummaryResponse,
    summary="Generate a 3–5 sentence student-friendly summary for audio playback",
    responses={
        200: {"description": "Plain-prose summary suitable for direct TTS."},
        400: {"description": "Empty or unusable input."},
        422: {"description": "LLM rejected the content (e.g. provider content-filter)."},
        503: {"description": "LLM not configured / unavailable."},
    },
)
async def concept_summary(body: ConceptSummaryRequest) -> ConceptSummaryResponse:
    """
    Produce a SHORT spoken-summary version of an AI answer for audio playback.

    The endpoint:
      1. Auto-detects the target language (Hindi if the student's query uses
         Devanagari; otherwise English) — explicit `language` always wins.
      2. Calls the configured LLM (via `src.services.llm.complete`) with a
         TTS-friendly prompt (no markdown, no formulas).
      3. Returns plain prose. Front-end pipes the result into
         `/api/v1/tts/synthesize` with the same `language`.
    """
    stripped = _strip_for_summary_input(body.text or "")
    if not stripped or len(stripped) < 20:
        raise HTTPException(
            status_code=400,
            detail="Answer text is too short to summarize.",
        )

    language = _resolve_summary_language(body.language, body.query, stripped)
    system_prompt = _SUMMARY_SYSTEM_HI if language == "hi" else _SUMMARY_SYSTEM_EN

    if language == "hi":
        user_prompt = (
            f"छात्र का प्रश्न: {body.query.strip() if body.query else '(उपलब्ध नहीं)'}\n\n"
            f"AI का पूरा उत्तर:\n{stripped}\n\n"
            f"उपरोक्त उत्तर का {body.max_sentences} वाक्यों या उससे कम में सरल हिंदी सारांश लिखें। "
            f"केवल सारांश दें, और कोई व्याख्या या प्रस्तावना नहीं।"
        )
    else:
        user_prompt = (
            f"Student's question: {body.query.strip() if body.query else '(not provided)'}\n\n"
            f"Full AI answer:\n{stripped}\n\n"
            f"Write a {body.max_sentences}-sentence (or fewer) plain-English summary "
            f"of the above answer. Return ONLY the summary text — no preamble."
        )

    from src.services.llm import complete as llm_complete, get_llm_config

    cfg = get_llm_config()

    async def _call_llm(prompt: str) -> str:
        return await llm_complete(
            prompt=prompt,
            system_prompt=system_prompt,
            model=cfg.model,
            api_key=cfg.api_key,
            base_url=cfg.base_url,
            api_version=cfg.api_version,
            binding=cfg.binding,
            temperature=0.3,
            max_tokens=1024,
        )

    raw: str | None = None
    try:
        raw = await _call_llm(user_prompt)
    except HTTPException:
        raise
    except Exception as e:
        # Provider content filter → soften the input and try ONE more time.
        if _is_content_filter_error(e):
            logger.warning(
                "Concept summary blocked by content filter; retrying with softened prompt"
            )
            soft_input = _content_filter_safe_text(stripped)
            if language == "hi":
                retry_prompt = (
                    f"छात्र का प्रश्न: {body.query.strip() if body.query else '(उपलब्ध नहीं)'}\n\n"
                    f"पाठ का संक्षिप्त सार:\n{soft_input}\n\n"
                    f"उपरोक्त पाठ की मुख्य सीख को {body.max_sentences} सरल वाक्यों या उससे कम में "
                    f"सामान्य भाषा में, सम्मानजनक और शैक्षिक स्वर में लिखें। केवल सारांश दें।"
                )
            else:
                retry_prompt = (
                    f"Student's question: {body.query.strip() if body.query else '(not provided)'}\n\n"
                    f"Brief excerpt:\n{soft_input}\n\n"
                    f"In a respectful, educational tone, describe the main lesson of the passage "
                    f"in {body.max_sentences} simple sentences or fewer, using general language. "
                    f"Return ONLY the summary."
                )
            try:
                raw = await _call_llm(retry_prompt)
            except Exception as e2:
                if _is_content_filter_error(e2):
                    logger.info(
                        "Concept summary: content filter blocked retry too — giving up"
                    )
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            "Audio summary unavailable for this passage "
                            "(the AI safety filter declined to summarise it)."
                        ),
                    ) from e2
                logger.error("Concept summary retry failed: %s", e2)
                raise HTTPException(
                    status_code=503,
                    detail="Summary unavailable right now. Please try again.",
                ) from e2
        elif _is_transient_upstream_error(e):
            # Azure occasionally 404s a healthy deployment; one short retry.
            logger.warning(
                "Concept summary hit a transient upstream error; retrying once: %s", e
            )
            await asyncio.sleep(0.5)
            try:
                raw = await _call_llm(user_prompt)
            except Exception as e2:
                logger.error("Concept summary retry (transient) failed: %s", e2)
                raise HTTPException(
                    status_code=503,
                    detail="Summary unavailable right now. Please try again.",
                ) from e2
        else:
            logger.error("Concept summary LLM call failed: %s", e)
            raise HTTPException(
                status_code=503,
                detail="Summary unavailable right now. Please try again.",
            ) from e

    summary = _post_process_summary(raw or "", language, body.max_sentences)
    if not summary:
        raise HTTPException(
            status_code=503,
            detail="Summary unavailable: LLM returned an empty response.",
        )

    # Sentence counter on the post-processed string (matches what we returned).
    if language == "hi":
        sentence_count = len([p for p in re.split(r"(?<=[।॥.!?])\s+", summary) if p.strip()])
    else:
        sentence_count = len([p for p in re.split(r"(?<=[.!?])\s+", summary) if p.strip()])

    logger.info(
        "Concept summary generated: lang=%s sentences=%d chars=%d",
        language, sentence_count, len(summary),
    )

    return ConceptSummaryResponse(
        summary=summary,
        language=language,
        sentence_count=sentence_count,
    )


# ─── Translate an existing summary into the other language ───────────────────


class ConceptSummaryTranslateRequest(BaseModel):
    """Translate an already-generated concept summary into the other language."""

    text: str = Field(..., description="The already-generated summary text to translate.")
    source_lang: Literal["en", "hi"] = Field(..., description="Language of `text`.")
    target_lang: Literal["en", "hi"] = Field(..., description="Language to translate `text` into.")


_TRANSLATE_SYSTEM_EN_TO_HI = (
    "You are a faithful translator preparing audio narration for an Indian student. "
    "Translate the given English summary into clear, simple Hindi suitable for text-to-speech. "
    "Preserve the meaning, sentence count, and order. Keep technical terms recognisable "
    "(use the standard Hindi term plus the English term in parentheses when helpful, e.g. "
    "'संतुलन (equilibrium)'). Use plain prose only — no markdown, no bullet points, no LaTeX, "
    "no emojis. End every sentence with a Devanagari danda (।)."
)

_TRANSLATE_SYSTEM_HI_TO_EN = (
    "You are a faithful translator preparing audio narration for an Indian student. "
    "Translate the given Hindi summary into clear, simple English suitable for text-to-speech. "
    "Preserve the meaning, sentence count, and order. Keep technical terms recognisable in "
    "standard English. Use plain prose only — no markdown, no bullet points, no LaTeX, no "
    "emojis. End every sentence with a period."
)


@router.post(
    "/concept-summary/translate",
    response_model=ConceptSummaryResponse,
    summary="Translate an existing concept summary into the other language",
    responses={
        200: {"description": "Translated summary suitable for direct TTS."},
        400: {"description": "Empty input or source_lang == target_lang."},
        422: {"description": "LLM rejected the content (e.g. provider content-filter)."},
        503: {"description": "LLM not configured / unavailable."},
    },
)
async def concept_summary_translate(
    body: ConceptSummaryTranslateRequest,
) -> ConceptSummaryResponse:
    """
    Translate an already-generated concept summary into the other language.

    This is used for the EN ↔ HI toggle on the audio summary card so that the
    second language reads as a faithful translation of the first (same facts,
    same sentence count) instead of an independent LLM summarisation.
    """
    src = (body.text or "").strip()
    if len(src) < 10:
        raise HTTPException(status_code=400, detail="Summary text is too short to translate.")
    if body.source_lang == body.target_lang:
        raise HTTPException(
            status_code=400,
            detail="source_lang and target_lang must differ for translation.",
        )

    if body.source_lang == "en" and body.target_lang == "hi":
        system_prompt = _TRANSLATE_SYSTEM_EN_TO_HI
        user_prompt = (
            f"Translate the following English summary into simple Hindi. "
            f"Return ONLY the Hindi translation, nothing else:\n\n{src}"
        )
    else:  # hi → en
        system_prompt = _TRANSLATE_SYSTEM_HI_TO_EN
        user_prompt = (
            f"निम्नलिखित हिंदी सारांश का सरल अंग्रेज़ी अनुवाद कीजिए। "
            f"केवल अंग्रेज़ी अनुवाद लौटाएँ, और कुछ नहीं:\n\n{src}"
        )

    from src.services.llm import complete as llm_complete, get_llm_config

    cfg = get_llm_config()

    async def _call_llm(prompt: str, sys_prompt: str, *, max_out: int = 2048) -> str:
        # Generous budget: newer models may reserve completion tokens for internal
        # reasoning; a too-tight cap yields HTTP 200 with an empty message body.
        return await llm_complete(
            prompt=prompt,
            system_prompt=sys_prompt,
            model=cfg.model,
            api_key=cfg.api_key,
            base_url=cfg.base_url,
            api_version=cfg.api_version,
            binding=cfg.binding,
            temperature=0.2,
            max_tokens=max_out,
        )

    raw: str | None = None
    try:
        raw = await _call_llm(user_prompt, system_prompt)
    except HTTPException:
        raise
    except Exception as e:
        if _is_content_filter_error(e):
            # Retry once with softened source (same trick as summarisation).
            logger.warning(
                "Concept summary translate blocked by content filter; retrying softened"
            )
            soft = _content_filter_safe_text(src)
            retry_user = user_prompt.replace(src, soft)
            try:
                raw = await _call_llm(retry_user, system_prompt, max_out=2048)
            except Exception as e2:
                if _is_content_filter_error(e2):
                    raise HTTPException(
                        status_code=422,
                        detail=(
                            "Audio summary unavailable for this passage "
                            "(the AI safety filter declined to translate it)."
                        ),
                    ) from e2
                logger.error("Concept summary translate retry failed: %s", e2)
                raise HTTPException(
                    status_code=503,
                    detail="Translation unavailable right now. Please try again.",
                ) from e2
        elif _is_transient_upstream_error(e):
            logger.warning(
                "Concept summary translate hit a transient upstream error; retrying once: %s",
                e,
            )
            await asyncio.sleep(0.5)
            try:
                raw = await _call_llm(user_prompt, system_prompt, max_out=2048)
            except Exception as e2:
                logger.error(
                    "Concept summary translate retry (transient) failed: %s", e2
                )
                raise HTTPException(
                    status_code=503,
                    detail="Translation unavailable right now. Please try again.",
                ) from e2
        else:
            logger.error("Concept summary translate LLM call failed: %s", e)
            raise HTTPException(
                status_code=503,
                detail="Translation unavailable right now. Please try again.",
            ) from e

    if not (raw or "").strip():
        logger.warning(
            "Concept summary translate: empty model text; retrying once with reinforced prompt"
        )
        await asyncio.sleep(0.35)
        reinforced = (
            user_prompt
            + "\n\nIMPORTANT: Reply with ONLY the translated summary as plain text. "
            "Do not send an empty message — write at least two short sentences."
        )
        try:
            raw = await _call_llm(reinforced, system_prompt, max_out=4096)
        except Exception as e_empty:
            logger.error("Concept summary translate empty-output retry failed: %s", e_empty)
            raw = ""

    translated = _post_process_summary(raw or "", body.target_lang, max_sentences=6)
    if not translated:
        translated = _minimal_tts_fallback(raw or "")
    if not translated:
        raise HTTPException(
            status_code=503,
            detail="Translation unavailable: LLM returned an empty response.",
        )

    if body.target_lang == "hi":
        sentence_count = len([p for p in re.split(r"(?<=[।॥.!?])\s+", translated) if p.strip()])
    else:
        sentence_count = len([p for p in re.split(r"(?<=[.!?])\s+", translated) if p.strip()])

    logger.info(
        "Concept summary translated: %s→%s sentences=%d chars=%d",
        body.source_lang,
        body.target_lang,
        sentence_count,
        len(translated),
    )

    return ConceptSummaryResponse(
        summary=translated,
        language=body.target_lang,
        sentence_count=sentence_count,
    )
