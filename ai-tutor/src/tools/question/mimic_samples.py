"""List parsed exam papers available for Mimic Exam quick-pick."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

_MIMIC_BATCH_PREFIX = re.compile(r"^mimic_\d{8}_\d{6}_", re.IGNORECASE)
_GENERATED_JSON_SUFFIX = "_generated_questions.json"


def _friendly_exam_label(name: str) -> str:
    """Turn folder stems into readable exam titles."""
    stem = _MIMIC_BATCH_PREFIX.sub("", name)
    stem = stem.replace("_", " ").replace("-", " ")
    stem = re.sub(r"\s+", " ", stem).strip()
    return stem or name


def _normalize_title(label: str) -> str:
    return re.sub(r"\s+", " ", label.lower()).strip()


def _count_reference_questions(paper_dir: Path) -> int | None:
    for json_file in sorted(paper_dir.glob("*_questions.json")):
        if json_file.name.endswith(_GENERATED_JSON_SUFFIX):
            continue
        try:
            with open(json_file, encoding="utf-8") as f:
                data = json.load(f)
            questions = data.get("questions")
            if isinstance(questions, list):
                return len(questions)
        except (OSError, json.JSONDecodeError, TypeError):
            continue
    return None


def _is_valid_parsed_exam_dir(paper_dir: Path) -> bool:
    auto_dir = paper_dir / "auto"
    return auto_dir.is_dir() and bool(list(auto_dir.glob("*.md")))


def list_mimic_exam_samples(mimic_root: Path) -> list[dict[str, Any]]:
    """
    Scan mimic_papers for parsed exams and return deduplicated suggestions.

    Each sample:
      - id: relative path under mimic_root (safe for paper_path)
      - label: human-friendly exam title
      - question_count: optional reference question count
      - updated_at: unix mtime for sorting
    """
    if not mimic_root.is_dir():
        return []

    root_resolved = mimic_root.resolve()
    by_title: dict[str, dict[str, Any]] = {}

    for auto_dir in mimic_root.rglob("auto"):
        if not auto_dir.is_dir():
            continue
        paper_dir = auto_dir.parent
        if not _is_valid_parsed_exam_dir(paper_dir):
            continue

        try:
            rel = paper_dir.resolve().relative_to(root_resolved)
        except ValueError:
            continue

        paper_path = rel.as_posix()
        if ".." in paper_path.split("/"):
            continue

        label = _friendly_exam_label(paper_dir.name)
        title_key = _normalize_title(label)
        mtime = paper_dir.stat().st_mtime
        question_count = _count_reference_questions(paper_dir)

        existing = by_title.get(title_key)
        if existing and existing["updated_at"] >= mtime:
            continue

        by_title[title_key] = {
            "id": paper_path,
            "label": label,
            "question_count": question_count,
            "updated_at": mtime,
        }

    samples = list(by_title.values())
    samples.sort(key=lambda s: s["updated_at"], reverse=True)
    for sample in samples:
        sample.pop("updated_at", None)
    return samples
