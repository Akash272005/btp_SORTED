"""Shared NCERT question requirement builders for quiz and paper generation."""

from __future__ import annotations

from typing import Any


def generation_requirement_for_section(
    *,
    topic: str,
    section_type: str | None,
) -> dict[str, Any]:
    st = (section_type or "mcq").strip().lower()
    if st == "mcq":
        return {
            "knowledge_point": topic,
            "difficulty": "medium",
            "question_type": "choice",
            "additional_requirements": (
                "Generate clear CBSE-style multiple choice questions grounded in the "
                "selected NCERT chapter. Each question must have exactly four options "
                "and one correct answer."
            ),
        }
    if st == "long":
        return {
            "knowledge_point": topic,
            "difficulty": "medium",
            "question_type": "written",
            "additional_requirements": (
                "Generate CBSE-style long answer questions from the NCERT chapter. "
                "Each question should require detailed explanation (about 5 marks). "
                "Do not include MCQ options."
            ),
        }
    return {
        "knowledge_point": topic,
        "difficulty": "medium",
        "question_type": "written",
        "additional_requirements": (
            "Generate CBSE-style short answer questions from the NCERT chapter. "
            "Each question should be answerable in 2-4 sentences (about 3 marks). "
            "Do not include MCQ options."
        ),
    }


def mixed_paper_requirement(
    *,
    topic: str,
    slot_specs: list[dict[str, Any]],
) -> dict[str, Any]:
    """One research/plan pass for an entire paper (multiple section types)."""
    parts: list[str] = []
    qn = 1
    for spec in slot_specs:
        sid = str(spec.get("section_id", "A"))
        st = str(spec.get("section_type", "mcq")).lower()
        cnt = int(spec.get("count") or 0)
        if cnt <= 0:
            continue
        label = st.upper()
        qtype = "multiple choice (four options)" if st == "mcq" else (
            "long written" if st == "long" else "short written"
        )
        end = qn + cnt - 1
        parts.append(
            f"Questions {qn}-{end}: Section {sid} — {cnt} {qtype} question(s) ({label})."
        )
        qn += cnt

    return {
        "knowledge_point": topic,
        "difficulty": "medium",
        "question_type": "mixed",
        "slot_specs": slot_specs,
        "additional_requirements": (
            "Generate a balanced CBSE-style question paper from the NCERT chapter. "
            "Follow this exact structure:\n"
            + "\n".join(parts)
            + "\nEnsure each question tests a distinct concept. "
            "MCQs must have exactly four options and one correct answer. "
            "Written questions must not include MCQ options."
        ),
    }


def slot_spec_at_index(slot_specs: list[dict[str, Any]], index: int) -> dict[str, Any]:
    i = 0
    for spec in slot_specs:
        cnt = int(spec.get("count") or 0)
        if index < i + cnt:
            return spec
        i += cnt
    return slot_specs[-1] if slot_specs else {"section_id": "A", "section_type": "mcq", "count": 1}


def agent_focus_type_for_section(section_type: str | None) -> str:
    st = (section_type or "mcq").strip().lower()
    return "choice" if st == "mcq" else "written"


def fallback_focuses_for_slots(
    topic: str,
    slot_specs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    focuses: list[dict[str, Any]] = []
    qn = 0
    for spec in slot_specs:
        sid = str(spec.get("section_id", "A"))
        st = str(spec.get("section_type", "mcq")).lower()
        cnt = int(spec.get("count") or 0)
        agent_type = agent_focus_type_for_section(st)
        for j in range(cnt):
            qn += 1
            focuses.append(
                {
                    "id": f"q_{qn}",
                    "focus": (
                        f"Section {sid} ({st.upper()}) — distinct NCERT concept "
                        f"({j + 1} of {cnt})"
                    ),
                    "type": agent_type,
                    "section_id": sid,
                    "section_type": st,
                }
            )
    return focuses
