"""Academic exam calendar helpers."""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime

from sqlalchemy.orm import Session

from src.lms.models import (
    ExamCalendar,
    ExamCalendarSlot,
    ExamCalendarSlotChapter,
    PaperDistribution,
    User,
)
from src.lms.services.exam_calendar_templates import TemplateSlotSeed, template_slots


def new_calendar_id() -> str:
    return f"excal-{uuid.uuid4().hex[:12]}"


def new_slot_id() -> str:
    return f"excslot-{uuid.uuid4().hex[:12]}"


def current_academic_year() -> str:
    now = datetime.utcnow()
    if now.month >= 4:
        start = now.year
        end = now.year + 1
    else:
        start = now.year - 1
        end = now.year
    return f"{start}-{str(end)[-2:]}"


def seed_slots_for_calendar(
    db: Session,
    calendar: ExamCalendar,
    template_id: str,
) -> list[ExamCalendarSlot]:
    rows: list[ExamCalendarSlot] = []
    for seed in template_slots(template_id):
        row = ExamCalendarSlot(
            id=new_slot_id(),
            calendar_id=calendar.id,
            sort_order=seed.sort_order,
            slot_type=seed.slot_type,
            title=seed.title,
            marks=seed.marks,
            duration_mins=seed.duration_mins,
        )
        db.add(row)
        rows.append(row)
    return rows


def calendar_owned_by(calendar: ExamCalendar, user: User) -> bool:
    if user.role == "admin":
        return True
    return calendar.teacher_id == user.id


def find_published_conflict(
    db: Session,
    *,
    class_id: str,
    subject: str,
    academic_year: str,
    exclude_calendar_id: str | None = None,
) -> ExamCalendar | None:
    q = db.query(ExamCalendar).filter(
        ExamCalendar.class_id == class_id,
        ExamCalendar.subject == subject,
        ExamCalendar.academic_year == academic_year,
        ExamCalendar.status == "published",
    )
    if exclude_calendar_id:
        q = q.filter(ExamCalendar.id != exclude_calendar_id)
    return q.first()


def compute_chapter_overlaps(
    slots: list[ExamCalendarSlot],
    chapters_by_slot: dict[str, list[ExamCalendarSlotChapter]],
) -> list[str]:
    """Return human-readable overlap warnings (same chapter in multiple slots)."""
    chapter_to_slots: dict[str, list[str]] = defaultdict(list)
    for slot in slots:
        for ch in chapters_by_slot.get(slot.id, []):
            if not ch.chapter_key:
                continue
            chapter_to_slots[ch.chapter_key].append(slot.title)
    warnings: list[str] = []
    for key, titles in chapter_to_slots.items():
        unique_titles = list(dict.fromkeys(titles))
        if len(unique_titles) > 1:
            label = key
            for slot in slots:
                for ch in chapters_by_slot.get(slot.id, []):
                    if ch.chapter_key == key:
                        label = ch.chapter_label
                        break
            warnings.append(
                f'"{label}" appears in {", ".join(unique_titles)}'
            )
    return warnings


def clone_calendar_as_draft(
    db: Session,
    source: ExamCalendar,
    *,
    teacher_id: int,
    class_id: str | None = None,
    subject: str | None = None,
    academic_year: str | None = None,
    clear_links: bool = True,
) -> ExamCalendar:
    """Duplicate a calendar (any status) as a new draft."""
    new_cal = ExamCalendar(
        id=new_calendar_id(),
        teacher_id=teacher_id,
        class_id=(class_id or source.class_id).strip(),
        subject=(subject or source.subject).strip(),
        academic_year=(academic_year or source.academic_year).strip(),
        template_id=source.template_id,
        status="draft",
    )
    db.add(new_cal)
    db.flush()
    src_slots = (
        db.query(ExamCalendarSlot)
        .filter(ExamCalendarSlot.calendar_id == source.id)
        .order_by(ExamCalendarSlot.sort_order.asc())
        .all()
    )
    chapters_by_slot = load_chapters_by_slot(db, [s.id for s in src_slots])
    for src in src_slots:
        slot_id = new_slot_id()
        row = ExamCalendarSlot(
            id=slot_id,
            calendar_id=new_cal.id,
            sort_order=src.sort_order,
            slot_type=src.slot_type,
            title=src.title,
            exam_date=src.exam_date,
            marks=src.marks,
            duration_mins=src.duration_mins,
            instructions=src.instructions,
            linked_paper_id=None if clear_links else src.linked_paper_id,
            linked_assignment_id=None if clear_links else src.linked_assignment_id,
        )
        db.add(row)
        db.flush()
        for ch in chapters_by_slot.get(src.id, []):
            db.add(
                ExamCalendarSlotChapter(
                    slot_id=slot_id,
                    chapter_key=ch.chapter_key,
                    chapter_label=ch.chapter_label,
                    ncert_class=ch.ncert_class,
                    pdf_url=ch.pdf_url,
                )
            )
    return new_cal


def load_distribution_ids_by_paper(
    db: Session, class_id: str, paper_ids: list[int]
) -> dict[int, str]:
    """Map paper_id → distribution_id for this class (newest distribution wins)."""
    if not paper_ids:
        return {}
    rows = (
        db.query(PaperDistribution)
        .filter(
            PaperDistribution.class_id == class_id,
            PaperDistribution.paper_id.in_(paper_ids),
        )
        .order_by(PaperDistribution.created_at.desc())
        .all()
    )
    out: dict[int, str] = {}
    for row in rows:
        if row.paper_id not in out:
            out[row.paper_id] = row.id
    return out


def load_chapters_by_slot(
    db: Session, slot_ids: list[str]
) -> dict[str, list[ExamCalendarSlotChapter]]:
    if not slot_ids:
        return {}
    rows = (
        db.query(ExamCalendarSlotChapter)
        .filter(ExamCalendarSlotChapter.slot_id.in_(slot_ids))
        .order_by(ExamCalendarSlotChapter.id.asc())
        .all()
    )
    out: dict[str, list[ExamCalendarSlotChapter]] = defaultdict(list)
    for row in rows:
        out[row.slot_id].append(row)
    return dict(out)
