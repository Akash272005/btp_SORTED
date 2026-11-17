"""
Detect dominant script / locale for assistant replies (Related Visuals routing).
"""

from __future__ import annotations

import re

# Devanagari block (Hindi, Marathi, Sanskrit, etc.)
_DEV_RE = re.compile(r"[\u0900-\u097F]")


def detect_response_locale(text: str) -> str:
    """
    Return 'hi' when the reply is predominantly Devanagari (typical Hindi UI path),
    otherwise 'en'. Uses a short prefix so long mixed documents do not skew counts.
    """
    if not text or not text.strip():
        return "en"

    sample = text.strip()[:4500]
    dev_tokens = len(_DEV_RE.findall(sample))
    latin = sum(1 for c in sample if "a" <= c.lower() <= "z")

    # Strong Hindi signal
    if dev_tokens >= 12 and dev_tokens >= max(6, latin * 0.25):
        return "hi"
    # Short Hindi-only snippets
    if dev_tokens >= 4 and latin <= 2:
        return "hi"
    return "en"


def detect_visual_locale(user_message: str, ai_response: str) -> str:
    """
    Locale for Related Visuals: prefer the student's question language when we can tell,
    then fall back to the assistant reply. Repeating the question bumps Devanagari/Latin counts.
    """
    um = (user_message or "").strip()
    ar = (ai_response or "").strip()
    if um:
        combined = "\n".join((um, um, um, ar))
    else:
        combined = ar or um
    return detect_response_locale(combined)


def combined_text_matches_visual_locale(
    *,
    title: str,
    keyword: str,
    description: str,
    visual_locale: str,
) -> bool:
    """
    Cheap metadata gate so we do not pad Hindi sessions with English-only page titles
    (and vice versa). Not OCR — thumbnail language can still differ occasionally.

    NOTE: ``keyword`` is OUR search query (always already in the visual locale) — using
    it as a "signal" creates a leak where every result auto-passes. We only consider
    ``title`` and ``description`` for the script ratio.
    """
    title = title or ""
    description = description or ""
    blob = f"{title}\n{description}"
    dev = len(_DEV_RE.findall(blob))
    latin = sum(1 for c in blob if "a" <= c.lower() <= "z")

    if visual_locale == "hi":
        # Page title/description must show some Devanagari — title echoing our own
        # Hindi query (Tavily fallback) is filtered out at the caller level.
        if dev >= 4:
            return True
        if dev >= 2 and latin <= max(8, dev * 4):
            return True
        return False

    # English session: drop overwhelmingly Hindi metadata (mixed classrooms aside).
    if dev >= 14 and latin <= 6:
        return False
    return True


__all__ = [
    "detect_response_locale",
    "detect_visual_locale",
    "combined_text_matches_visual_locale",
]
