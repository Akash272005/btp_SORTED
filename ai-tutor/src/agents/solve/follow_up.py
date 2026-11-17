"""Lightweight follow-up answers for Smart Solver chat sessions."""

from __future__ import annotations

from typing import Any

from src.services.config import get_agent_params, parse_language
from src.services.llm import complete as llm_complete

_MAX_USER_CHARS = 6000
_MAX_ASSISTANT_CHARS = 12000

_FOLLOW_UP_SYSTEM = """You are a patient K-12 math and science tutor continuing an existing Smart Solver session.

The student already asked a question and received a detailed solution in this same conversation.
Your job is to answer their NEW follow-up message using the conversation history below.

Rules:
- If they say "above problem", "previous question", "just solved", "that circle question", etc., they mean the ORIGINAL problem in this chat — do NOT ask them to repeat it.
- Give clear, step-by-step help. Use Markdown headings when helpful.
- Use LaTeX for math: inline $x$ and block $$...$$.
- Do NOT use citation placeholders like [cite_id] or [rag-1].
- Do NOT run a generic "analyze the problem first" template — answer their specific follow-up directly.
- Write in {language_name}."""


def _truncate(text: str, limit: int) -> str:
    cleaned = (text or "").strip()
    if len(cleaned) <= limit:
        return cleaned
    return cleaned[: limit - 3].rstrip() + "..."


def is_follow_up_session(messages: list[dict[str, Any]] | None) -> bool:
    """True when the session already has at least one tutor reply before this turn."""
    if not messages:
        return False
    assistant_replies = sum(1 for m in messages if m.get("role") == "assistant")
    user_messages = sum(1 for m in messages if m.get("role") == "user")
    # Needs one prior answer plus the new user message already stored this turn.
    return assistant_replies >= 1 and user_messages >= 2


def get_prior_output_dir(messages: list[dict[str, Any]] | None) -> str:
    """Reuse artifact folder from the most recent assistant message (for image links)."""
    if not messages:
        return ""
    for msg in reversed(messages):
        if msg.get("role") != "assistant":
            continue
        output_dir = msg.get("output_dir") or msg.get("outputDir")
        if isinstance(output_dir, str) and output_dir.strip():
            return output_dir.strip()
    return ""


def format_conversation_for_prompt(messages: list[dict[str, Any]]) -> str:
    lines: list[str] = []
    for msg in messages:
        role = msg.get("role")
        content = str(msg.get("content") or "").strip()
        if not content:
            continue
        if role == "user":
            lines.append(f"Student: {_truncate(content, _MAX_USER_CHARS)}")
        elif role == "assistant":
            lines.append(f"Tutor: {_truncate(content, _MAX_ASSISTANT_CHARS)}")
    return "\n\n".join(lines)


async def answer_follow_up(
    question: str,
    messages: list[dict[str, Any]],
    *,
    api_key: str,
    base_url: str,
    api_version: str | None = None,
    language: str = "en",
) -> str:
    """Answer a follow-up using prior session messages (no full dual-loop solve)."""
    lang_code = parse_language(language)
    language_name = "English" if lang_code == "en" else "the same language as the student"

    history = format_conversation_for_prompt(messages)
    if not history.strip():
        history = "(No prior messages recorded.)"

    user_prompt = (
        "## Conversation so far\n"
        f"{history}\n\n"
        "## Student's latest message\n"
        f"{question.strip()}\n\n"
        "Reply to the latest message only, using the full conversation context."
    )

    params = get_agent_params("solve")
    response = await llm_complete(
        prompt=user_prompt,
        system_prompt=_FOLLOW_UP_SYSTEM.format(language_name=language_name),
        api_key=api_key,
        base_url=base_url,
        api_version=api_version,
        temperature=params.get("temperature", 0.5),
        max_tokens=min(int(params.get("max_tokens", 4096)), 4096),
    )
    return (response or "").strip() or "I couldn't generate a follow-up answer. Please try rephrasing."
