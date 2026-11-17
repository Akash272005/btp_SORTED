"""
Compact text catalog of all NCERT PDFs from web/public/ncert/manifest.json.

Used by ChatAgent (ncert_only) so the model sees every shipped PDF path/label.
Full book text is not included (too large); RAG excerpts carry substance.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path


def _class_sort_key(cls: str) -> int:
    try:
        return int(str(cls).replace("class-", "").strip() or "0")
    except ValueError:
        return 0


@lru_cache(maxsize=32)
def _build_catalog_cached(manifest_path: str, mtime_ns: int, max_chars: int) -> tuple[str, int]:
    path = Path(manifest_path)
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        return "", 0

    lines: list[str] = []
    total = 0
    for cls in sorted(data.keys(), key=_class_sort_key):
        subs = data.get(cls) or {}
        if not isinstance(subs, dict):
            continue
        for subj in sorted(subs.keys()):
            files = subs.get(subj) or []
            if not isinstance(files, list):
                continue
            for f in files:
                if not isinstance(f, dict):
                    continue
                url = (f.get("url") or "").strip()
                label = (f.get("label") or "").strip()
                lines.append(f"{cls}\t{subj}\t{url}\t{label}")
                total += 1

    body = "\n".join(lines)
    if len(body) <= max_chars:
        return body, total

    truncated = body[:max_chars].rstrip()
    note = (
        f"\n\n[Catalog truncated: showing first ~{max_chars} characters of "
        f"{total} total PDF entries.]"
    )
    return truncated + note, total


def build_ncert_pdf_catalog(
    project_root: Path,
    max_chars: int | None = None,
) -> tuple[str, int]:
    """
    Build a tab-separated catalog: class\tsubject\turl\tlabel per line.

    Returns:
        (catalog_text, total_pdf_count) — text may be shorter than total if truncated.
    """
    if max_chars is None:
        max_chars = int(os.getenv("NCERT_CATALOG_MAX_CHARS", "100000"))
    manifest_path = (project_root / "web" / "public" / "ncert" / "manifest.json").resolve()
    if not manifest_path.is_file():
        return "", 0
    try:
        mtime_ns = manifest_path.stat().st_mtime_ns
    except OSError:
        return "", 0
    return _build_catalog_cached(str(manifest_path), mtime_ns, max_chars)
