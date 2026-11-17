"""
Student Notes Manager — editable notes organised by NCERT class / subject / chapter.
Stored separately from AI notebook archives (data/user/notebook/).
"""

from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path

from pydantic import BaseModel


class StudentNoteSource(str):
    MANUAL = "manual"
    SESSION_SUMMARY = "session_summary"
    AI_IMPORT = "ai_import"


class StudentNote(BaseModel):
    id: str
    title: str
    class_key: str = ""
    subject_key: str = ""
    chapter_key: str = ""
    chapter_label: str = ""
    content_html: str = ""
    content_json: dict | None = None
    source: str = StudentNoteSource.MANUAL
    source_metadata: dict = {}
    created_at: float
    updated_at: float


def _class_sort_key(cls: str) -> int:
    try:
        return int(str(cls).replace("class-", "").strip() or "0")
    except ValueError:
        return 0


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text or "").strip()


class StudentNotesManager:
    def __init__(self, base_dir: str | None = None):
        project_root = Path(__file__).resolve().parents[3]
        self.base_dir = Path(base_dir) if base_dir else project_root / "data" / "user" / "student_notes"
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self.index_file = self.base_dir / "notes_index.json"
        self._ensure_index()
        self._manifest_path = project_root / "web" / "public" / "ncert" / "manifest.json"
        self._chapter_names_path = project_root / "web" / "public" / "ncert" / "chapter_names.json"

    def _ensure_index(self) -> None:
        if not self.index_file.exists():
            self._save_index({"notes": []})

    def _load_index(self) -> dict:
        try:
            with open(self.index_file, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {"notes": []}

    def _save_index(self, index: dict) -> None:
        with open(self.index_file, "w", encoding="utf-8") as f:
            json.dump(index, f, indent=2, ensure_ascii=False)

    def _note_path(self, note_id: str) -> Path:
        return self.base_dir / f"{note_id}.json"

    def _load_note_file(self, note_id: str) -> dict | None:
        path = self._note_path(note_id)
        if not path.exists():
            return None
        try:
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def _save_note_file(self, note: dict) -> None:
        with open(self._note_path(note["id"]), "w", encoding="utf-8") as f:
            json.dump(note, f, indent=2, ensure_ascii=False)

    def _sync_index_entry(self, note: dict) -> None:
        index = self._load_index()
        entries = index.get("notes", [])
        summary = {
            "id": note["id"],
            "title": note["title"],
            "class_key": note.get("class_key", ""),
            "subject_key": note.get("subject_key", ""),
            "chapter_key": note.get("chapter_key", ""),
            "chapter_label": note.get("chapter_label", ""),
            "source": note.get("source", StudentNoteSource.MANUAL),
            "created_at": note["created_at"],
            "updated_at": note["updated_at"],
        }
        replaced = False
        for i, e in enumerate(entries):
            if e.get("id") == note["id"]:
                entries[i] = summary
                replaced = True
                break
        if not replaced:
            entries.append(summary)
        index["notes"] = entries
        self._save_index(index)

    def _remove_index_entry(self, note_id: str) -> None:
        index = self._load_index()
        index["notes"] = [e for e in index.get("notes", []) if e.get("id") != note_id]
        self._save_index(index)

    def get_folder_tree(self) -> list[dict]:
        """Build class → subject → chapters from NCERT manifest + chapter_names."""
        if not self._manifest_path.is_file():
            return []
        manifest = json.loads(self._manifest_path.read_text(encoding="utf-8"))
        chapter_names: dict = {}
        if self._chapter_names_path.is_file():
            chapter_names = json.loads(self._chapter_names_path.read_text(encoding="utf-8"))

        tree: list[dict] = []
        for class_key in sorted(manifest.keys(), key=_class_sort_key):
            subjects = manifest.get(class_key) or {}
            if not isinstance(subjects, dict):
                continue
            subject_nodes: list[dict] = []
            for subject_key in sorted(subjects.keys()):
                files = subjects.get(subject_key) or []
                if not isinstance(files, list):
                    continue
                chapters: list[dict] = []
                seen: set[str] = set()
                for entry in files:
                    if not isinstance(entry, dict):
                        continue
                    raw = (entry.get("raw_code") or "").strip()
                    if not raw or raw in seen:
                        continue
                    seen.add(raw)
                    label = (entry.get("label") or "").strip()
                    label = label.replace("🇬🇧", "").replace("🇮🇳", "").strip()
                    names = chapter_names.get(class_key, {}).get(subject_key, {})
                    title = names.get(raw) if isinstance(names, dict) else None
                    if title and str(title).strip() and title != raw:
                        chapter_label = str(title).strip()
                    elif label:
                        chapter_label = label
                    else:
                        chapter_label = raw
                    chapters.append(
                        {
                            "chapter_key": raw,
                            "chapter_label": chapter_label,
                            "url": entry.get("url") or "",
                        }
                    )
                if chapters:
                    subject_nodes.append(
                        {
                            "subject_key": subject_key,
                            "subject_label": subject_key.replace("-", " ").title(),
                            "chapters": chapters,
                        }
                    )
            if subject_nodes:
                tree.append(
                    {
                        "class_key": class_key,
                        "class_label": class_key.replace("-", " ").title(),
                        "subjects": subject_nodes,
                    }
                )
        return tree

    def list_notes(
        self,
        class_key: str | None = None,
        subject_key: str | None = None,
        chapter_key: str | None = None,
    ) -> list[dict]:
        index = self._load_index()
        notes = index.get("notes", [])
        if class_key:
            notes = [n for n in notes if n.get("class_key") == class_key]
        if subject_key:
            notes = [n for n in notes if n.get("subject_key") == subject_key]
        if chapter_key:
            notes = [n for n in notes if n.get("chapter_key") == chapter_key]
        notes.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
        return notes

    def get_note(self, note_id: str) -> dict | None:
        return self._load_note_file(note_id)

    def create_note(
        self,
        title: str,
        class_key: str = "",
        subject_key: str = "",
        chapter_key: str = "",
        chapter_label: str = "",
        content_html: str = "",
        content_json: dict | None = None,
        source: str = StudentNoteSource.MANUAL,
        source_metadata: dict | None = None,
    ) -> dict:
        note_id = str(uuid.uuid4())[:8]
        now = time.time()
        note = {
            "id": note_id,
            "title": title.strip() or "Untitled note",
            "class_key": class_key,
            "subject_key": subject_key,
            "chapter_key": chapter_key,
            "chapter_label": chapter_label,
            "content_html": content_html,
            "content_json": content_json,
            "source": source,
            "source_metadata": source_metadata or {},
            "created_at": now,
            "updated_at": now,
        }
        self._save_note_file(note)
        self._sync_index_entry(note)
        return note

    def update_note(
        self,
        note_id: str,
        title: str | None = None,
        content_html: str | None = None,
        content_json: dict | None = None,
        class_key: str | None = None,
        subject_key: str | None = None,
        chapter_key: str | None = None,
        chapter_label: str | None = None,
    ) -> dict | None:
        note = self._load_note_file(note_id)
        if not note:
            return None
        if title is not None:
            note["title"] = title.strip() or note.get("title", "Untitled note")
        if content_html is not None:
            note["content_html"] = content_html
        if content_json is not None:
            note["content_json"] = content_json
        if class_key is not None:
            note["class_key"] = class_key
        if subject_key is not None:
            note["subject_key"] = subject_key
        if chapter_key is not None:
            note["chapter_key"] = chapter_key
        if chapter_label is not None:
            note["chapter_label"] = chapter_label
        note["updated_at"] = time.time()
        self._save_note_file(note)
        self._sync_index_entry(note)
        return note

    def delete_note(self, note_id: str) -> bool:
        path = self._note_path(note_id)
        if not path.exists():
            return False
        path.unlink()
        self._remove_index_entry(note_id)
        return True

    def search_notes(self, query: str, limit: int = 50) -> list[dict]:
        q = (query or "").strip().lower()
        if not q:
            return self.list_notes()[:limit]
        results: list[dict] = []
        for entry in self._load_index().get("notes", []):
            note = self._load_note_file(entry["id"])
            if not note:
                continue
            haystack = " ".join(
                [
                    note.get("title", ""),
                    note.get("chapter_label", ""),
                    _strip_html(note.get("content_html", "")),
                ]
            ).lower()
            if q in haystack:
                results.append(
                    {
                        "id": note["id"],
                        "title": note["title"],
                        "class_key": note.get("class_key", ""),
                        "subject_key": note.get("subject_key", ""),
                        "chapter_key": note.get("chapter_key", ""),
                        "chapter_label": note.get("chapter_label", ""),
                        "snippet": _strip_html(note.get("content_html", ""))[:200],
                        "updated_at": note.get("updated_at", 0),
                    }
                )
        results.sort(key=lambda x: x.get("updated_at", 0), reverse=True)
        return results[:limit]

    def note_from_session_summary(
        self,
        summary: str,
        session_title: str = "",
        class_key: str = "",
        subject_key: str = "",
        chapter_key: str = "",
        chapter_label: str = "",
    ) -> dict:
        """Create a student note draft from a learning session summary (markdown → simple HTML)."""
        title = session_title.strip() or "Session notes"
        lines = (summary or "").strip().splitlines()
        blocks: list[str] = []
        list_items: list[str] = []

        def flush_list() -> None:
            nonlocal list_items
            if list_items:
                blocks.append("<ul>" + "".join(f"<li>{item}</li>" for item in list_items) + "</ul>")
                list_items = []

        for line in lines:
            stripped = line.strip()
            if not stripped:
                flush_list()
                continue
            if stripped.startswith("### "):
                flush_list()
                blocks.append(f"<h3>{stripped[4:]}</h3>")
            elif stripped.startswith("## "):
                flush_list()
                blocks.append(f"<h2>{stripped[3:]}</h2>")
            elif stripped.startswith("# "):
                flush_list()
                blocks.append(f"<h1>{stripped[2:]}</h1>")
            elif stripped.startswith("- ") or stripped.startswith("* "):
                list_items.append(stripped[2:])
            else:
                flush_list()
                blocks.append(f"<p>{stripped}</p>")
        flush_list()
        content_html = "".join(blocks) or "<p></p>"

        return self.create_note(
            title=title,
            class_key=class_key,
            subject_key=subject_key,
            chapter_key=chapter_key,
            chapter_label=chapter_label,
            content_html=content_html,
            source=StudentNoteSource.SESSION_SUMMARY,
            source_metadata={"summary_length": len(summary or "")},
        )


student_notes_manager = StudentNotesManager()
