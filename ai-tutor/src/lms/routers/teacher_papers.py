"""Teacher question paper routes (Phase 1-2)."""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from src.lms.auth.dependencies import require_roles
from src.lms.db import get_db
from src.lms.models import (
    PaperDistribution,
    PaperPracticeAttempt,
    PaperStudentEvent,
    PaperWrittenSubmission,
    QuestionPaper,
    User,
)
from src.lms.schemas import (
    GeneratePaperFromNcertIn,
    GeneratePaperFromNcertOut,
    PaperCreateIn,
    PaperDeleteOut,
    PaperDistributionCreateIn,
    PaperDistributionDetailOut,
    PaperDistributionOut,
    PaperDistributionStudentRowOut,
    PaperDistributionSummaryOut,
    PaperOut,
    PaperUpdateIn,
    TeacherExamGradeIn,
    TeacherPracticeAttemptDetailOut,
    TeacherWrittenSubmissionDetailOut,
)
from src.lms.services.ncert_paper_generate import generate_paper_questions_from_ncert
from src.lms.services.paper_exam_flow import apply_teacher_grades
from src.lms.services.paper_pdf_export import (
    count_filled_questions,
    paper_publish_validation_error,
    ensure_answer_key_pdf,
    ensure_question_paper_pdf,
)
from src.lms.services.paper_dashboard import distribution_pending_grade_count
from src.lms.services.paper_flow import (
    build_practice_attempt_review_items,
    delete_paper_distribution_data,
    delete_teacher_paper_cascade,
)
from src.lms.services.paper_tracking import (
    build_distribution_summary,
    distribution_mode,
    distribution_mode_label,
    student_row_progress,
)
from src.lms.services.quiz_flow import invalidate_class_student_dashboards
from src.lms.services.paper_written_submission import (
    apply_teacher_written_grades,
    build_manual_grading_template,
)
from src.lms.services.quiz_flow import due_label

router = APIRouter(prefix="/api/teacher", tags=["lms-teacher-papers"])


def _presets_path() -> Path:
    return Path(__file__).resolve().parent.parent / "data" / "paper_blueprint_presets.json"


def _load_blueprint_presets() -> dict:
    p = _presets_path()
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _new_distribution_id() -> str:
    return f"pdist-{uuid.uuid4().hex[:12]}"


def _distribution_out(
    d: PaperDistribution, *, pending_grade_count: int = 0
) -> PaperDistributionOut:
    return PaperDistributionOut(
        id=d.id,
        paper_id=d.paper_id,
        teacher_id=d.teacher_id,
        class_id=d.class_id,
        title=d.title,
        due_at=d.due_at,
        instructions=d.instructions,
        allow_download=bool(d.allow_download),
        allow_online_practice=bool(d.allow_online_practice),
        allow_online_exam=bool(getattr(d, "allow_online_exam", False)),
        allow_written_submission=bool(getattr(d, "allow_written_submission", False)),
        created_at=d.created_at,
        due_label=due_label(d.due_at),
        pending_grade_count=pending_grade_count,
    )


def _as_utc_naive(dt: datetime) -> datetime:
    """Store UTC wall time as naive datetime (matches datetime.utcnow() elsewhere)."""
    if dt.tzinfo is None:
        return dt
    return dt.astimezone(timezone.utc).replace(tzinfo=None)


def _collect_answer_key(paper: QuestionPaper) -> list[dict]:
    out: list[dict] = []
    if not isinstance(paper.sections, dict):
        return out
    for sec in paper.sections.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        sec_id = str(sec.get("id", ""))
        sec_type = str(sec.get("type", ""))
        for q in sec.get("questions") or []:
            if not isinstance(q, dict):
                continue
            text = str(q.get("text") or "").strip()
            if not text:
                continue
            answer = q.get("correct_answer")
            if answer is None:
                answer = q.get("model_answer")
            out.append(
                {
                    "section_id": sec_id,
                    "section_title": sec.get("title"),
                    "type": str(q.get("type") or sec_type or "short"),
                    "question_id": q.get("id"),
                    "question": text,
                    "options": q.get("options"),
                    "correct_answer": answer,
                    "marks": q.get("marks", 1),
                }
            )
    return out


