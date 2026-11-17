"""Teacher academic exam calendar API."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from src.lms.auth.dependencies import require_roles
from src.lms.db import get_db
from src.lms.models import (
    ExamCalendar,
    ExamCalendarSlot,
    ExamCalendarSlotChapter,
    User,
)
from src.lms.schemas import (
    ExamCalendarCopyIn,
    ExamCalendarCreateIn,
    ExamCalendarOut,
    ExamCalendarPatchIn,
    ExamCalendarPublishOut,
    ExamCalendarSlotChapterOut,
    ExamCalendarSlotLinkAssignmentIn,
    ExamCalendarSlotLinkPaperIn,
    ExamCalendarSlotOut,
    ExamCalendarSlotsPutIn,
    ExamCalendarSummaryOut,
    ExamCalendarUpcomingOut,
    ExamCalendarUpcomingSlotOut,
)
from src.lms.services.exam_calendar import (
    calendar_owned_by,
    clone_calendar_as_draft,
    compute_chapter_overlaps,
    current_academic_year,
    find_published_conflict,
    load_chapters_by_slot,
    load_distribution_ids_by_paper,
    new_calendar_id,
    new_slot_id,
    seed_slots_for_calendar,
)

router = APIRouter(prefix="/api/teacher/exam-calendars", tags=["lms-teacher-exam-calendar"])


def _chapter_out(row: ExamCalendarSlotChapter) -> ExamCalendarSlotChapterOut:
    return ExamCalendarSlotChapterOut(
        id=row.id,
        chapter_key=row.chapter_key,
        chapter_label=row.chapter_label,
        ncert_class=row.ncert_class,
        pdf_url=row.pdf_url,
    )


def _slot_out(
    slot: ExamCalendarSlot,
    chapters: list[ExamCalendarSlotChapter],
) -> ExamCalendarSlotOut:
    return ExamCalendarSlotOut(
        id=slot.id,
        sort_order=slot.sort_order,
        slot_type=slot.slot_type,
        title=slot.title,
        exam_date=slot.exam_date,
        marks=slot.marks,
        duration_mins=slot.duration_mins,
        instructions=slot.instructions,
        linked_paper_id=slot.linked_paper_id,
        linked_assignment_id=slot.linked_assignment_id,
        chapters=[_chapter_out(c) for c in chapters],
    )


def _calendar_out(
    db: Session,
    calendar: ExamCalendar,
    *,
    include_warnings: bool = True,
) -> ExamCalendarOut:
    slots = (
        db.query(ExamCalendarSlot)
        .filter(ExamCalendarSlot.calendar_id == calendar.id)
        .order_by(ExamCalendarSlot.sort_order.asc())
        .all()
    )
    chapters_by_slot = load_chapters_by_slot(db, [s.id for s in slots])
    warnings: list[str] = []
    if include_warnings:
        warnings = compute_chapter_overlaps(slots, chapters_by_slot)
    return ExamCalendarOut(
        id=calendar.id,
        class_id=calendar.class_id,
        subject=calendar.subject,
        academic_year=calendar.academic_year,
        template_id=calendar.template_id,
        status=calendar.status,
        slots=[
            _slot_out(s, chapters_by_slot.get(s.id, []))
            for s in slots
        ],
        overlap_warnings=warnings,
        published_at=calendar.published_at,
        created_at=calendar.created_at,
        updated_at=calendar.updated_at,
    )


def _get_calendar_or_404(db: Session, calendar_id: str) -> ExamCalendar:
    row = db.query(ExamCalendar).filter(ExamCalendar.id == calendar_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Exam calendar not found")
    return row


@router.post("", response_model=ExamCalendarOut)
def create_exam_calendar(
    body: ExamCalendarCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    if body.template_id not in ("standard_6", "unit_5", "custom"):
        raise HTTPException(status_code=400, detail="Invalid template_id")
    year = (body.academic_year or current_academic_year()).strip()
    calendar = ExamCalendar(
        id=new_calendar_id(),
        teacher_id=user.id,
        class_id=body.class_id.strip(),
        subject=body.subject.strip(),
        academic_year=year,
        template_id=body.template_id,
        status="draft",
    )
    db.add(calendar)
    db.flush()
    seed_slots_for_calendar(db, calendar, body.template_id)
    db.commit()
    db.refresh(calendar)
    return _calendar_out(db, calendar)


@router.get("", response_model=list[ExamCalendarSummaryOut])
def list_exam_calendars(
    class_id: str | None = Query(None),
    subject: str | None = Query(None),
    academic_year: str | None = Query(None),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    q = db.query(ExamCalendar)
    if user.role != "admin":
        q = q.filter(ExamCalendar.teacher_id == user.id)
    if class_id:
        q = q.filter(ExamCalendar.class_id == class_id)
    if subject:
        q = q.filter(ExamCalendar.subject == subject)
    if academic_year:
        q = q.filter(ExamCalendar.academic_year == academic_year)
    rows = q.order_by(ExamCalendar.updated_at.desc()).all()
    out: list[ExamCalendarSummaryOut] = []
    for row in rows:
        slot_count = (
            db.query(ExamCalendarSlot)
            .filter(ExamCalendarSlot.calendar_id == row.id)
            .count()
        )
        out.append(
            ExamCalendarSummaryOut(
                id=row.id,
                class_id=row.class_id,
                subject=row.subject,
                academic_year=row.academic_year,
                template_id=row.template_id,
                status=row.status,
                slot_count=slot_count,
                published_at=row.published_at,
                updated_at=row.updated_at,
            )
        )
    return out


@router.get("/upcoming", response_model=ExamCalendarUpcomingOut)
def upcoming_exam_slots(
    class_id: str = Query(...),
    subject: str | None = Query(None),
    limit: int = Query(6, ge=1, le=20),
    scope: str = Query("published"),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    if scope not in ("upcoming", "published"):
        raise HTTPException(status_code=400, detail="scope must be upcoming or published")

    q = db.query(ExamCalendar).filter(
        ExamCalendar.class_id == class_id,
        ExamCalendar.status == "published",
    )
    if user.role != "admin":
        q = q.filter(ExamCalendar.teacher_id == user.id)
    if subject:
        q = q.filter(ExamCalendar.subject == subject)
    calendars = q.all()
    now = datetime.utcnow()
    all_paper_ids: list[int] = []
    for cal in calendars:
        for s in (
            db.query(ExamCalendarSlot)
            .filter(ExamCalendarSlot.calendar_id == cal.id)
            .all()
        ):
            if s.linked_paper_id:
                all_paper_ids.append(s.linked_paper_id)
    distribution_by_paper = load_distribution_ids_by_paper(
        db, class_id, list(set(all_paper_ids))
    )
    rows: list[tuple[tuple[int, datetime, int], ExamCalendarUpcomingSlotOut]] = []
    for cal in calendars:
        slots = (
            db.query(ExamCalendarSlot)
            .filter(ExamCalendarSlot.calendar_id == cal.id)
            .order_by(ExamCalendarSlot.sort_order.asc())
            .all()
        )
        if scope == "upcoming":
            slots = [
                s
                for s in slots
                if s.exam_date is not None and s.exam_date >= now
            ]
        chapters_by_slot = load_chapters_by_slot(db, [s.id for s in slots])
        for slot in slots:
            chs = chapters_by_slot.get(slot.id, [])
            if chs:
                summary = ", ".join(c.chapter_label for c in chs[:2])
                if len(chs) > 2:
                    summary += f" +{len(chs) - 2} more"
            else:
                summary = "Chapters TBD"
            sort_date = slot.exam_date or datetime.max
            rows.append(
                (
                    (0 if slot.exam_date else 1, sort_date, slot.sort_order),
                    ExamCalendarUpcomingSlotOut(
                        calendar_id=cal.id,
                        slot_id=slot.id,
                        title=slot.title,
                        subject=cal.subject,
                        exam_date=slot.exam_date,
                        chapter_summary=summary,
                        slot_type=slot.slot_type,
                        linked_paper_id=slot.linked_paper_id,
                        linked_distribution_id=(
                            distribution_by_paper.get(slot.linked_paper_id)
                            if slot.linked_paper_id
                            else None
                        ),
                    ),
                )
            )
    rows.sort(key=lambda x: x[0])
    return ExamCalendarUpcomingOut(slots=[item[1] for item in rows[:limit]])


@router.get("/{calendar_id}", response_model=ExamCalendarOut)
def get_exam_calendar(
    calendar_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    calendar = _get_calendar_or_404(db, calendar_id)
    if not calendar_owned_by(calendar, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    return _calendar_out(db, calendar)


@router.patch("/{calendar_id}", response_model=ExamCalendarOut)
def patch_exam_calendar(
    calendar_id: str,
    body: ExamCalendarPatchIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    calendar = _get_calendar_or_404(db, calendar_id)
    if not calendar_owned_by(calendar, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    if calendar.status == "published":
        raise HTTPException(status_code=400, detail="Published calendars cannot be edited")
    if body.class_id is not None:
        calendar.class_id = body.class_id.strip()
    if body.subject is not None:
        calendar.subject = body.subject.strip()
    if body.academic_year is not None:
        calendar.academic_year = body.academic_year.strip()
    if body.template_id is not None:
        if body.template_id not in ("standard_6", "unit_5", "custom"):
            raise HTTPException(status_code=400, detail="Invalid template_id")
        if body.template_id != calendar.template_id:
            old_slot_ids = [
                r[0]
                for r in db.query(ExamCalendarSlot.id)
                .filter(ExamCalendarSlot.calendar_id == calendar.id)
                .all()
            ]
            if old_slot_ids:
                db.query(ExamCalendarSlotChapter).filter(
                    ExamCalendarSlotChapter.slot_id.in_(old_slot_ids)
                ).delete(synchronize_session=False)
            db.query(ExamCalendarSlot).filter(
                ExamCalendarSlot.calendar_id == calendar.id
            ).delete(synchronize_session=False)
            calendar.template_id = body.template_id
            seed_slots_for_calendar(db, calendar, body.template_id)
    calendar.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(calendar)
    return _calendar_out(db, calendar)


@router.put("/{calendar_id}/slots", response_model=ExamCalendarOut)
def put_exam_calendar_slots(
    calendar_id: str,
    body: ExamCalendarSlotsPutIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    calendar = _get_calendar_or_404(db, calendar_id)
    if not calendar_owned_by(calendar, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    existing_slots = (
        db.query(ExamCalendarSlot)
        .filter(ExamCalendarSlot.calendar_id == calendar.id)
        .all()
    )
    existing_ids = {s.id for s in existing_slots}
    incoming_ids = {s.id for s in body.slots if s.id}

    for slot_id in existing_ids - incoming_ids:
        db.query(ExamCalendarSlotChapter).filter(
            ExamCalendarSlotChapter.slot_id == slot_id
        ).delete(synchronize_session=False)
        db.query(ExamCalendarSlot).filter(ExamCalendarSlot.id == slot_id).delete(
            synchronize_session=False
        )

    for item in body.slots:
        slot_id = item.id if item.id and item.id in existing_ids else new_slot_id()
        row = (
            db.query(ExamCalendarSlot)
            .filter(
                ExamCalendarSlot.id == slot_id,
                ExamCalendarSlot.calendar_id == calendar.id,
            )
            .first()
        )
        if not row:
            row = ExamCalendarSlot(id=slot_id, calendar_id=calendar.id)
            db.add(row)
        row.sort_order = item.sort_order
        row.slot_type = item.slot_type
        row.title = item.title.strip()
        row.exam_date = item.exam_date
        row.marks = item.marks
        row.duration_mins = item.duration_mins
        row.instructions = item.instructions
        db.flush()
        db.query(ExamCalendarSlotChapter).filter(
            ExamCalendarSlotChapter.slot_id == row.id
        ).delete(synchronize_session=False)
        for ch in item.chapters:
            db.add(
                ExamCalendarSlotChapter(
                    slot_id=row.id,
                    chapter_key=ch.chapter_key.strip(),
                    chapter_label=ch.chapter_label.strip(),
                    ncert_class=ch.ncert_class,
                    pdf_url=ch.pdf_url,
                )
            )

    calendar.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(calendar)
    return _calendar_out(db, calendar)


@router.patch(
    "/{calendar_id}/slots/{slot_id}/link-paper",
    response_model=ExamCalendarOut,
)
def link_exam_calendar_slot_paper(
    calendar_id: str,
    slot_id: str,
    body: ExamCalendarSlotLinkPaperIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    calendar = _get_calendar_or_404(db, calendar_id)
    if not calendar_owned_by(calendar, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    slot = (
        db.query(ExamCalendarSlot)
        .filter(
            ExamCalendarSlot.id == slot_id,
            ExamCalendarSlot.calendar_id == calendar.id,
        )
        .first()
    )
    if not slot:
        raise HTTPException(status_code=404, detail="Exam slot not found")
    slot.linked_paper_id = body.paper_id
    calendar.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(calendar)
    return _calendar_out(db, calendar)


def _calendar_to_ics(calendar: ExamCalendar, slots: list[ExamCalendarSlot]) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Vidyasetu//Exam Calendar//EN",
        "CALSCALE:GREGORIAN",
    ]
    for slot in slots:
        if not slot.exam_date:
            continue
        dt = slot.exam_date.strftime("%Y%m%dT%H%M%SZ")
        uid = f"{slot.id}@vidyasetu-exam"
        title = slot.title.replace(",", "\\,")
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{uid}",
                f"DTSTAMP:{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}",
                f"DTSTART:{dt}",
                f"SUMMARY:{title} ({calendar.subject})",
                f"DESCRIPTION:{calendar.class_id} {calendar.academic_year}",
                "END:VEVENT",
            ]
        )
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


@router.post("/{calendar_id}/unpublish", response_model=ExamCalendarOut)
def unpublish_exam_calendar(
    calendar_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    calendar = _get_calendar_or_404(db, calendar_id)
    if not calendar_owned_by(calendar, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    if calendar.status != "published":
        raise HTTPException(status_code=400, detail="Only published calendars can be unpublished")
    calendar.status = "draft"
    calendar.published_at = None
    calendar.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(calendar)
    return _calendar_out(db, calendar)


@router.post("/{calendar_id}/duplicate", response_model=ExamCalendarOut)
def duplicate_exam_calendar(
    calendar_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    calendar = _get_calendar_or_404(db, calendar_id)
    if not calendar_owned_by(calendar, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    new_cal = clone_calendar_as_draft(
        db,
        calendar,
        teacher_id=user.id,
        clear_links=True,
    )
    new_cal.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(new_cal)
    return _calendar_out(db, new_cal)


@router.post("/{calendar_id}/copy", response_model=ExamCalendarOut)
def copy_exam_calendar(
    calendar_id: str,
    body: ExamCalendarCopyIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    calendar = _get_calendar_or_404(db, calendar_id)
    if not calendar_owned_by(calendar, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    target_class = (body.class_id or calendar.class_id).strip()
    target_year = (body.academic_year or calendar.academic_year).strip()
    target_subject = (body.subject or calendar.subject).strip()
    conflict = find_published_conflict(
        db,
        class_id=target_class,
        subject=target_subject,
        academic_year=target_year,
    )
    if conflict:
        raise HTTPException(
            status_code=400,
            detail=f"A published calendar already exists for {target_subject} ({target_year}).",
        )
    new_cal = clone_calendar_as_draft(
        db,
        calendar,
        teacher_id=user.id,
        class_id=target_class,
        subject=target_subject,
        academic_year=target_year,
        clear_links=True,
    )
    new_cal.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(new_cal)
    return _calendar_out(db, new_cal)


@router.get("/{calendar_id}/export.ics")
def export_exam_calendar_ics(
    calendar_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    calendar = _get_calendar_or_404(db, calendar_id)
    if not calendar_owned_by(calendar, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    slots = (
        db.query(ExamCalendarSlot)
        .filter(ExamCalendarSlot.calendar_id == calendar.id)
        .order_by(ExamCalendarSlot.sort_order.asc())
        .all()
    )
    body = _calendar_to_ics(calendar, slots)
    filename = f"exam-calendar-{calendar.class_id}-{calendar.subject}.ics"
    return Response(
        content=body,
        media_type="text/calendar",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.patch(
    "/{calendar_id}/slots/{slot_id}/link-assignment",
    response_model=ExamCalendarOut,
)
def link_exam_calendar_slot_assignment(
    calendar_id: str,
    slot_id: str,
    body: ExamCalendarSlotLinkAssignmentIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    calendar = _get_calendar_or_404(db, calendar_id)
    if not calendar_owned_by(calendar, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    slot = (
        db.query(ExamCalendarSlot)
        .filter(
            ExamCalendarSlot.id == slot_id,
            ExamCalendarSlot.calendar_id == calendar.id,
        )
        .first()
    )
    if not slot:
        raise HTTPException(status_code=404, detail="Exam slot not found")
    slot.linked_assignment_id = body.assignment_id.strip()
    calendar.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(calendar)
    return _calendar_out(db, calendar)


@router.post("/{calendar_id}/publish", response_model=ExamCalendarPublishOut)
def publish_exam_calendar(
    calendar_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    calendar = _get_calendar_or_404(db, calendar_id)
    if not calendar_owned_by(calendar, user):
        raise HTTPException(status_code=403, detail="Not allowed")
    if calendar.status == "published":
        calendar.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(calendar)
        return ExamCalendarPublishOut(
            ok=True,
            calendar=_calendar_out(db, calendar, include_warnings=False),
        )

    conflict = find_published_conflict(
        db,
        class_id=calendar.class_id,
        subject=calendar.subject,
        academic_year=calendar.academic_year,
        exclude_calendar_id=calendar.id,
    )
    if conflict:
        return ExamCalendarPublishOut(
            ok=False,
            errors=[
                f"A published calendar already exists for {calendar.subject} "
                f"({calendar.academic_year})."
            ],
        )

    calendar.status = "published"
    calendar.published_at = datetime.utcnow()
    calendar.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(calendar)
    return ExamCalendarPublishOut(
        ok=True,
        calendar=_calendar_out(db, calendar, include_warnings=False),
    )
