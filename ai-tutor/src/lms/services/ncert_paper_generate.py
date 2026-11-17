"""Generate question-paper section questions from NCERT chapter (single-batch fast path)."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from src.lms.constants import MAX_NCERT_QUIZ_GENERATE_QUESTIONS
from src.lms.services.ncert_question_requirements import (
    generation_requirement_for_section,
    mixed_paper_requirement,
    slot_spec_at_index,
)
from src.lms.services.ncert_quiz_generate import (
    build_ncert_coordinator,
    map_agent_question_to_lms,
    topic_label,
)


def _normalize_section_type(section_type: str | None) -> str:
    st = (section_type or "mcq").strip().lower()
    if st in {"mcq", "short", "long"}:
        return st
    return "mcq"


def _paper_question_type_from_exam_type(exam_type: str | None) -> str:
    if exam_type == "mcq_only":
        return "mcq"
    return "mixed"


def _normalize_slot_specs(
    slots: list[dict[str, Any]] | None,
    *,
    section_id: str,
    section_type: str,
    count: int,
) -> list[dict[str, Any]]:
    if slots:
        out: list[dict[str, Any]] = []
        for raw in slots:
            cnt = int(raw.get("count") or 0)
            if cnt <= 0:
                continue
            out.append(
                {
                    "section_id": str(raw.get("section_id") or "A").strip() or "A",
                    "section_type": _normalize_section_type(raw.get("section_type")),
                    "count": cnt,
                }
            )
        return out
    return [
        {
            "section_id": section_id,
            "section_type": _normalize_section_type(section_type),
            "count": max(1, int(count)),
        }
    ]


def _map_batch_results_to_paper_questions(
    batch: dict[str, Any],
    *,
    slot_specs: list[dict[str, Any]],
    chapter_label: str,
    exam_type: str | None,
) -> list[dict[str, Any]]:
    qtype = _paper_question_type_from_exam_type(exam_type)
    per_section_counter: dict[str, int] = {}
    enriched: list[dict[str, Any]] = []

    for idx, item in enumerate(batch.get("results") or []):
        spec = slot_spec_at_index(slot_specs, idx)
        sid = str(spec["section_id"])
        st = str(spec["section_type"])
        per_section_counter[sid] = per_section_counter.get(sid, 0) + 1
        n = per_section_counter[sid]

        raw_q = item.get("question") if isinstance(item, dict) else None
        if not isinstance(raw_q, dict):
            continue

        mapped = map_agent_question_to_lms(raw_q, n, section_type=st)
        mapped["id"] = f"{sid}{n}"
        mapped["section_id"] = sid
        mapped["type"] = st
        mapped["paper_question_type"] = qtype
        mapped["chapter_label"] = chapter_label
        enriched.append(mapped)

    return enriched


def _map_single_coordinator_result(
    item: dict[str, Any],
    *,
    slot_specs: list[dict[str, Any]],
    chapter_label: str,
    exam_type: str | None,
    global_index: int,
) -> dict[str, Any] | None:
    spec = slot_spec_at_index(slot_specs, global_index)
    sid = str(spec["section_id"])
    st = str(spec["section_type"])
    n = sum(
        1
        for i in range(global_index + 1)
        if str(slot_spec_at_index(slot_specs, i)["section_id"]) == sid
    )
    raw_q = item.get("question")
    if not isinstance(raw_q, dict):
        return None

    qtype = _paper_question_type_from_exam_type(exam_type)
    mapped = map_agent_question_to_lms(raw_q, n, section_type=st)
    mapped["id"] = f"{sid}{n}"
    mapped["section_id"] = sid
    mapped["type"] = st
    mapped["paper_question_type"] = qtype
    mapped["chapter_label"] = chapter_label
    return mapped


PaperStreamEvent = dict[str, Any]
OnPaperStreamEvent = Callable[[PaperStreamEvent], Awaitable[None]]


async def generate_paper_questions_from_ncert(
    *,
    chapter_label: str,
    subject: str,
    kb_name: str | None = None,
    pdf_url: str | None = None,
    count: int = 5,
    ncert_class: str | None = None,
    exam_type: str | None = None,
    section_id: str | None = None,
    section_type: str | None = None,
    slots: list[dict[str, Any]] | None = None,
    on_event: OnPaperStreamEvent | None = None,
) -> dict[str, Any]:
    """
    Generate paper questions in one coordinator run (shared research + plan).

    Pass ``slots`` for multi-section fill (fast path). Legacy ``count`` + ``section_id``
  works for single-section calls.
    """
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

    section = (section_id or "A").strip() or "A"
    st = _normalize_section_type(section_type)
    slot_specs = _normalize_slot_specs(
        slots,
        section_id=section,
        section_type=st,
        count=count,
    )
    if not slot_specs:
        return {
            "success": False,
            "error": "no_slots_requested",
            "questions": [],
            "requested": 0,
            "completed": 0,
            "failed": 0,
        }

    requested = sum(int(s["count"]) for s in slot_specs)
    if requested > MAX_NCERT_QUIZ_GENERATE_QUESTIONS:
        return {
            "success": False,
            "error": f"max_{MAX_NCERT_QUIZ_GENERATE_QUESTIONS}_questions_per_batch",
            "questions": [],
            "requested": requested,
            "completed": 0,
            "failed": requested,
        }

    topic = topic_label(
        chapter_label=chapter_label,
        subject=subject,
        ncert_class=ncert_class,
    )

    if len(slot_specs) == 1 and int(slot_specs[0]["count"]) == requested:
        requirement = generation_requirement_for_section(
            topic=topic,
            section_type=slot_specs[0]["section_type"],
        )
    else:
        requirement = mixed_paper_requirement(topic=topic, slot_specs=slot_specs)

    def requirement_for_index(index: int) -> dict[str, Any]:
        spec = slot_spec_at_index(slot_specs, index)
        return generation_requirement_for_section(
            topic=topic,
            section_type=str(spec["section_type"]),
        )

    streamed: list[dict[str, Any]] = []

    async def ws_callback(data: dict[str, Any]) -> None:
        if not on_event:
            return
        kind = data.get("type")
        if kind == "progress":
            prog = data.get("progress") if isinstance(data.get("progress"), dict) else {}
            current = int(prog.get("current") or 0)
            total = int(data.get("total") or prog.get("total") or requested)
            await on_event(
                {
                    "type": "progress",
                    "stage": str(data.get("stage") or ""),
                    "current": current,
                    "total": total,
                }
            )
        elif kind == "result":
            idx = int(data.get("index", len(streamed)))
            mapped = _map_single_coordinator_result(
                data,
                slot_specs=slot_specs,
                chapter_label=chapter_label,
                exam_type=exam_type,
                global_index=idx,
            )
            if not mapped:
                return
            streamed.append(mapped)
            await on_event(
                {
                    "type": "question",
                    "question": mapped,
                    "index": idx,
                    "completed": len(streamed),
                    "requested": requested,
                }
            )

    coordinator = build_ncert_coordinator(kb_name=kb_name)
    if on_event:
        coordinator.set_ws_callback(ws_callback)
    batch = await coordinator.generate_questions_custom(
        requirement=requirement,
        num_questions=requested,
        pdf_url=pdf_url or None,
        skip_relevance=True,
        slot_specs=slot_specs if len(slot_specs) > 1 else None,
        slot_requirement_for_index=requirement_for_index if len(slot_specs) > 1 else None,
    )

    if not batch.get("results"):
        return {
            "success": False,
            "error": batch.get("error") or batch.get("message") or "generation_failed",
            "questions": [],
            "requested": requested,
            "completed": 0,
            "failed": int(batch.get("failed") or requested),
            "duration_secs": batch.get("duration_secs"),
            "stage_times": batch.get("stage_times"),
        }

    enriched = _map_batch_results_to_paper_questions(
        batch,
        slot_specs=slot_specs,
        chapter_label=chapter_label,
        exam_type=exam_type,
    )
    failed = max(int(batch.get("failed") or 0), max(0, requested - len(enriched)))

    return {
        "success": len(enriched) > 0,
        "questions": enriched,
        "requested": requested,
        "completed": len(enriched),
        "failed": failed,
        "duration_secs": batch.get("duration_secs"),
        "stage_times": batch.get("stage_times"),
        "error": (
            f"{failed} question(s) could not be generated"
            if failed and len(enriched) > 0
            else None
        ),
    }