@router.get("/papers/blueprint-presets")
def list_blueprint_presets(
    user: User = Depends(require_roles("teacher", "admin")),
):
    return _load_blueprint_presets()


@router.get("/papers", response_model=list[PaperOut])
def list_papers(
    status: str | None = Query(default=None),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    q = db.query(QuestionPaper).filter(QuestionPaper.teacher_id == user.id)
    if status in {"draft", "published"}:
        q = q.filter(QuestionPaper.status == status)
    return q.order_by(QuestionPaper.created_at.desc()).all()


@router.post("/papers", response_model=PaperOut)
def create_paper(
    body: PaperCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    paper = QuestionPaper(
        teacher_id=user.id,
        title=body.title.strip(),
        subject=body.subject.strip(),
        board=body.board.strip() or "CBSE",
        exam_type=body.exam_type,
        ncert_class=body.ncert_class,
        chapter_scope=body.chapter_scope,
        blueprint=body.blueprint,
        sections=body.sections,
        total_marks=body.total_marks,
        duration_mins=body.duration_mins,
        instructions=body.instructions,
        status="draft",
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)
    return paper


@router.get("/papers/{paper_id}", response_model=PaperOut)
def get_paper(
    paper_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    paper = db.get(QuestionPaper, paper_id)
    if not paper or paper.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Paper not found")
    return paper


@router.put("/papers/{paper_id}", response_model=PaperOut)
def update_paper(
    paper_id: int,
    body: PaperUpdateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    paper = db.get(QuestionPaper, paper_id)
    if not paper or paper.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Paper not found")
    data = body.model_dump(exclude_unset=True)
    for key, val in data.items():
        setattr(paper, key, val)
    db.commit()
    db.refresh(paper)
    return paper


@router.delete("/papers/{paper_id}", response_model=PaperDeleteOut)
def delete_paper(
    paper_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """Permanently delete paper and linked student-facing distribution records."""
    paper = db.get(QuestionPaper, paper_id)
    if not paper or paper.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Paper not found")

    stats = delete_teacher_paper_cascade(db, paper, teacher_id=user.id)
    return PaperDeleteOut(
        paper_id=paper_id,
        distributions_removed=int(stats["distributions_removed"]),
        events_removed=int(stats["events_removed"]),
        attempts_removed=int(stats["attempts_removed"]),
        written_removed=int(stats["written_removed"]),
    )


@router.post("/papers/{paper_id}/publish", response_model=PaperOut)
def publish_paper(
    paper_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    paper = db.get(QuestionPaper, paper_id)
    if not paper or paper.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Paper not found")
    publish_err = paper_publish_validation_error(paper)
    if publish_err:
        raise HTTPException(status_code=400, detail=publish_err)
    paper.status = "published"
    if count_filled_questions(paper) > 0:
        url = ensure_question_paper_pdf(paper)
        if url:
            paper.pdf_storage_key = url
    db.commit()
    db.refresh(paper)
    return paper


def _paper_generate_kwargs(body: GeneratePaperFromNcertIn) -> dict:
    return {
        "chapter_label": body.chapter_label.strip(),
        "subject": body.subject.strip(),
        "kb_name": body.resolved_kb_name(),
        "pdf_url": body.pdf_url,
        "count": body.count,
        "ncert_class": body.ncert_class,
        "exam_type": body.exam_type,
        "section_id": body.section_id,
        "section_type": body.section_type,
        "slots": _paper_generate_slot_payload(body),
    }


@router.post("/papers/generate-from-ncert", response_model=GeneratePaperFromNcertOut)
async def generate_paper_from_ncert(
    body: GeneratePaperFromNcertIn,
    user: User = Depends(require_roles("teacher", "admin")),
):
    result = await generate_paper_questions_from_ncert(**_paper_generate_kwargs(body))
    return _paper_generate_out(body, result)


@router.post("/papers/generate-from-ncert/stream")
async def stream_generate_paper_from_ncert(
    body: GeneratePaperFromNcertIn,
    user: User = Depends(require_roles("teacher", "admin")),
):
    """NDJSON stream: progress + question events, then done (same batch pipeline as sync)."""
    queue: asyncio.Queue[dict] = asyncio.Queue()
    gen_kwargs = _paper_generate_kwargs(body)

    async def on_event(event: dict) -> None:
        await queue.put(event)

    async def run_generation() -> None:
        try:
            result = await generate_paper_questions_from_ncert(
                **gen_kwargs,
                on_event=on_event,
            )
            await queue.put(
                {
                    "type": "done",
                    "success": bool(result.get("success")),
                    "requested": result.get("requested", body.count),
                    "completed": result.get("completed", 0),
                    "failed": result.get("failed", 0),
                    "duration_secs": result.get("duration_secs"),
                    "stage_times": result.get("stage_times"),
                    "error": result.get("error"),
                    "questions": result.get("questions") or [],
                }
            )
        except Exception as exc:
            await queue.put({"type": "error", "message": str(exc)})

    async def event_stream():
        task = asyncio.create_task(run_generation())
        try:
            while True:
                item = await queue.get()
                yield json.dumps(item, default=str) + "\n"
                if item.get("type") in ("done", "error"):
                    break
        finally:
            if not task.done():
                task.cancel()
                try:
                    await task
                except asyncio.CancelledError:
                    pass

    return StreamingResponse(
        event_stream(),
        media_type="application/x-ndjson",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _paper_generate_slot_payload(body: GeneratePaperFromNcertIn) -> list[dict] | None:
    if not body.slots:
        return None
    return [
        {
            "section_id": s.section_id.strip(),
            "section_type": s.section_type,
            "count": s.count,
        }
        for s in body.slots
    ]


def _paper_generate_out(body: GeneratePaperFromNcertIn, result: dict) -> GeneratePaperFromNcertOut:
    return GeneratePaperFromNcertOut(
        success=bool(result.get("success")),
        questions=result.get("questions") or [],
        requested=result.get("requested", body.count),
        completed=result.get("completed", 0),
        failed=result.get("failed", 0),
        duration_secs=result.get("duration_secs"),
        stage_times=result.get("stage_times"),
        error=result.get("error"),
    )


@router.get("/paper-distributions", response_model=list[PaperDistributionOut])
def list_paper_distributions(
    class_id: str | None = Query(default=None),
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    q = db.query(PaperDistribution).filter(PaperDistribution.teacher_id == user.id)
    if class_id:
        q = q.filter(PaperDistribution.class_id == class_id)
    rows = q.order_by(PaperDistribution.created_at.desc()).all()
    return [
        _distribution_out(
            r, pending_grade_count=distribution_pending_grade_count(db, r.id)
        )
        for r in rows
    ]


@router.post("/paper-distributions", response_model=PaperDistributionOut)
def create_paper_distribution(
    body: PaperDistributionCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    paper = db.get(QuestionPaper, body.paper_id)
    if not paper or paper.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Paper not found")
    if paper.status != "published":
        raise HTTPException(status_code=400, detail="Publish the paper first")
    if count_filled_questions(paper) == 0:
        raise HTTPException(
            status_code=400,
            detail="Add at least one question before distributing.",
        )
    due_at = _as_utc_naive(body.due_at)
    if due_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Due date must be in the future")

    has_mcq = False
    sections = (
        (paper.sections or {}).get("sections", [])
        if isinstance(paper.sections, dict)
        else []
    )
    for sec in sections:
        if not isinstance(sec, dict):
            continue
        for q in sec.get("questions") or []:
            if isinstance(q, dict) and str(q.get("type", "")).lower() == "mcq":
                has_mcq = True
                break
        if has_mcq:
            break

    allow_online = bool(body.allow_online_practice and has_mcq)
    if paper.exam_type == "mcq_only" and has_mcq:
        allow_online = True

    filled_count = 0
    for sec in sections:
        if not isinstance(sec, dict):
            continue
        for q in sec.get("questions") or []:
            if isinstance(q, dict) and str(q.get("text") or "").strip():
                filled_count += 1
    allow_exam = bool(body.allow_online_exam and filled_count > 0)
    allow_written = bool(body.allow_written_submission and filled_count > 0)
    if allow_exam and allow_written:
        allow_written = False

    row = PaperDistribution(
        id=_new_distribution_id(),
        paper_id=paper.id,
        teacher_id=user.id,
        class_id=body.class_id,
        title=(body.title or paper.title).strip(),
        due_at=due_at,
        instructions=body.instructions,
        allow_download=bool(body.allow_download),
        allow_online_practice=allow_online,
        allow_online_exam=allow_exam,
        allow_written_submission=allow_written,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _distribution_out(row)


@router.get(
    "/paper-distributions/{distribution_id}",
    response_model=PaperDistributionDetailOut,
)
def get_paper_distribution_detail(
    distribution_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    row = db.get(PaperDistribution, distribution_id)
    if not row or row.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Distribution not found")

    students = (
        db.query(User)
        .filter(User.role == "student", User.class_id == row.class_id)
        .order_by(User.full_name)
        .all()
    )
    events = (
        db.query(PaperStudentEvent)
        .filter(PaperStudentEvent.distribution_id == row.id)
        .order_by(PaperStudentEvent.created_at.asc())
        .all()
    )
    by_student: dict[int, dict] = {
        s.id: {
            "viewed": False,
            "downloaded": False,
            "practice_started": False,
            "practice_submitted": False,
            "exam_submitted": False,
            "written_submitted": False,
            "written_submission_id": None,
            "attempt_id": None,
            "practice_attempt_id": None,
            "ai_score": None,
            "teacher_score": None,
            "grading_status": None,
            "score": None,
            "max_score": None,
            "last_event_at": None,
        }
        for s in students
    }
    for ev in events:
        item = by_student.get(ev.student_id)
        if item is None:
            continue
        if ev.event_type == "viewed":
            item["viewed"] = True
        elif ev.event_type == "downloaded":
            item["downloaded"] = True
        elif ev.event_type == "practice_started":
            item["practice_started"] = True
        elif ev.event_type == "practice_submitted":
            item["practice_submitted"] = True
            meta = ev.metadata_json or {}
            if isinstance(meta, dict) and not item.get("exam_submitted"):
                score = meta.get("score")
                max_score = meta.get("max_score")
                try:
                    item["score"] = float(score) if score is not None else item["score"]
                except Exception:
                    pass
                try:
                    item["max_score"] = (
                        float(max_score) if max_score is not None else item["max_score"]
                    )
                except Exception:
                    pass
        elif ev.event_type == "exam_submitted":
            item["exam_submitted"] = True
        elif ev.event_type == "written_submitted":
            item["written_submitted"] = True
        item["last_event_at"] = ev.created_at

    exam_attempts = (
        db.query(PaperPracticeAttempt)
        .filter(
            PaperPracticeAttempt.distribution_id == row.id,
            PaperPracticeAttempt.attempt_type == "online_exam",
            PaperPracticeAttempt.status == "submitted",
        )
        .order_by(PaperPracticeAttempt.submitted_at.desc())
        .all()
    )
    seen_exam: set[int] = set()
    for att in exam_attempts:
        if att.student_id in seen_exam:
            continue
        seen_exam.add(att.student_id)
        item = by_student.get(att.student_id)
        if item is None:
            continue
        item["exam_submitted"] = True
        item["attempt_id"] = att.id
        item["ai_score"] = att.ai_score
        item["teacher_score"] = att.teacher_score
        item["max_score"] = att.max_score
        item["grading_status"] = att.grading_status
        if att.grading_status == "teacher_finalized" and att.teacher_score is not None:
            item["score"] = att.teacher_score
        elif att.ai_score is not None:
            item["score"] = att.ai_score

    practice_attempts = (
        db.query(PaperPracticeAttempt)
        .filter(
            PaperPracticeAttempt.distribution_id == row.id,
            PaperPracticeAttempt.attempt_type == "mcq_practice",
            PaperPracticeAttempt.status == "submitted",
        )
        .order_by(PaperPracticeAttempt.submitted_at.desc())
        .all()
    )
    seen_practice: set[int] = set()
    for att in practice_attempts:
        if att.student_id in seen_practice:
            continue
        seen_practice.add(att.student_id)
        item = by_student.get(att.student_id)
        if item is None:
            continue
        item["practice_attempt_id"] = att.id
        if not item.get("exam_submitted"):
            if att.ai_score is not None:
                item["score"] = att.ai_score
            if att.max_score is not None:
                item["max_score"] = att.max_score

    written_subs = (
        db.query(PaperWrittenSubmission)
        .filter(PaperWrittenSubmission.distribution_id == row.id)
        .order_by(PaperWrittenSubmission.submitted_at.desc())
        .all()
    )
    seen_written: set[int] = set()
    for sub in written_subs:
        if sub.student_id in seen_written:
            continue
        seen_written.add(sub.student_id)
        item = by_student.get(sub.student_id)
        if item is None:
            continue
        item["written_submitted"] = sub.status in (
            "submitted",
            "grading_draft",
            "graded",
        )
        item["written_submission_id"] = sub.id
        item["max_score"] = sub.max_score
        item["grading_status"] = sub.status
        if sub.status == "graded" and sub.teacher_score is not None:
            item["teacher_score"] = sub.teacher_score
            item["score"] = sub.teacher_score
        elif sub.status == "submitted":
            item["score"] = None

    mode = distribution_mode(row)
    student_rows = []
    for s in students:
        item = by_student[s.id]
        progress = student_row_progress(
            mode=mode,
            viewed=bool(item["viewed"]),
            downloaded=bool(item["downloaded"]),
            practice_submitted=bool(item["practice_submitted"]),
            exam_submitted=bool(item["exam_submitted"]),
            written_submitted=bool(item["written_submitted"]),
            grading_status=item.get("grading_status"),
            score=item.get("score"),
        )
        student_rows.append(
            PaperDistributionStudentRowOut(
                student_id=s.id,
                full_name=s.full_name,
                roll_no=s.roll_no,
                viewed=bool(item["viewed"]),
                downloaded=bool(item["downloaded"]),
                practice_started=bool(item["practice_started"]),
                practice_submitted=bool(item["practice_submitted"]),
                exam_submitted=bool(item["exam_submitted"]),
                written_submitted=bool(item["written_submitted"]),
                written_submission_id=item["written_submission_id"],
                attempt_id=item["attempt_id"],
                practice_attempt_id=item["practice_attempt_id"],
                score=item["score"],
                max_score=item["max_score"],
                ai_score=item["ai_score"],
                teacher_score=item["teacher_score"],
                grading_status=item["grading_status"],
                progress_label=progress,
                last_event_at=item["last_event_at"],
            )
        )

    summary_counts = build_distribution_summary(list(by_student.values()), mode)
    summary = PaperDistributionSummaryOut(
        **summary_counts,
        distribution_mode=mode,
        distribution_mode_label=distribution_mode_label(mode),
    )

    return PaperDistributionDetailOut(
        distribution=_distribution_out(row),
        students=student_rows,
        summary=summary,
    )


@router.get("/paper-exam-attempts/{attempt_id}")
def get_paper_exam_attempt(
    attempt_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    attempt = db.get(PaperPracticeAttempt, attempt_id)
    if not attempt or attempt.attempt_type != "online_exam":
        raise HTTPException(status_code=404, detail="Exam attempt not found")
    dist = db.get(PaperDistribution, attempt.distribution_id)
    if not dist or dist.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Distribution not found")
    paper = db.get(QuestionPaper, dist.paper_id)
    student = db.get(User, attempt.student_id)
    grading = attempt.grading_json or {}
    items = list(grading.get("items") or [])
    if paper and items:
        from src.lms.services.paper_exam_flow import extract_filled_exam_questions

        by_qid = {
            str(q.get("id", "")): q for q in extract_filled_exam_questions(paper.sections)
        }
        for item in items:
            if not isinstance(item, dict):
                continue
            q = by_qid.get(str(item.get("question_id", "")))
            if q and not item.get("correct_answer"):
                item["correct_answer"] = q.get("correct_answer")
    return {
        "attempt_id": attempt.id,
        "distribution_id": dist.id,
        "distribution_title": dist.title,
        "student_id": attempt.student_id,
        "student_name": student.full_name if student else "Student",
        "ai_score": attempt.ai_score,
        "teacher_score": attempt.teacher_score,
        "max_score": attempt.max_score,
        "grading_status": attempt.grading_status,
        "submitted_at": attempt.submitted_at,
        "items": items,
    }


@router.get(
    "/paper-practice-attempts/{attempt_id}",
    response_model=TeacherPracticeAttemptDetailOut,
)
def get_paper_practice_attempt(
    attempt_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    attempt = db.get(PaperPracticeAttempt, attempt_id)
    if not attempt or attempt.attempt_type != "mcq_practice":
        raise HTTPException(status_code=404, detail="Practice attempt not found")
    if attempt.status != "submitted":
        raise HTTPException(status_code=400, detail="Practice not submitted yet")
    dist = db.get(PaperDistribution, attempt.distribution_id)
    if not dist or dist.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Distribution not found")
    paper = db.get(QuestionPaper, dist.paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    student = db.get(User, attempt.student_id)
    items = build_practice_attempt_review_items(paper, attempt)
    score = attempt.ai_score
    max_score = attempt.max_score
    pct = (
        round((float(score) / float(max_score)) * 100, 1)
        if score is not None and max_score
        else None
    )
    return TeacherPracticeAttemptDetailOut(
        attempt_id=attempt.id,
        distribution_id=dist.id,
        distribution_title=dist.title,
        student_id=attempt.student_id,
        student_name=student.full_name if student else "Student",
        score=score,
        max_score=max_score,
        percentage=pct,
        submitted_at=attempt.submitted_at,
        items=items,
    )


@router.get(
    "/paper-written-submissions/{submission_id}",
    response_model=TeacherWrittenSubmissionDetailOut,
)
def get_paper_written_submission(
    submission_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    sub = db.get(PaperWrittenSubmission, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Written submission not found")
    dist = db.get(PaperDistribution, sub.distribution_id)
    if not dist or dist.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Distribution not found")
    paper = db.get(QuestionPaper, dist.paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    student = db.get(User, sub.student_id)
    grading = sub.grading_json or {}
    if not grading.get("items") and sub.status in ("submitted", "graded"):
        grading = build_manual_grading_template(paper)
        sub.grading_json = grading
        sub.max_score = grading.get("max_score")
        db.commit()
        db.refresh(sub)
    files = []
    for f in sub.files_json or []:
        if isinstance(f, dict):
            files.append(
                {
                    "url": f.get("url", ""),
                    "filename": f.get("filename", "file"),
                    "uploaded_at": f.get("uploaded_at"),
                }
            )
    return TeacherWrittenSubmissionDetailOut(
        submission_id=sub.id,
        distribution_id=dist.id,
        distribution_title=dist.title,
        student_id=sub.student_id,
        student_name=student.full_name if student else "Student",
        teacher_score=sub.teacher_score,
        max_score=sub.max_score,
        status=sub.status,
        submitted_at=sub.submitted_at,
        graded_at=sub.graded_at,
        files=files,
        items=grading.get("items") or [],
    )


@router.patch("/paper-written-submissions/{submission_id}")
def grade_paper_written_submission(
    submission_id: str,
    body: TeacherExamGradeIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    sub = db.get(PaperWrittenSubmission, submission_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Written submission not found")
    dist = db.get(PaperDistribution, sub.distribution_id)
    if not dist or dist.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Distribution not found")
    if sub.status not in ("submitted", "grading_draft", "graded"):
        raise HTTPException(status_code=400, detail="Student has not submitted yet")

    updates = [u.model_dump() for u in body.items]
    grading, teacher_score, status = apply_teacher_written_grades(
        sub.grading_json,
        updates,
        finalize=bool(body.finalize),
    )
    sub.grading_json = grading
    sub.status = status
    if body.finalize and teacher_score is not None:
        sub.teacher_score = teacher_score
        sub.graded_at = datetime.utcnow()
        _log_event(
            db,
            dist.id,
            sub.student_id,
            "written_graded",
            {"teacher_score": teacher_score, "max_score": sub.max_score},
        )
    db.commit()
    db.refresh(sub)
    pct = (
        round((sub.teacher_score / sub.max_score) * 100, 1)
        if body.finalize and sub.teacher_score is not None and sub.max_score
        else None
    )
    return {
        "submission_id": sub.id,
        "teacher_score": sub.teacher_score,
        "max_score": sub.max_score,
        "status": sub.status,
        "percentage": pct,
        "items": (grading or {}).get("items") or [],
    }


@router.patch("/paper-exam-attempts/{attempt_id}")
def grade_paper_exam_attempt(
    attempt_id: str,
    body: TeacherExamGradeIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    attempt = db.get(PaperPracticeAttempt, attempt_id)
    if not attempt or attempt.attempt_type != "online_exam":
        raise HTTPException(status_code=404, detail="Exam attempt not found")
    dist = db.get(PaperDistribution, attempt.distribution_id)
    if not dist or dist.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Distribution not found")

    updates = [u.model_dump() for u in body.items]
    grading, teacher_score, status = apply_teacher_grades(
        attempt.grading_json,
        updates,
        finalize=bool(body.finalize),
    )
    attempt.grading_json = grading
    attempt.grading_status = status
    if body.finalize and teacher_score is not None:
        attempt.teacher_score = teacher_score
        _log_event(
            db,
            dist.id,
            attempt.student_id,
            "exam_finalized",
            {"teacher_score": teacher_score, "max_score": attempt.max_score},
        )
    db.commit()
    db.refresh(attempt)
    display_score = (
        attempt.teacher_score
        if attempt.grading_status == "teacher_finalized"
        else attempt.ai_score
    )
    pct = (
        round((display_score / attempt.max_score) * 100, 1)
        if display_score is not None and attempt.max_score
        else 0.0
    )
    return {
        "attempt_id": attempt.id,
        "ai_score": attempt.ai_score,
        "teacher_score": attempt.teacher_score,
        "max_score": attempt.max_score,
        "grading_status": attempt.grading_status,
        "percentage": pct,
        "items": (grading or {}).get("items") or [],
    }


def _log_event(
    db: Session,
    distribution_id: str,
    student_id: int,
    event_type: str,
    metadata: dict | None = None,
) -> None:
    db.add(
        PaperStudentEvent(
            distribution_id=distribution_id,
            student_id=student_id,
            event_type=event_type,
            metadata_json=metadata,
        )
    )


@router.delete("/paper-distributions/{distribution_id}")
def delete_paper_distribution(
    distribution_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    row = db.get(PaperDistribution, distribution_id)
    if not row or row.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Distribution not found")
    class_id = row.class_id
    delete_paper_distribution_data(db, [row.id])
    db.commit()
    invalidate_class_student_dashboards(db, class_id)
    return {"deleted": True, "distribution_id": distribution_id}


@router.post("/papers/{paper_id}/pdf/regenerate")
def regenerate_paper_pdf(
    paper_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """Build or refresh the student question paper PDF (questions + marks, no answers)."""
    paper = db.get(QuestionPaper, paper_id)
    if not paper or paper.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Paper not found")
    if count_filled_questions(paper) == 0:
        raise HTTPException(
            status_code=400,
            detail="Add at least one question before generating the question paper PDF.",
        )
    url = ensure_question_paper_pdf(paper)
    if not url:
        raise HTTPException(status_code=500, detail="Question paper PDF generation failed")
    paper.pdf_storage_key = url
    db.commit()
    return {"paper_id": paper_id, "pdf_storage_key": url, "regenerated": True}


@router.post("/papers/{paper_id}/answer-key/pdf")
def regenerate_answer_key_pdf(
    paper_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    """Build teacher answer key PDF (questions + answers)."""
    paper = db.get(QuestionPaper, paper_id)
    if not paper or paper.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Paper not found")
    if count_filled_questions(paper) == 0:
        raise HTTPException(
            status_code=400,
            detail="Add at least one question before generating the answer key PDF.",
        )
    url = ensure_answer_key_pdf(paper)
    if not url:
        raise HTTPException(status_code=500, detail="Answer key PDF generation failed")
    return {"paper_id": paper_id, "pdf_storage_key": url, "regenerated": True}


@router.get("/papers/{paper_id}/answer-key")
def get_paper_answer_key(
    paper_id: int,
    user: User = Depends(require_roles("teacher", "admin")),
    db: Session = Depends(get_db),
):
    paper = db.get(QuestionPaper, paper_id)
    if not paper or paper.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Paper not found")
    return {
        "paper_id": paper.id,
        "title": paper.title,
        "exam_type": paper.exam_type,
        "items": _collect_answer_key(paper),
    }
