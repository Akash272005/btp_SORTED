"""Shared helpers for uploading ncert_source/ to Azure Blob and building public URLs."""

from __future__ import annotations

import os
import re
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
NCERT_SOURCE = ROOT / "ncert_source"
MANIFEST_OUT = ROOT / "web" / "public" / "ncert" / "manifest.json"

# Blob layout: container ``pdfs`` → ``ncert/class-9/science/iesc113.pdf``
BLOB_PREFIX = "ncert"


def load_project_env() -> None:
    load_dotenv(ROOT / "bixy_AiTutor.env", override=False)
    load_dotenv(ROOT / ".env", override=True)


def ncert_storage_base_url() -> str:
    """Public base URL for NCERT PDFs (trailing slash)."""
    raw = (
        os.getenv("NCERT_STORAGE_BASE_URL", "").strip()
        or "https://bixyblob355528.blob.core.windows.net/pdfs/ncert/"
    )
    return raw.rstrip("/") + "/"


def blob_name_for_pdf(rel_path: Path | str) -> str:
    """``ncert/class-9/science/iesc113.pdf`` from ``class-9/science/iesc113.pdf``."""
    rel = Path(rel_path).as_posix().lstrip("/")
    return f"{BLOB_PREFIX}/{rel}"


def public_url_for_pdf(rel_path: Path | str, base_url: str | None = None) -> str:
    base = (base_url or ncert_storage_base_url()).rstrip("/")
    rel = Path(rel_path).as_posix().lstrip("/")
    return f"{base}/{rel}"


def iter_ncert_pdfs(
    root: Path = NCERT_SOURCE,
    class_key: str | None = None,
    subject_key: str | None = None,
) -> list[Path]:
    if not root.is_dir():
        return []
    pdfs: list[Path] = []
    for pdf in sorted(root.rglob("*.pdf")):
        rel = pdf.relative_to(root)
        parts = rel.parts
        if len(parts) < 3:
            continue
        cls, subj = parts[0], parts[1]
        if class_key and cls != class_key:
            continue
        if subject_key and subj != subject_key:
            continue
        pdfs.append(pdf)
    return pdfs


def class_sort_key(class_key: str) -> tuple[int, str]:
    m = re.search(r"(\d+)", class_key)
    return (int(m.group(1)) if m else 99, class_key)


def is_english_hindi_code(raw_code: str) -> bool:
    """True when NCERT filename medium letter is English (e) or Hindi (h)."""
    return len(raw_code) >= 2 and raw_code[1] in ("e", "h")


def chapter_tail(raw_code: str) -> str:
    """Subject+book+chapter suffix shared across mediums, e.g. jesc101 → sc101."""
    return raw_code[2:] if len(raw_code) > 2 else raw_code


def list_blob_ncert_pdfs(
    *,
    medium_codes: tuple[str, ...] = ("e", "h"),
    class_key: str | None = None,
) -> list[tuple[str, int]]:
    """Return [(rel_path, size_bytes), …] for PDFs under blob ncert/ prefix."""
    from src.services.storage.azure_kb_blob import get_kb_blob_container_client

    container = get_kb_blob_container_client()
    if container is None:
        raise RuntimeError(
            "Azure Blob not configured. Set AZURE_STORAGE_CONNECTION_STRING in .env",
        )

    prefix = BLOB_PREFIX + "/"
    if class_key:
        prefix = f"{BLOB_PREFIX}/{class_key}/"

    rows: list[tuple[str, int]] = []
    for blob in container.list_blobs(name_starts_with=prefix):
        name = blob.name
        if not name.lower().endswith(".pdf"):
            continue
        rel = name[len(BLOB_PREFIX) + 1 :] if name.startswith(f"{BLOB_PREFIX}/") else name
        stem = Path(rel).stem
        if medium_codes and (len(stem) < 2 or stem[1] not in medium_codes):
            continue
        rows.append((rel.replace("\\", "/"), blob.size or 0))
    return rows
