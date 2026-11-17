"""Generate LMS quiz questions from NCERT chapter via AgentCoordinator (no difficulty UI)."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Any

from src.agents.question.coordinator import AgentCoordinator
from src.lms.constants import MAX_NCERT_QUIZ_GENERATE_QUESTIONS
from src.lms.services.ncert_question_requirements import generation_requirement_for_section
from src.services.llm.config import get_llm_config
from src.services.settings.interface_settings import get_ui_language


def _map_choice_options(options: Any) -> list[str]:
    if isinstance(options, dict):
        return [str(options[k]) for k in sorted(options.keys())]
    if isinstance(options, list):
        return [str(o) for o in options]
    return []


def _resolve_correct_answer(options: Any, correct: str) -> str:
    correct = str(correct or "").strip()
    if isinstance(options, dict) and correct in options:
        return str(options[correct]).strip()
    return correct


def map_agent_question_to_lms(
    raw: dict[str, Any],
    index: int,
    section_type: str | None = None,
) -> dict[str, Any]:
    """Convert question agent output to LMS quiz/paper question JSON."""
    st = (section_type or "mcq").strip().lower()
    qtype = str(raw.get("question_type", "choice")).lower()
    qid = f"q{index}"
    text = str(raw.get("question", "")).strip()
    if not text:
        text = f"Question {index}"

    if st == "mcq" or qtype == "choice":
        options = _map_choice_options(raw.get("options"))
        if len(options) < 2:
            options = ["Option A", "Option B", "Option C", "Option D"]
        correct = _resolve_correct_answer(raw.get("options"), str(raw.get("correct_answer", "")))
        return {
            "id": qid,
            "type": "mcq",
            "text": text,
            "marks": 1,
            "options": options,
            "correct_answer": correct or options[0],
            "source": "ncert_ai",
        }

    if st == "long":
        return {
            "id": qid,
            "type": "long",
            "text": text,
            "marks": 5,
            "correct_answer": str(raw.get("correct_answer", "")).strip() or None,
            "source": "ncert_ai",
        }

    return {
        "id": qid,
        "type": "short",
        "text": text,
        "marks": 3,
        "correct_answer": str(raw.get("correct_answer", "")).strip() or None,
        "source": "ncert_ai",
    }


def map_batch_to_lms_questions(
    batch: dict[str, Any],
    section_type: str | None = None,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for idx, item in enumerate(batch.get("results") or [], start=1):
        q = item.get("question") if isinstance(item, dict) else None
        if isinstance(q, dict):
            out.append(map_agent_question_to_lms(q, idx, section_type=section_type))
    return out


def build_ncert_coordinator(kb_name: str = "ncert-class-8") -> AgentCoordinator:
    root_dir = Path(__file__).resolve().parent.parent.parent.parent
    output_base = root_dir / "data" / "user" / "question" / "lms"
    ui_lang = "en"
    try:
        from src.services.config import load_config_with_main

        cfg_path = root_dir / "config" / "main.yaml"
        if cfg_path.exists():
            ui_lang = (
                load_config_with_main(str(cfg_path))
                .get("system", {})
                .get("language", "en")
            )
    except Exception:
        pass

    try:
        llm_config = get_llm_config()
        api_key = llm_config.api_key
        base_url = llm_config.base_url
        api_version = getattr(llm_config, "api_version", None)
    except Exception:
        api_key = None
        base_url = None
        api_version = None

    return AgentCoordinator(
        api_key=api_key,
        base_url=base_url,
        api_version=api_version,
        kb_name=kb_name,
        language=get_ui_language(default=ui_lang),
        max_rounds=10,
        output_dir=str(output_base),
    )


def topic_label(
    *,
    chapter_label: str,
    subject: str,
    ncert_class: str | None = None,
) -> str:
    topic = chapter_label.strip()
    if ncert_class:
        topic = f"Class {ncert_class} {subject}: {chapter_label}".strip()
    return topic


async def generate_questions_from_ncert(
    *,
    chapter_label: str,
    subject: str,
    kb_name: str | None = None,
    pdf_url: str | None = None,
    count: int = 5,
    ncert_class: str | None = None,
    section_type: str | None = None,
) -> dict[str, Any]:
    """
    Run NCERT-grounded question generation. Difficulty is fixed internally (no UI).
    """
    count = max(1, min(count, MAX_NCERT_QUIZ_GENERATE_QUESTIONS))
    # Resolve KB name: prefer per-class-subject, fall back to per-class
    if not kb_name:
        n = (ncert_class or "").replace("class-", "").strip()
        subj_slug = subject.lower().replace(" ", "-") if subject else ""
        if n and subj_slug:
            kb_name = f"ncert-class-{n}-{subj_slug}"
        elif n:
            kb_name = f"ncert-class-{n}"
        else:
            kb_name = "ncert-class-8"
    coordinator = build_ncert_coordinator(kb_name=kb_name)

    topic = topic_label(
        chapter_label=chapter_label,
        subject=subject,
        ncert_class=ncert_class,
    )

    requirement = generation_requirement_for_section(
        topic=topic,
        section_type=section_type,
    )

    batch = await coordinator.generate_questions_custom(
        requirement=requirement,
        num_questions=count,
        pdf_url=pdf_url or None,
        skip_relevance=True,  # LMS fast path: one LLM call per question (no relevance analyzer)
    )

    if not batch.get("results"):
        return {
            "success": False,
            "error": batch.get("error") or batch.get("message") or "generation_failed",
            "questions": [],
        }

    questions = map_batch_to_lms_questions(batch, section_type=section_type)
    failed = int(batch.get("failed") or 0)
    return {
        "success": len(questions) > 0,
        "questions": questions,
        "requested": count,
        "completed": len(questions),
        "failed": failed,
        "duration_secs": batch.get("duration_secs"),
        "stage_times": batch.get("stage_times"),
        "search_queries": batch.get("search_queries", []),
        "error": (
            f"{failed} question(s) could not be generated"
            if failed and len(questions) > 0
            else None
        ),
    }


def new_question_id() -> str:
    return f"q-{uuid.uuid4().hex[:8]}"
