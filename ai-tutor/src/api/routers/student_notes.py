"""
Student Notes API — editable notes by NCERT class / subject / chapter.
Separate from the AI notebook archive (/api/v1/notebook).
"""

from pathlib import Path
import sys

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

project_root = Path(__file__).parent.parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from src.api.utils.student_notes_manager import student_notes_manager

router = APIRouter()


class CreateNoteRequest(BaseModel):
    title: str = "Untitled note"
    class_key: str = ""
    subject_key: str = ""
    chapter_key: str = ""
    chapter_label: str = ""
    content_html: str = ""
    content_json: dict | None = None
    source: str = "manual"
    source_metadata: dict = Field(default_factory=dict)


class UpdateNoteRequest(BaseModel):
    title: str | None = None
    content_html: str | None = None
    content_json: dict | None = None
    class_key: str | None = None
    subject_key: str | None = None
    chapter_key: str | None = None
    chapter_label: str | None = None


class FromSessionRequest(BaseModel):
    summary: str
    session_title: str = ""
    class_key: str = ""
    subject_key: str = ""
    chapter_key: str = ""
    chapter_label: str = ""


@router.get("/folders")
async def get_folders():
    try:
        tree = student_notes_manager.get_folder_tree()
        return {"folders": tree}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/list")
async def list_notes(
    class_key: str | None = None,
    subject_key: str | None = None,
    chapter_key: str | None = None,
):
    try:
        notes = student_notes_manager.list_notes(class_key, subject_key, chapter_key)
        return {"notes": notes, "total": len(notes)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/search")
async def search_notes(q: str = "", limit: int = 50):
    try:
        results = student_notes_manager.search_notes(q, limit=limit)
        return {"results": results, "total": len(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/create")
async def create_note(request: CreateNoteRequest):
    try:
        note = student_notes_manager.create_note(
            title=request.title,
            class_key=request.class_key,
            subject_key=request.subject_key,
            chapter_key=request.chapter_key,
            chapter_label=request.chapter_label,
            content_html=request.content_html,
            content_json=request.content_json,
            source=request.source,
            source_metadata=request.source_metadata,
        )
        return {"success": True, "note": note}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.post("/from-session")
async def create_note_from_session(request: FromSessionRequest):
    try:
        note = student_notes_manager.note_from_session_summary(
            summary=request.summary,
            session_title=request.session_title,
            class_key=request.class_key,
            subject_key=request.subject_key,
            chapter_key=request.chapter_key,
            chapter_label=request.chapter_label,
        )
        return {"success": True, "note": note}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.get("/health/check")
async def health_check():
    return {"status": "healthy", "service": "student-notes"}


@router.get("/{note_id}")
async def get_note(note_id: str):
    try:
        note = student_notes_manager.get_note(note_id)
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        return note
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.put("/{note_id}")
async def update_note(note_id: str, request: UpdateNoteRequest):
    try:
        note = student_notes_manager.update_note(
            note_id=note_id,
            title=request.title,
            content_html=request.content_html,
            content_json=request.content_json,
            class_key=request.class_key,
            subject_key=request.subject_key,
            chapter_key=request.chapter_key,
            chapter_label=request.chapter_label,
        )
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
        return {"success": True, "note": note}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@router.delete("/{note_id}")
async def delete_note(note_id: str):
    try:
        ok = student_notes_manager.delete_note(note_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Note not found")
        return {"success": True, "message": "Note deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e

