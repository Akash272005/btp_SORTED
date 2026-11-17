"""
LLM text cleanup for noisy math OCR (fractions, superscripts, broken lines).
"""

from __future__ import annotations

import os
import re

from src.app_logging import get_logger
from src.services.llm import factory
from src.services.llm.config import get_llm_config
from src.services.ocr.llm_vision import is_llm_vision_configured

logger = get_logger("LLMCleanupOCR")

_CLEANUP_PROMPT = """You receive noisy OCR text extracted from a textbook or worksheet photo.

Restore the exam question exactly as written. Fix:
- Superscripts (use Unicode ² ³ or ^2 where appropriate)
- Fractions (use a/b form, e.g. y²/100, y/10)
- Broken lines that belong on one equation row
- Obvious OCR mistakes (e.g. letter y misread as digit 9)

REMOVE notebook brand names/logos (e.g. RANKA, CLASSMATE), page headers, watermarks,
and any line that is not part of the actual question.

Keep question numbers, steps, and bracketed notes like [Using a² - b² = (a + b)(a - b)].
Output ONLY the cleaned question text — no commentary, no markdown fences.
Language hint: {language}

OCR text:
{raw}
"""


def is_cleanup_enabled() -> bool:
    return os.getenv("SOLVER_OCR_LLM_CLEANUP", "true").strip().lower() not in (
        "0",
        "false",
        "no",
        "off",
    )


def needs_math_cleanup(text: str) -> bool:
    """Heuristic: OCR output likely needs math/formatting repair."""
    t = (text or "").strip()
    if not t:
        return False

    if re.search(r"\.\.\.", t):
        return True
    if re.search(r"[a-zA-Z]2[\s_=/\-]", t):
        return True
    if re.search(r"[a-zA-Z]_[a-zA-Z0-9]", t):
        return True

    lines = [ln.strip() for ln in t.splitlines() if ln.strip()]
    if len(lines) >= 3:
        short_lines = sum(1 for ln in lines if len(ln) <= 4)
        if short_lines >= 2 and ("=" in t or "/" in t):
            return True

    return False


async def cleanup_ocr_math_text(text: str, language: str = "en") -> str:
    """Use LLM to repair garbled math OCR while preserving the original meaning."""
    raw = (text or "").strip()
    if not raw or not is_llm_vision_configured() or not is_cleanup_enabled():
        return raw

    lang = (language or "en").strip().lower()[:2] or "en"
    prompt = _CLEANUP_PROMPT.format(language=lang, raw=raw)

    try:
        config = get_llm_config()
        cleaned = await factory.complete(
            prompt=prompt,
            system_prompt=(
                "You clean up OCR text from school textbook photos. "
                "Preserve math exactly; output plain text only."
            ),
            model=config.model,
            api_key=config.api_key,
            base_url=config.base_url,
            api_version=getattr(config, "api_version", None),
            binding=getattr(config, "binding", None),
            max_tokens=2048,
            temperature=0.1,
        )
        result = (cleaned or "").strip()
        if not result or len(result) < max(8, len(raw) // 4):
            return raw
        logger.info(
            "LLM OCR cleanup: %d -> %d characters",
            len(raw),
            len(result),
        )
        return result
    except Exception as exc:
        logger.warning("LLM OCR cleanup failed: %s", exc)
        return raw
