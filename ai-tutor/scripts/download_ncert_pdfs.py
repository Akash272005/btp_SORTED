#!/usr/bin/env python3
"""
Download NCERT PDFs into the structured ncert_source workspace.

Workflow:
1. Edit ncert_source/ncert_download_tracker.csv:
   - Set 'book_or_chapter'
   - Set 'source_url' to the DIRECT PDF URL for that book/chapter
   - Optionally set 'pdf_filename' (otherwise inferred from URL)
2. Run:
   python scripts/download_ncert_pdfs.py
3. The script will:
   - Download PDFs into the correct class/subject folder
   - Update 'pdf_filename' and 'download_status' in the CSV
"""

from __future__ import annotations

import csv
from pathlib import Path
from typing import List, Dict

import requests


def load_rows(tracker_path: Path) -> List[Dict[str, str]]:
    with tracker_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    return rows


def save_rows(tracker_path: Path, rows: List[Dict[str, str]]) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with tracker_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def download_file(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=60) as r:  # nosec B113
        r.raise_for_status()
        with dest.open("wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                if not chunk:
                    continue
                f.write(chunk)


def normalize_filename(row: Dict[str, str]) -> str:
    if row.get("pdf_filename"):
        return row["pdf_filename"]
    # Fallback: derive from URL
    url = row.get("source_url", "").strip()
    if url and "/" in url:
        candidate = url.rsplit("/", 1)[-1]
        if candidate:
            return candidate
    # Last resort: generic name
    safe_name = row.get("book_or_chapter") or "ncert_book"
    safe_name = safe_name.replace(" ", "_").replace("/", "_")
    return f"{safe_name}.pdf"


def process_tracker(tracker_path: Path, ncert_root: Path) -> None:
    rows = load_rows(tracker_path)
    updated = False

    for row in rows:
        status = (row.get("download_status") or "").strip().lower()
        url = (row.get("source_url") or "").strip()
        clazz = (row.get("class") or "").strip()
        subject = (row.get("subject") or "").strip()

        if not url or not clazz or not subject:
            continue
        if status == "done":
            continue
        if not url.lower().endswith(".pdf"):
            # Only handle rows where source_url is already a direct PDF link
            continue

        class_dir = ncert_root / clazz / subject
        filename = normalize_filename(row)
        dest_path = class_dir / filename

        print(f"Downloading: {url} -> {dest_path}")
        try:
            download_file(url, dest_path)
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ Failed: {e}")
            row["download_status"] = "error"
            row["notes"] = f"download error: {e}"
            updated = True
            continue

        print("  ✓ Success")
        row["pdf_filename"] = filename
        row["download_status"] = "done"
        updated = True

    if updated:
        save_rows(tracker_path, rows)
        print(f"Updated tracker: {tracker_path}")
    else:
        print("No rows to update. Check that source_url is a direct PDF and download_status != done.")


def main() -> None:
    project_root = Path(__file__).resolve().parent.parent
    ncert_root = project_root / "ncert_source"
    tracker_path = ncert_root / "ncert_download_tracker.csv"

    if not tracker_path.exists():
        raise SystemExit(f"Tracker not found: {tracker_path}")

    process_tracker(tracker_path, ncert_root)


if __name__ == "__main__":
    main()

