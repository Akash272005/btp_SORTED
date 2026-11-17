"""Default exam slot templates for academic exam calendars."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TemplateSlotSeed:
    sort_order: int
    slot_type: str
    title: str
    marks: int | None
    duration_mins: int | None


STANDARD_6_SLOTS: tuple[TemplateSlotSeed, ...] = (
    TemplateSlotSeed(1, "unit_test", "Unit Test 1", None, None),
    TemplateSlotSeed(2, "unit_test", "Unit Test 2", None, None),
    TemplateSlotSeed(3, "half_yearly", "Half Yearly", None, None),
    TemplateSlotSeed(4, "unit_test", "Unit Test 3", None, None),
    TemplateSlotSeed(5, "unit_test", "Unit Test 4", None, None),
    TemplateSlotSeed(6, "annual", "Final Exam", None, None),
)

UNIT_5_SLOTS: tuple[TemplateSlotSeed, ...] = (
    TemplateSlotSeed(1, "unit_test", "Unit Test 1", None, None),
    TemplateSlotSeed(2, "unit_test", "Unit Test 2", None, None),
    TemplateSlotSeed(3, "unit_test", "Unit Test 3", None, None),
    TemplateSlotSeed(4, "unit_test", "Unit Test 4", None, None),
    TemplateSlotSeed(5, "unit_test", "Unit Test 5", None, None),
    TemplateSlotSeed(6, "annual", "Final Exam", None, None),
)


def template_slots(template_id: str) -> list[TemplateSlotSeed]:
    if template_id == "unit_5":
        return list(UNIT_5_SLOTS)
    if template_id == "custom":
        return []
    return list(STANDARD_6_SLOTS)
