# -*- coding: utf-8 -*-
"""
TTS Configuration
=================

Configuration management for Text-to-Speech services.
Simplified version - loads from unified config service or falls back to .env.
"""

import logging
import os
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

logger = logging.getLogger(__name__)

# Load environment variables
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
# Optional org defaults first; project `.env` must win so TTS_URL / TTS_MODEL edits apply.
load_dotenv(PROJECT_ROOT / "bixy_AiTutor.env", override=False)
load_dotenv(PROJECT_ROOT / ".env", override=True)


def _strip_value(value: Optional[str]) -> Optional[str]:
    """Remove leading/trailing whitespace and quotes from string."""
    if value is None:
        return None
    return value.strip().strip("'\"")


def _env_overlay_tts(base: dict) -> dict:
    """
    When any TTS_* variable is set in the environment, it overrides the same field
    from persisted Settings. Otherwise editing .env has no effect if the UI saved
    a different active TTS profile.
    """
    out = dict(base)
    for key, env_key in (
        ("model", "TTS_MODEL"),
        ("api_key", "TTS_API_KEY"),
        ("base_url", "TTS_URL"),
        ("api_version", "TTS_BINDING_API_VERSION"),
        ("voice", "TTS_VOICE"),
    ):
        v = _strip_value(os.getenv(env_key))
        if v:
            out[key] = v
    return out


def _azure_speech_config_from_env() -> dict | None:
    """When ``TTS_BINDING=azure_speech``, use Azure Speech (SSML) instead of OpenAI/Azure OpenAI TTS."""
    if (_strip_value(os.getenv("TTS_BINDING")) or "").lower() != "azure_speech":
        return None
    key = _strip_value(os.getenv("SPEECH_KEY") or os.getenv("AZURE_SPEECH_KEY"))
    endpoint = _strip_value(os.getenv("SPEECH_ENDPOINT"))
    voice_en = _strip_value(os.getenv("TTS_VOICE", "en-IN-NeerjaNeural"))
    voice_hi = _strip_value(os.getenv("TTS_VOICE_HI", "hi-IN-SwaraNeural"))
    if not key or not endpoint:
        raise ValueError(
            "TTS_BINDING=azure_speech requires SPEECH_KEY (or AZURE_SPEECH_KEY) and SPEECH_ENDPOINT in .env"
        )
    return {
        "provider": "azure_speech",
        "model": "azure-speech",
        "api_key": key,
        "base_url": endpoint.rstrip("/"),
        "api_version": None,
        "voice": voice_en or "en-IN-NeerjaNeural",
        "azure_speech_voice_hi": voice_hi or "hi-IN-SwaraNeural",
    }


def get_tts_config() -> dict:
    """
    Return complete configuration for TTS (Text-to-Speech).

    Priority:
    0. If ``TTS_BINDING=azure_speech`` in the environment, return Azure Speech credentials
       (SPEECH_KEY, SPEECH_ENDPOINT, TTS_VOICE) — overrides persisted OpenAI-style TTS.
    1. Active configuration from unified config service (Settings UI)
    2. Any non-empty ``TTS_*`` / ``TTS_BINDING_*`` variables in the environment override
       the same fields from (1) — so ``.env`` edits apply without clearing Settings.
    3. If (1) is unavailable, load entirely from environment variables.

    Returns:
        dict: ``provider`` is ``azure_speech`` when using Azure Speech; otherwise OpenAI-style fields.

    Raises:
        ValueError: If required configuration is missing
    """
    azure_cfg = _azure_speech_config_from_env()
    if azure_cfg is not None:
        return azure_cfg

    # 1. Try to get active config from unified config service
    try:
        from src.services.config import get_active_tts_config

        config = get_active_tts_config()
        if config and config.get("model"):
            return _env_overlay_tts(
                {
                    "model": config["model"],
                    "api_key": config.get("api_key", ""),
                    "base_url": config.get("base_url", ""),
                    "api_version": config.get("api_version"),
                    "voice": config.get("voice", "alloy"),
                }
            )
    except ImportError:
        # Unified config service not yet available, fall back to env
        pass
    except Exception as e:
        logger.warning(f"Failed to load from unified config: {e}")

    # 2. Fallback to environment variables
    model = _strip_value(os.getenv("TTS_MODEL"))
    api_key = _strip_value(os.getenv("TTS_API_KEY"))
    base_url = _strip_value(os.getenv("TTS_URL"))
    api_version = _strip_value(os.getenv("TTS_BINDING_API_VERSION"))
    voice = _strip_value(os.getenv("TTS_VOICE", "alloy"))

    # Validate required configuration
    if not model:
        raise ValueError(
            "TTS_MODEL not set. Please configure it in .env file or add a configuration in Settings"
        )
    if not api_key:
        raise ValueError(
            "TTS_API_KEY not set. Please configure it in .env file or add a configuration in Settings"
        )
    if not base_url:
        raise ValueError(
            "TTS_URL not set. Please configure it in .env file or add a configuration in Settings"
        )

    return {
        "model": model,
        "api_key": api_key,
        "base_url": base_url,
        "api_version": api_version,
        "voice": voice,
    }


__all__ = ["get_tts_config"]
