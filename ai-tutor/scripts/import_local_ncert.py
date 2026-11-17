#!/usr/bin/env python3
"""Import local NCERT PDFs into project `ncert_source` and update tracker.

Usage:
  python scripts/import_local_ncert.py --source /path/to/NCERT_Books --project-root /path/to/project --dry-run

Behavior:
 - Scans `--source` recursively for .pdf files
 - Tries to infer `class-XX` and `subject` from file path using common folder names
 - Copies PDFs into `ncert_source/class-XX/<subject>/` (creates folders if missing)
 - Updates or appends entries in `ncert_download_tracker.csv` with `pdf_filename` and `download_status=done`

This is a best-effort importer; verify the tracker after running.
"""

from __future__ import annotations

import argparse
import csv
from pathlib import Path
import shutil
import sys
from typing import Optional, Dict, List, Tuple


COMMON_SUBJECTS = {
    "english",
    "hindi",
    "maths",
    "mathematics",
    "evs",
    "science",
    "social-science",
    "physics",
    "chemistry",
    "biology",
    "economics",
    "history",
    "political-science",
    "geography",
    "accountancy",
    "business-studies",
    "sociology",
    "sanskrit",
}


def find_class_and_subject(path: Path) -> Tuple[Optional[str], Optional[str]]:
    """Best-effort: inspect path parts for class-XX and subject names."""
    parts = [p.lower() for p in path.parts]
    clazz = None
    subject = None

    # find class-XX patterns
    for p in parts:
        if p.startswith("class-") or p.startswith("class_"):
            clazz = p if p.startswith("class-") else p.replace("class_", "class-")
            break
        # allow numeric folder like '10' or 'class 10' or 'c10'
        if p.isdigit() and 1 <= int(p) <= 12:
            clazz = f"class-{int(p):02d}"
            break
        if p.startswith("c") and p[1:].isdigit():
            n = p[1:]
            if 1 <= int(n) <= 12:
                clazz = f"class-{int(n):02d}"
                break

    # find subject
    for p in parts[::-1]:
        if p in COMMON_SUBJECTS:
            subject = p
            break
        # try to match common synonyms
        if "math" in p:
            subject = "mathematics"
            break
        if "social" in p or "s.st" in p or "sci-social" in p:
            subject = "social-science"
            break

    return clazz, subject


def load_tracker(tracker_path: Path) -> List[Dict[str, str]]:
    if not tracker_path.exists():
        return []
    with tracker_path.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return list(reader)


def save_tracker(tracker_path: Path, rows: List[Dict[str, str]]) -> None:
    if not rows:
        return
    fieldnames = list(rows[0].keys())
    with tracker_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def update_or_append_tracker(rows: List[Dict[str, str]], clazz: str, subject: str, filename: str, source_rel: str) -> None:
    # try to find an existing row for same class+subject with same pdf_filename or empty
    for row in rows:
        if (row.get("class") or "").strip().lower() == clazz.lower() and (row.get("subject") or "").strip().lower() == subject.lower():
            # update first matching empty or same file
            existing = (row.get("pdf_filename") or "").strip()
            if not existing or existing == filename:
                row["pdf_filename"] = filename
                row["source_url"] = source_rel
                row["download_status"] = "done"
                row["ingest_status"] = row.get("ingest_status") or "pending"
                return

    # append new row using common headers if present
    new = {
        "class": clazz,
        "subject": subject,
        "book_or_chapter": Path(filename).stem,
        "pdf_filename": filename,
        "source_url": source_rel,
        "download_status": "done",
        "ingest_status": "pending",
        "notes": "imported from local",
    }
    rows.append(new)


def main(argv: List[str]) -> int:
    p = argparse.ArgumentParser(description="Import local NCERT PDFs into project ncert_source")
    p.add_argument("--source", required=True, help="Local folder containing NCERT PDFs")
    p.add_argument("--project-root", default=Path(__file__).resolve().parent.parent.as_posix())
    p.add_argument("--dry-run", action="store_true", help="Show actions without copying")
    args = p.parse_args(argv)

    source = Path(args.source).expanduser().resolve()
    project_root = Path(args.project_root).expanduser().resolve()
    ncert_root = project_root / "ncert_source"
    tracker_path = ncert_root / "ncert_download_tracker.csv"

    if not source.exists():
        print(f"Source not found: {source}")
        return 2
    if not ncert_root.exists():
        print(f"Project ncert_source not found at: {ncert_root}")
        return 2

    pdfs = list(source.rglob("*.pdf"))
    if not pdfs:
        print("No PDFs found under source")
        return 0

    print(f"Found {len(pdfs)} PDFs. Dry-run={args.dry_run}")

    tracker_rows = load_tracker(tracker_path)

    copied = 0
    for pdf in pdfs:
        rel = pdf.relative_to(source).as_posix()
        clazz, subject = find_class_and_subject(pdf.relative_to(source))
        if not clazz:
            clazz = "class-00"
        if not subject:
            subject = "misc"

        dest_dir = ncert_root / clazz / subject
        dest_dir.mkdir(parents=True, exist_ok=True)
        filename = pdf.name
        dest = dest_dir / filename

        print(f"-> {rel}  =>  {clazz}/{subject}/{filename}")
        if not args.dry_run:
            try:
                shutil.copy2(pdf, dest)
            except Exception as e:
                print(f"   ✗ copy failed: {e}")
                continue

        update_or_append_tracker(tracker_rows, clazz, subject, filename, source_rel=rel)
        copied += 0 if args.dry_run else 1

    if not args.dry_run and tracker_rows:
        save_tracker(tracker_path, tracker_rows)
        print(f"Updated tracker: {tracker_path}")

    print(f"Done — copied {copied} files (dry-run={args.dry_run})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
