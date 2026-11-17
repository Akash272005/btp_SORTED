# -*- coding: utf-8 -*-
"""Normalize exam mark notation in question text (e.g. '10 M' → '10 Marks')."""

from __future__ import annotations

import re


def _marks_label(value: str) -> str:
    n = int(value)
    return f"{n} Mark" if n == 1 else f"{n} Marks"


def _format_slash_marks(nums: str) -> str:
    parts = [p.strip() for p in nums.split("/") if p.strip()]
    if not parts or len(parts) > 6:
        return nums
    if not all(p.isdigit() and 1 <= int(p) <= 100 for p in parts):
        return nums
    return " / ".join(_marks_label(p) for p in parts)


_SLASH_GROUP = re.compile(r"\b(\d{1,2}(?:/\d{1,2}){1,5})\b")


def normalize_exam_marks(text: str) -> str:
    """Make mark values readable: '10 M' → '10 Marks', '5/6/1' → '5 Marks / 6 Marks / 1 Mark'."""
    if not text or not text.strip():
        return text

    result = text

    # **10 M** (markdown bold)
    result = re.sub(
        r"\*\*(\d{1,3})\s*M\*\*",
        lambda m: f"**{_marks_label(m.group(1))}**",
        result,
        flags=re.IGNORECASE,
    )

    # [5/6/1] or (5/6/1)
    def _bracket_slash(match: re.Match[str]) -> str:
        inner = _format_slash_marks(match.group(2))
        return f"{match.group(1)}{inner}{match.group(3)}"

    result = re.sub(r"([\[(])(\d{1,2}(?:/\d{1,2}){1,5})([\])])", _bracket_slash, result)

    # : 5/6/1 or : 10 M at end of a line
    result = re.sub(
        r":\s*(\d{1,2}(?:/\d{1,2}){1,5})(?=\s*$)",
        lambda m: f": {_format_slash_marks(m.group(1))}",
        result,
        flags=re.MULTILINE,
    )

    # Integer + M (not molarity like "1 M NaCl")
    result = re.sub(
        r"\b(\d{1,3})\s*M\b(?!\s*[A-Za-z])",
        lambda m: _marks_label(m.group(1)),
        result,
    )

    # Remaining slash groups (e.g. trailing "5/6/1")
    def _slash_group(match: re.Match[str]) -> str:
        return _format_slash_marks(match.group(1))

    result = _SLASH_GROUP.sub(_slash_group, result)

    # Normalize existing "2 marks" → "2 Marks"
    result = re.sub(
        r"\b(\d{1,3})\s*marks\b",
        lambda m: _marks_label(m.group(1)),
        result,
        flags=re.IGNORECASE,
    )

    return result


def normalize_question_dict(question: dict) -> dict:
    """Apply mark normalization to question text and MCQ options."""
    if not isinstance(question, dict):
        return question

    q_text = question.get("question")
    if isinstance(q_text, str):
        question["question"] = normalize_exam_marks(q_text)

    options = question.get("options")
    if isinstance(options, dict):
        question["options"] = {
            k: normalize_exam_marks(v) if isinstance(v, str) else v
            for k, v in options.items()
        }

    return question
