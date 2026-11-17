"""Student question paper routes (Phase 3)."""

from __future__ import annotations

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
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
    PaperExamResultOut,
    PaperExamStartOut,
    PaperExamSubmitIn,
    PaperExamSubmitOut,
    PaperWrittenResultOut,
    PaperWrittenStatusOut,
    PaperWrittenSubmitOut,
    PaperPracticeStartOut,
    PaperPracticeSubmitIn,
    PaperPracticeSubmitOut,
    StudentPaperDetailOut,
    StudentPaperOut,
)
from src.lms.services.paper_exam_flow import (
    exam_time_remaining_seconds,
    extract_filled_exam_questions,
    grade_online_exam_submission,
    strip_exam_questions,
)
from src.lms.services.paper_dashboard import build_student_paper_out_list
from src.lms.services.paper_pdf_export import (
    count_filled_questions,
    ensure_question_paper_pdf,
)
from src.lms.services.paper_tracking import (
    distribution_mode,
    distribution_mode_label,
    paper_list_tab,
    student_list_progress,
)
from src.lms.services.paper_written_submission import (
    MAX_FILES,
    MAX_FILE_BYTES,
    build_manual_grading_template,
    new_submission_id,
    public_url_for_saved_file,
    sanitize_filename,
    submission_storage_dir,
    validate_upload_suffix,
)
from src.lms.services.quiz_flow import due_label

router = APIRouter(prefix="/api/student", tags=["lms-student-papers"])


def _new_attempt_id() -> str:
    return f"patt-{uuid.uuid4().hex[:12]}"


def _get_distribution_for_student(
    db: Session, distribution_id: str, student: User
) -> tuple[PaperDistribution, QuestionPaper]:
    if not student.class_id:
        raise HTTPException(status_code=400, detail="Student has no class assigned")
    d = db.get(PaperDistribution, distribution_id)
    if not d:
        raise HTTPException(status_code=404, detail="Distribution not found")
    if d.class_id != student.class_id:
        raise HTTPException(status_code=403, detail="Paper not for your class")
    paper = db.get(QuestionPaper, d.paper_id)
    if not paper:
        raise HTTPException(status_code=404, detail="Paper not found")
    return d, paper


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


def _extract_mcq_questions(sections: dict | None) -> list[dict]:
    if not isinstance(sections, dict):
        return []
    out: list[dict] = []
    for sec in sections.get("sections") or []:
        if not isinstance(sec, dict):
            continue
        sid = str(sec.get("id", "A"))
        for q in sec.get("questions") or []:
            if not isinstance(q, dict):
                continue
            if str(q.get("type", "")).lower() != "mcq":
                continue
            item = dict(q)
            item["section_id"] = sid
            out.append(item)
    return out


def _strip_correct(questions: list[dict]) -> list[dict]:
    return [{k: v for k, v in q.items() if k != "correct_answer"} for q in questions]


