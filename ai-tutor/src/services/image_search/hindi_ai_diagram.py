"""
Optional Hindi-only Related Visual: Azure OpenAI–compatible image generation.

English pipeline is unchanged. When enabled, generates ONE educational diagram
with explicit Devanagari labels (best-effort; diffusion models may still drift).

Env:
  RELATED_VISUALS_HINDI_AI_IMAGE_ENABLED=true
  IMAGE_GEN_HOST=https://RESOURCE.openai.azure.com/openai/deployments/YOUR_IMAGE_DEPLOYMENT
  IMAGE_GEN_API_KEY=...       (falls back to LLM_API_KEY)
  IMAGE_GEN_API_VERSION=...   (gpt-image series: try 2025-04-01-preview or newer per portal/docs)
  IMAGE_GEN_SIZE=1024x1024
  IMAGE_GEN_QUALITY=medium   recommended for gpt-image (low|medium|high)
  IMAGE_GEN_OUTPUT_FORMAT=png
  IMAGE_GEN_LEGACY_RESPONSE_URL=false   set true only if deployment supports response_format \"url\"
  RELATED_VISUALS_HINDI_AI_ONLY=true   optional — skip Tavily/Google after a successful AI image
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)


def hindi_ai_diagram_enabled() -> bool:
    v = os.getenv("RELATED_VISUALS_HINDI_AI_IMAGE_ENABLED", "").strip().lower()
    return v in ("1", "true", "yes", "on")


def hindi_ai_only_mode() -> bool:
    v = os.getenv("RELATED_VISUALS_HINDI_AI_ONLY", "").strip().lower()
    return v in ("1", "true", "yes", "on")


def _image_gen_host() -> str:
    return os.getenv("IMAGE_GEN_HOST", "").strip().rstrip("/")


def _image_gen_url() -> str | None:
    host = _image_gen_host()
    if not host:
        return None
    api_ver = os.getenv("IMAGE_GEN_API_VERSION", "2025-04-01-preview").strip()
    return f"{host}/images/generations?api-version={api_ver}"


def _image_gen_api_key() -> str:
    return (
        os.getenv("IMAGE_GEN_API_KEY", "").strip()
        or os.getenv("LLM_API_KEY", "").strip()
    )


def build_hindi_diagram_prompt(
    *,
    user_message: str,
    ai_response: str,
    topic_hi: str,
) -> str:
    """Single prompt for image API — English instructions, Hindi labels only inside diagram."""
    um = (user_message or "").strip()[:400]
    ar = (ai_response or "").strip()[:900]
    topic = (topic_hi or "").strip()[:200]
    return (
        "Create a single clean educational textbook-style illustration (India NCERT / CBSE style). "
        "White or very light background. Clear lines, no watermark, no decorative clutter.\n\n"
        "**CRITICAL — all visible labels, captions, arrows text, and annotations inside the image "
        "must be written ONLY in Hindi using Devanagari script.** "
        "Do not use English words or Latin letters for labels (allowed exceptions: chemical formulas "
        "like H2O, CO2, NaCl if absolutely necessary for science).\n\n"
        f"Main topic (Hindi): {topic}\n"
        f"Student question context:\n{um}\n\n"
        f"Tutor answer excerpt (use only for factual structure):\n{ar}\n\n"
        "Output one coherent diagram that matches the topic — flowchart, cross-section, or labeled "
        "schematic — suitable for class notes. "
        "Leave generous empty margin on all four sides (at least 5% of canvas); keep every box and "
        "arrow fully inside the frame — nothing cropped at left/right/top/bottom edges."
    )


def generate_hindi_diagram_entry_sync(
    *,
    user_message: str,
    ai_response: str,
    topic_hi: str,
    keyword: str,
) -> dict[str, str] | None:
    """
    Calls Azure OpenAI image generations compatible endpoint.
    Returns Related Visuals entry dict or None on failure.
    """
    url = _image_gen_url()
    api_key = _image_gen_api_key()
    if not url or not api_key:
        logger.warning(
            "[HindiAIImage] IMAGE_GEN_HOST or API key missing — skipping AI diagram generation"
        )
        return None

    prompt = build_hindi_diagram_prompt(
        user_message=user_message,
        ai_response=ai_response,
        topic_hi=topic_hi,
    )
    if len(prompt) > 4000:
        prompt = prompt[:3997] + "..."

    size = os.getenv("IMAGE_GEN_SIZE", "1024x1024").strip() or "1024x1024"
    body: dict[str, Any] = {
        "prompt": prompt,
        "n": 1,
        "size": size,
    }
    quality = os.getenv("IMAGE_GEN_QUALITY", "medium").strip()
    if quality:
        body["quality"] = quality

    out_fmt = os.getenv("IMAGE_GEN_OUTPUT_FORMAT", "png").strip()
    if out_fmt:
        body["output_format"] = out_fmt

    legacy_url = os.getenv("IMAGE_GEN_LEGACY_RESPONSE_URL", "").strip().lower() in (
        "1",
        "true",
        "yes",
        "on",
    )
    if legacy_url:
        body["response_format"] = "url"

    headers = {"Content-Type": "application/json", "api-key": api_key}

    try:
        r = requests.post(url, headers=headers, json=body, timeout=120)
        if r.status_code >= 400:
            logger.error(
                "[HindiAIImage] HTTP %s: %s",
                r.status_code,
                r.text[:500],
            )
            return None
        data = r.json()
    except requests.RequestException as e:
        logger.error("[HindiAIImage] Request failed: %s", e)
        return None
    except json.JSONDecodeError as e:
        logger.error("[HindiAIImage] Invalid JSON: %s", e)
        return None

    items = data.get("data") or []
    if not items:
        logger.warning("[HindiAIImage] Empty data[] in response")
        return None

    first = items[0]
    img_url = (first.get("url") or "").strip()
    if img_url:
        title_hi = f"{topic_hi[:120]} — हिंदी आरेख"
        return {
            "url": img_url,
            "title": title_hi,
            "description": "AI से बना शैक्षिक आरेख (हिंदी लेबल)",
            "source_url": "",
            "keyword": (keyword or topic_hi)[:200],
        }

    b64 = first.get("b64_json")
    if isinstance(b64, str) and b64.strip():
        data_uri = f"data:image/png;base64,{b64.strip()}"
        title_hi = f"{topic_hi[:120]} — हिंदी आरेख"
        return {
            "url": data_uri,
            "title": title_hi,
            "description": "AI से बना शैक्षिक आरेख (हिंदी लेबल)",
            "source_url": "",
            "keyword": (keyword or topic_hi)[:200],
        }

    logger.warning("[HindiAIImage] No url or b64_json in response item")
    return None


__all__ = [
    "hindi_ai_diagram_enabled",
    "hindi_ai_only_mode",
    "build_hindi_diagram_prompt",
    "generate_hindi_diagram_entry_sync",
]
