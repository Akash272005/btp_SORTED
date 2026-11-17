#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Detect provider content-policy blocks and soften prompts for retry."""

from __future__ import annotations

import re

_CONTENT_FILTER_NEEDLES = (
    "content_filter",
    "content management policy",
    "responsibleaipolicyviolation",
    "responsible_ai_policy_violation",
    "policy_violation",
    "content_policy_violation",
    "safety system",
)


def is_content_filter_error(err: Exception | str) -> bool:
    """True when an LLM call was rejected by a provider safety/content filter."""
    msg = str(err).lower()
    return any(needle in msg for needle in _CONTENT_FILTER_NEEDLES)


def content_filter_safe_text(text: str, *, max_chars: int = 8000) -> str:
    """
    Shorten and neutralize lesson text before a content-filter retry.

    Keeps educational meaning while reducing false positives on Azure OpenAI
  filters (common with NCERT science/history passages).
    """
    snippet = (text or "")[:max_chars]
    softeners = {
        r"\bsurgery\b": "medical procedure",
        r"\bsurgeon(s)?\b": "doctor",
        r"\bsurgical\b": "medical",
        r"\boperat(?:e|ed|ing|ion|ions)\b": "treat",
        r"\bblood\b": "",
        r"\bwound(s|ed)?\b": "injury",
        r"\bkill(?:ed|ing|s)?\b": "remove",
        r"\bwar\b": "conflict",
        r"\bweapon(s)?\b": "tool",
        r"\bsegregat(?:e|ed|ion)\b": "separation",
        r"\brace\b": "group",
        r"\bhatred\b": "dislike",
        r"\bhate\b": "dislike",
    }
    out = snippet
    for pattern, replacement in softeners.items():
        out = re.sub(pattern, replacement, out, flags=re.IGNORECASE)
    out = re.sub(r"\s{2,}", " ", out).strip()
    return out