@router.get("/papers", response_model=list[StudentPaperOut])
def list_student_papers(
    status: str | None = Query(None, pattern="^(pending|submitted|overdue|all)$"),
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    return build_student_paper_out_list(db, user, status_filter=status)


@router.get("/papers/{distribution_id}", response_model=StudentPaperDetailOut)
def get_student_paper_detail(
    distribution_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, paper = _get_distribution_for_student(db, distribution_id, user)
    _log_event(db, d.id, user.id, "viewed")
    db.commit()
    # Hide correct answers in detail payload until submit.
    safe_sections = None
    if isinstance(paper.sections, dict):
        safe_sections = {"sections": []}
        for sec in paper.sections.get("sections") or []:
            if not isinstance(sec, dict):
                continue
            safe_sec = dict(sec)
            qs = safe_sec.get("questions") or []
            safe_sec["questions"] = _strip_correct([q for q in qs if isinstance(q, dict)])
            safe_sections["sections"].append(safe_sec)

    events = (
        db.query(PaperStudentEvent)
        .filter(
            PaperStudentEvent.distribution_id == d.id,
            PaperStudentEvent.student_id == user.id,
        )
        .all()
    )
    has_downloaded = any(e.event_type == "downloaded" for e in events)
    has_submitted_written = any(
        e.event_type == "written_submitted" for e in events
    )
    written_sub = _get_written_submission(db, d.id, user.id)
    if written_sub and written_sub.status == "graded":
        written_status = "graded"
    elif written_sub and written_sub.status in ("submitted", "grading_draft"):
        written_status = "submitted"
    elif has_submitted_written:
        written_status = "submitted"
    else:
        written_status = "not_started"

    from src.lms.services.paper_tracking import distribution_mode, student_list_progress

    mode = distribution_mode(d)
    now = datetime.utcnow()
    if has_submitted_written:
        paper_status = "completed"
    elif d.due_at < now:
        paper_status = "overdue"
    elif has_downloaded:
        paper_status = "downloaded"
    else:
        paper_status = "new"
    progress = student_list_progress(
        mode=mode,
        status=paper_status,
        written_status=written_sub.status if written_sub else None,
        exam_grading_status=None,
    )

    return StudentPaperDetailOut(
        distribution_id=d.id,
        paper_id=paper.id,
        title=d.title or paper.title,
        subject=paper.subject,
        board=paper.board,
        exam_type=paper.exam_type,
        total_marks=paper.total_marks,
        duration_mins=paper.duration_mins,
        due_at=d.due_at,
        due_label=due_label(d.due_at),
        allow_download=bool(d.allow_download),
        allow_online_practice=bool(d.allow_online_practice),
        allow_online_exam=bool(getattr(d, "allow_online_exam", False)),
        allow_written_submission=bool(getattr(d, "allow_written_submission", False)),
        instructions=d.instructions or paper.instructions,
        sections=safe_sections,
        chapter_scope=paper.chapter_scope,
        has_downloaded=has_downloaded,
        written_status=written_status,
        progress_label=progress,
    )


@router.get("/papers/{distribution_id}/download")
def get_student_paper_download(
    distribution_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, paper = _get_distribution_for_student(db, distribution_id, user)
    if not d.allow_download:
        raise HTTPException(status_code=403, detail="Download disabled by teacher")
    if count_filled_questions(paper) == 0:
        raise HTTPException(
            status_code=404,
            detail="Question paper is not ready yet. Ask your teacher to add questions.",
        )
    url = ensure_question_paper_pdf(paper)
    if not url:
        raise HTTPException(status_code=404, detail="Question paper PDF is not available yet.")
    paper.pdf_storage_key = url
    _log_event(db, d.id, user.id, "downloaded")
    db.commit()
    return {"download_url": url}


@router.post("/papers/{distribution_id}/practice/start", response_model=PaperPracticeStartOut)
def start_paper_practice(
    distribution_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, paper = _get_distribution_for_student(db, distribution_id, user)
    if not d.allow_online_practice:
        raise HTTPException(status_code=403, detail="Online practice is disabled")
    questions = _extract_mcq_questions(paper.sections)
    if not questions:
        raise HTTPException(status_code=400, detail="No MCQ questions available for practice")

    existing = (
        db.query(PaperPracticeAttempt)
        .filter(
            PaperPracticeAttempt.distribution_id == d.id,
            PaperPracticeAttempt.student_id == user.id,
            PaperPracticeAttempt.status == "in_progress",
        )
        .order_by(PaperPracticeAttempt.started_at.desc())
        .first()
    )
    if existing:
        return PaperPracticeStartOut(
            attempt_id=existing.id,
            distribution_id=d.id,
            paper_id=paper.id,
            questions=_strip_correct(questions),
            duration_mins=paper.duration_mins,
            started_at=existing.started_at,
            saved_answers=existing.answers_json or [],
        )

    attempt = PaperPracticeAttempt(
        id=_new_attempt_id(),
        distribution_id=d.id,
        student_id=user.id,
        attempt_type="mcq_practice",
        answers_json=[],
        status="in_progress",
        grading_status="in_progress",
    )
    db.add(attempt)
    _log_event(db, d.id, user.id, "practice_started")
    db.commit()
    db.refresh(attempt)
    return PaperPracticeStartOut(
        attempt_id=attempt.id,
        distribution_id=d.id,
        paper_id=paper.id,
        questions=_strip_correct(questions),
        duration_mins=paper.duration_mins,
        started_at=attempt.started_at,
        saved_answers=[],
    )


@router.get("/papers/{distribution_id}/practice/resume", response_model=PaperPracticeStartOut)
def resume_paper_practice(
    distribution_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, paper = _get_distribution_for_student(db, distribution_id, user)
    questions = _extract_mcq_questions(paper.sections)
    existing = (
        db.query(PaperPracticeAttempt)
        .filter(
            PaperPracticeAttempt.distribution_id == d.id,
            PaperPracticeAttempt.student_id == user.id,
            PaperPracticeAttempt.status == "in_progress",
        )
        .order_by(PaperPracticeAttempt.started_at.desc())
        .first()
    )
    if not existing:
        raise HTTPException(status_code=404, detail="No in-progress practice found")
    return PaperPracticeStartOut(
        attempt_id=existing.id,
        distribution_id=d.id,
        paper_id=paper.id,
        questions=_strip_correct(questions),
        duration_mins=paper.duration_mins,
        started_at=existing.started_at,
        saved_answers=existing.answers_json or [],
    )


@router.post("/papers/{distribution_id}/practice/submit", response_model=PaperPracticeSubmitOut)
def submit_paper_practice(
    distribution_id: str,
    body: PaperPracticeSubmitIn,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, paper = _get_distribution_for_student(db, distribution_id, user)
    questions = _extract_mcq_questions(paper.sections)
    if not questions:
        raise HTTPException(status_code=400, detail="No MCQ questions available")

    attempt = (
        db.query(PaperPracticeAttempt)
        .filter(
            PaperPracticeAttempt.distribution_id == d.id,
            PaperPracticeAttempt.student_id == user.id,
            PaperPracticeAttempt.status == "in_progress",
        )
        .order_by(PaperPracticeAttempt.started_at.desc())
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=400, detail="No in-progress practice. Start first.")

    answers = [a.model_dump() for a in body.answers]
    answer_map = {a.get("question_id"): str(a.get("answer", "")) for a in answers}
    max_score = float(sum(float(q.get("marks", 1)) for q in questions))
    score = 0.0
    feedback: dict[str, str] = {}
    for q in questions:
        qid = str(q.get("id", ""))
        correct = str(q.get("correct_answer", ""))
        marks = float(q.get("marks", 1))
        got = answer_map.get(qid, "")
        if got and got == correct:
            score += marks
            feedback[qid] = "Correct"
        else:
            feedback[qid] = "Incorrect"

    attempt.answers_json = answers
    attempt.status = "submitted"
    attempt.submitted_at = datetime.utcnow()
    attempt.ai_score = round(score, 2)
    attempt.max_score = max_score
    _log_event(
        db,
        d.id,
        user.id,
        "practice_submitted",
        {"score": round(score, 2), "max_score": max_score},
    )
    db.commit()
    pct = round((score / max_score) * 100, 1) if max_score else 0.0
    return PaperPracticeSubmitOut(
        attempt_id=attempt.id,
        score=round(score, 2),
        max_score=max_score,
        percentage=pct,
        status="submitted",
        feedback=feedback,
    )


def _get_latest_exam_attempt(
    db: Session, distribution_id: str, student_id: int, *, submitted_only: bool = False
) -> PaperPracticeAttempt | None:
    q = db.query(PaperPracticeAttempt).filter(
        PaperPracticeAttempt.distribution_id == distribution_id,
        PaperPracticeAttempt.student_id == student_id,
        PaperPracticeAttempt.attempt_type == "online_exam",
    )
    if submitted_only:
        q = q.filter(PaperPracticeAttempt.status == "submitted")
    return q.order_by(PaperPracticeAttempt.started_at.desc()).first()


@router.post("/papers/{distribution_id}/exam/start", response_model=PaperExamStartOut)
def start_paper_exam(
    distribution_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, paper = _get_distribution_for_student(db, distribution_id, user)
    if not getattr(d, "allow_online_exam", False):
        raise HTTPException(status_code=403, detail="Online exam is disabled for this paper")
    questions = extract_filled_exam_questions(paper.sections)
    if not questions:
        raise HTTPException(status_code=400, detail="No questions available for online exam")

    submitted = _get_latest_exam_attempt(db, d.id, user.id, submitted_only=True)
    if submitted:
        raise HTTPException(status_code=400, detail="You already submitted this online exam")

    existing = _get_latest_exam_attempt(db, d.id, user.id)
    if existing and existing.status == "in_progress":
        if exam_time_remaining_seconds(existing.started_at, paper.duration_mins) <= 0:
            raise HTTPException(
                status_code=400,
                detail="Your exam time has ended. Check results or ask your teacher for help.",
            )
        return PaperExamStartOut(
            attempt_id=existing.id,
            distribution_id=d.id,
            paper_id=paper.id,
            questions=strip_exam_questions(questions),
            duration_mins=paper.duration_mins,
            started_at=existing.started_at,
            saved_answers=existing.answers_json or [],
        )

    attempt = PaperPracticeAttempt(
        id=_new_attempt_id(),
        distribution_id=d.id,
        student_id=user.id,
        attempt_type="online_exam",
        answers_json=[],
        status="in_progress",
        grading_status="in_progress",
    )
    db.add(attempt)
    _log_event(db, d.id, user.id, "exam_started")
    db.commit()
    db.refresh(attempt)
    return PaperExamStartOut(
        attempt_id=attempt.id,
        distribution_id=d.id,
        paper_id=paper.id,
        questions=strip_exam_questions(questions),
        duration_mins=paper.duration_mins,
        started_at=attempt.started_at,
        saved_answers=[],
    )


@router.get("/papers/{distribution_id}/exam/resume", response_model=PaperExamStartOut)
def resume_paper_exam(
    distribution_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, paper = _get_distribution_for_student(db, distribution_id, user)
    questions = extract_filled_exam_questions(paper.sections)
    existing = _get_latest_exam_attempt(db, d.id, user.id)
    if not existing or existing.status != "in_progress":
        raise HTTPException(status_code=404, detail="No in-progress online exam found")
    if exam_time_remaining_seconds(existing.started_at, paper.duration_mins) <= 0:
        raise HTTPException(
            status_code=400,
            detail="Your exam time has ended. Check results or ask your teacher for help.",
        )
    return PaperExamStartOut(
        attempt_id=existing.id,
        distribution_id=d.id,
        paper_id=paper.id,
        questions=strip_exam_questions(questions),
        duration_mins=paper.duration_mins,
        started_at=existing.started_at,
        saved_answers=existing.answers_json or [],
    )


@router.patch("/papers/{distribution_id}/exam/draft")
def save_paper_exam_draft(
    distribution_id: str,
    body: PaperExamSubmitIn,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, _paper = _get_distribution_for_student(db, distribution_id, user)
    if not getattr(d, "allow_online_exam", False):
        raise HTTPException(status_code=403, detail="Online exam is disabled")
    attempt = _get_latest_exam_attempt(db, d.id, user.id)
    if not attempt or attempt.status != "in_progress":
        raise HTTPException(
            status_code=400,
            detail="No in-progress online exam. Start the test first.",
        )
    attempt.answers_json = [a.model_dump() for a in body.answers]
    db.commit()
    return {"ok": True, "attempt_id": attempt.id}


@router.post("/papers/{distribution_id}/exam/submit", response_model=PaperExamSubmitOut)
async def submit_paper_exam(
    distribution_id: str,
    body: PaperExamSubmitIn,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, paper = _get_distribution_for_student(db, distribution_id, user)
    if not getattr(d, "allow_online_exam", False):
        raise HTTPException(status_code=403, detail="Online exam is disabled")
    questions = extract_filled_exam_questions(paper.sections)
    if not questions:
        raise HTTPException(status_code=400, detail="No questions available")

    attempt = _get_latest_exam_attempt(db, d.id, user.id)
    if not attempt or attempt.status != "in_progress":
        raise HTTPException(status_code=400, detail="No in-progress online exam. Start first.")

    answers = [a.model_dump() for a in body.answers]
    grading, ai_score, max_score = await grade_online_exam_submission(questions, answers)
    items = grading.get("items") or []
    needs_review = any(bool(i.get("requires_teacher_review")) for i in items)

    attempt.answers_json = answers
    attempt.grading_json = grading
    attempt.ai_score = ai_score
    attempt.max_score = max_score
    attempt.status = "submitted"
    attempt.grading_status = "ai_graded"
    attempt.submitted_at = datetime.utcnow()
    _log_event(
        db,
        d.id,
        user.id,
        "exam_submitted",
        {
            "ai_score": ai_score,
            "max_score": max_score,
            "requires_teacher_review": needs_review,
        },
    )
    db.commit()
    pct = round((ai_score / max_score) * 100, 1) if max_score else 0.0
    return PaperExamSubmitOut(
        attempt_id=attempt.id,
        ai_score=ai_score,
        max_score=max_score,
        percentage=pct,
        grading_status=attempt.grading_status,
        requires_teacher_review=needs_review,
        items=items,
    )


@router.get("/papers/{distribution_id}/exam/result", response_model=PaperExamResultOut)
def get_paper_exam_result(
    distribution_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, _paper = _get_distribution_for_student(db, distribution_id, user)
    attempt = _get_latest_exam_attempt(db, d.id, user.id, submitted_only=True)
    if not attempt:
        raise HTTPException(status_code=404, detail="No submitted online exam found")
    grading = attempt.grading_json or {}
    items = grading.get("items") or []
    display = (
        attempt.teacher_score
        if attempt.grading_status == "teacher_finalized" and attempt.teacher_score is not None
        else attempt.ai_score
    )
    pct = (
        round((display / attempt.max_score) * 100, 1)
        if display is not None and attempt.max_score
        else None
    )
    needs_review = any(bool(i.get("requires_teacher_review")) for i in items)
    return PaperExamResultOut(
        attempt_id=attempt.id,
        distribution_id=d.id,
        ai_score=attempt.ai_score,
        teacher_score=attempt.teacher_score,
        max_score=attempt.max_score,
        percentage=pct,
        grading_status=attempt.grading_status or "ai_graded",
        requires_teacher_review=needs_review,
        items=items,
        submitted_at=attempt.submitted_at,
    )


def _get_written_submission(
    db: Session, distribution_id: str, student_id: int
) -> PaperWrittenSubmission | None:
    return (
        db.query(PaperWrittenSubmission)
        .filter(
            PaperWrittenSubmission.distribution_id == distribution_id,
            PaperWrittenSubmission.student_id == student_id,
        )
        .order_by(PaperWrittenSubmission.submitted_at.desc())
        .first()
    )


def _written_status_out(sub: PaperWrittenSubmission | None) -> PaperWrittenStatusOut:
    if not sub:
        return PaperWrittenStatusOut(status="not_started")
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
    st: str = "draft"
    if sub.status == "graded":
        st = "graded"
    elif sub.status in ("submitted", "grading_draft"):
        st = "submitted"
    pct = None
    if sub.status == "graded" and sub.teacher_score is not None and sub.max_score:
        pct = round((sub.teacher_score / sub.max_score) * 100, 1)
    return PaperWrittenStatusOut(
        submission_id=sub.id,
        status=st,  # type: ignore[arg-type]
        files=files,
        teacher_score=sub.teacher_score,
        max_score=sub.max_score,
        percentage=pct,
        submitted_at=sub.submitted_at,
    )


@router.get("/papers/{distribution_id}/written", response_model=PaperWrittenStatusOut)
def get_written_submission_status(
    distribution_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, _paper = _get_distribution_for_student(db, distribution_id, user)
    if not getattr(d, "allow_written_submission", False):
        raise HTTPException(status_code=403, detail="Written submission is disabled")
    sub = _get_written_submission(db, d.id, user.id)
    return _written_status_out(sub)


@router.post("/papers/{distribution_id}/written/upload")
async def upload_written_answer_sheets(
    distribution_id: str,
    files: list[UploadFile] = File(...),
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, paper = _get_distribution_for_student(db, distribution_id, user)
    if not getattr(d, "allow_written_submission", False):
        raise HTTPException(status_code=403, detail="Written submission is disabled")
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    sub = _get_written_submission(db, d.id, user.id)
    if sub and sub.status in ("submitted", "graded"):
        raise HTTPException(status_code=400, detail="Submission already finalized")

    existing_files: list[dict] = list(sub.files_json or []) if sub else []
    if len(existing_files) + len(files) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"Maximum {MAX_FILES} files allowed")

    storage = submission_storage_dir(d.id, user.id)
    for upload in files:
        if not upload.filename:
            raise HTTPException(status_code=400, detail="Filename required")
        try:
            validate_upload_suffix(upload.filename)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e
        body = await upload.read()
        if not body:
            raise HTTPException(status_code=400, detail="Empty file")
        if len(body) > MAX_FILE_BYTES:
            raise HTTPException(status_code=400, detail="File too large (max 15MB)")

        safe = sanitize_filename(upload.filename)
        unique = f"{uuid.uuid4().hex[:10]}_{safe}"
        dest = storage / unique
        dest.write_bytes(body)
        existing_files.append(
            {
                "url": public_url_for_saved_file(d.id, user.id, unique),
                "filename": safe,
                "uploaded_at": datetime.utcnow().isoformat(),
            }
        )

    if not sub:
        template = build_manual_grading_template(paper)
        sub = PaperWrittenSubmission(
            id=new_submission_id(),
            distribution_id=d.id,
            student_id=user.id,
            files_json=existing_files,
            grading_json=template,
            max_score=template.get("max_score"),
            status="draft",
        )
        db.add(sub)
    else:
        sub.files_json = existing_files

    db.commit()
    db.refresh(sub)
    return {"submission_id": sub.id, "file_count": len(existing_files), "status": sub.status}


@router.post(
    "/papers/{distribution_id}/written/submit",
    response_model=PaperWrittenSubmitOut,
)
def submit_written_answer_sheets(
    distribution_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, paper = _get_distribution_for_student(db, distribution_id, user)
    if not getattr(d, "allow_written_submission", False):
        raise HTTPException(status_code=403, detail="Written submission is disabled")

    sub = _get_written_submission(db, d.id, user.id)
    if not sub or not sub.files_json:
        raise HTTPException(status_code=400, detail="Upload at least one answer sheet first")
    if sub.status in ("submitted", "graded"):
        raise HTTPException(status_code=400, detail="Already submitted")

    if not sub.grading_json:
        template = build_manual_grading_template(paper)
        sub.grading_json = template
        sub.max_score = template.get("max_score")

    sub.status = "submitted"
    sub.submitted_at = datetime.utcnow()
    _log_event(
        db,
        d.id,
        user.id,
        "written_submitted",
        {"submission_id": sub.id, "file_count": len(sub.files_json or [])},
    )
    db.commit()
    return PaperWrittenSubmitOut(
        submission_id=sub.id,
        status=sub.status,
        file_count=len(sub.files_json or []),
    )


@router.get(
    "/papers/{distribution_id}/written/result",
    response_model=PaperWrittenResultOut,
)
def get_written_submission_result(
    distribution_id: str,
    user: User = Depends(require_roles("student")),
    db: Session = Depends(get_db),
):
    d, _paper = _get_distribution_for_student(db, distribution_id, user)
    sub = _get_written_submission(db, d.id, user.id)
    if not sub or sub.status not in ("submitted", "graded"):
        raise HTTPException(status_code=404, detail="No submitted written paper found")

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
    grading = sub.grading_json or {}
    items = grading.get("items") or []
    pct = None
    if sub.status == "graded" and sub.teacher_score is not None and sub.max_score:
        pct = round((sub.teacher_score / sub.max_score) * 100, 1)

    return PaperWrittenResultOut(
        submission_id=sub.id,
        distribution_id=d.id,
        teacher_score=sub.teacher_score,
        max_score=sub.max_score,
        percentage=pct,
        status=sub.status,
        items=items if sub.status == "graded" else [],
        files=files,
        submitted_at=sub.submitted_at,
        graded_at=sub.graded_at,
    )
