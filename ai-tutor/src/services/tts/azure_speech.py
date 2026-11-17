# -*- coding: utf-8 -*-
"""Azure AI Speech (Cognitive Services) REST TTS — SSML + neural voices (e.g. en-IN-NeerjaNeural)."""

from __future__ import annotations

import logging
import os
import xml.sax.saxutils as xml_esc

import httpx

from src.utils.tls_env import httpx_verify_arg

logger = logging.getLogger(__name__)


def resolve_azure_speech_tts_url(speech_endpoint: str) -> str:
    """
    Build the short-audio TTS POST URL.

    Priority:
    1. AZURE_SPEECH_TTS_URL — full URL override.
    2. SPEECH_REGION / AZURE_SPEECH_REGION — regional host (correct for almost all keys).
    3. SPEECH_ENDPOINT ending in .cognitiveservices.azure.com — that host does **not** serve
       ``/cognitiveservices/v1`` for SSML TTS; we map to
       ``https://{region}.tts.speech.microsoft.com/cognitiveservices/v1`` using SPEECH_REGION
       or COGNITIVE_SERVICES_RESOURCE_REGION or ``eastus2`` as last resort.
    4. Any other SPEECH_ENDPOINT — append ``/cognitiveservices/v1`` (rare).
    """
    override = (os.getenv("AZURE_SPEECH_TTS_URL") or "").strip().rstrip("/")
    if override:
        return override

    explicit_region = (
        (os.getenv("SPEECH_REGION") or os.getenv("AZURE_SPEECH_REGION") or "").strip().lower()
    )
    base = (speech_endpoint or "").strip().rstrip("/")
    if not base:
        raise ValueError("SPEECH_ENDPOINT is empty")

    # Portal "Endpoint" for many Cognitive Services accounts — NOT the SSML TTS data plane.
    if ".cognitiveservices.azure.com" in base.lower():
        region = explicit_region or (
            (os.getenv("COGNITIVE_SERVICES_RESOURCE_REGION") or "eastus2").strip().lower()
        )
        if not explicit_region and not getattr(
            resolve_azure_speech_tts_url, "_logged_cognitive_redirect", False
        ):
            logger.info(
                "Azure Speech: SPEECH_ENDPOINT uses cognitiveservices.azure.com, which does not "
                "host SSML TTS. Using regional URL https://%s.tts.speech.microsoft.com/cognitiveservices/v1 "
                "(set SPEECH_REGION if this is not your resource region).",
                region,
            )
            resolve_azure_speech_tts_url._logged_cognitive_redirect = True
        return f"https://{region}.tts.speech.microsoft.com/cognitiveservices/v1"

    if explicit_region:
        return f"https://{explicit_region}.tts.speech.microsoft.com/cognitiveservices/v1"

    if base.endswith("/cognitiveservices/v1"):
        return base
    return f"{base}/cognitiveservices/v1"


def build_ssml(text: str, voice_name: str) -> str:
    """Minimal SSML with XML-safe text."""
    safe_text = xml_esc.escape(text)
    vn = xml_esc.escape(voice_name.strip())
    low = voice_name.lower()
    if low.startswith("hi-"):
        xml_lang = "hi-IN"
    elif low.startswith("en-"):
        xml_lang = "en-IN" if "in" in low else "en-US"
    else:
        xml_lang = "en-IN"
    return (
        f"<speak version='1.0' xml:lang='{xml_lang}'>"
        f"<voice name='{vn}'>{safe_text}</voice>"
        "</speak>"
    )


async def synthesize_azure_speech_mp3(
    text: str,
    *,
    subscription_key: str,
    speech_endpoint: str,
    voice_name: str,
    output_format: str | None = None,
) -> bytes:
    """
    POST SSML to Azure Speech REST and return MP3 bytes.

    See: https://learn.microsoft.com/azure/ai-services/speech-service/rest-text-to-speech
    """
    url = resolve_azure_speech_tts_url(speech_endpoint)
    fmt = (output_format or os.getenv("AZURE_SPEECH_OUTPUT_FORMAT") or "").strip()
    if not fmt:
        fmt = "audio-16khz-32kbitrate-mono-mp3"
    headers = {
        "Ocp-Apim-Subscription-Key": subscription_key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": fmt,
        "User-Agent": "bixy_AiTutor",
    }
    body = build_ssml(text, voice_name).encode("utf-8")
    verify = httpx_verify_arg()
    async with httpx.AsyncClient(timeout=90.0, verify=verify) as client:
        r = await client.post(url, headers=headers, content=body)
    if r.status_code >= 400:
        preview = (r.text or "")[:400]
        logger.error("Azure Speech TTS HTTP %s | url=%s | body_preview=%r", r.status_code, url, preview)
        r.raise_for_status()
    return r.content


__all__ = [
    "build_ssml",
    "resolve_azure_speech_tts_url",
    "synthesize_azure_speech_mp3",
]
