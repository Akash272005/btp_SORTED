#!/usr/bin/env python3
"""Download NCERT PDFs listed in ncert_download_gaps_*.json into ncert_source/.

Usage:
  python3 scripts/download_ncert_gaps.py
  python3 scripts/download_ncert_gaps.py --class 9 --subject Hindi
  python3 scripts/download_ncert_gaps.py --limit 50 --language English
"""
from __future__ import annotations

import argparse
import csv
import json
import re
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
GAPS_GLOB = "ncert_download_gaps_*.json"
NCERT_ROOT = ROOT / "ncert_source"

SUBJECT_FOLDER = {
    "mathematics": "maths",
    "maths": "maths",
    "social science": "social-science",
    "political science": "political-science",
    "business studies": "business-studies",
    "computer science": "computer-science",
    "informatics practices": "informatics-practices",
    "the world around us": "evs",
    "environmental studies": "evs",
    "physical education and well being": "physical-education",
    "vocational education": "vocational-education",
}

CORE_SUBJECTS_BY_CLASS: dict[range, set[str]] = {
    range(1, 6): {
        "english", "hindi", "mathematics", "maths",
        "the world around us", "environmental studies", "evs",
    },
    range(6, 11): {
        "english", "hindi", "mathematics", "maths", "science",
        "social science", "sanskrit",
    },
    range(11, 13): {
        "english", "hindi", "mathematics", "maths", "physics", "chemistry", "biology",
        "economics", "history", "political science", "geography",
        "accountancy", "business studies", "sociology",
    },
}

REGIONAL_BOOK_MARKERS = (
    "(Bengali)", "(Tamil)", "(Telugu)", "(Gujarati)", "(Marathi)", "(Assamese)",
    "(Odia)", "(Kannada)", "(Malayalam)", "(Punjabi)", "(Maithili)", "(Bodo)",
    "(Dogri)", "(Konkani)", "(Manipuri)", "(Nepali)", "(Santhali)", "(Sindhi)",
    "(Kashmiri)", "(Sanskrit)", "(Gujrati)",
)


def is_core_subject_row(row: dict) -> bool:
    """Core CBSE subjects, English/Hindi/Urdu medium only (no regional editions)."""
    try:
        cls = int(str(row.get("class_key", "")).replace("class-", ""))
    except ValueError:
        return False
    subj = (row.get("subject") or "").lower().strip()
    in_core = any(subj in subs for r, subs in CORE_SUBJECTS_BY_CLASS.items() if cls in r)
    if not in_core:
        return False
    title = row.get("book_title") or ""
    if any(m in title for m in REGIONAL_BOOK_MARKERS):
        return False
    lang = (row.get("language") or "").lower()
    return lang in ("english", "hindi", "urdu", "")


def latest_gaps_file() -> Path:
    audit = ROOT / "data" / "ncert_audit"
    files = sorted(audit.glob(GAPS_GLOB), reverse=True)
    if not files:
        raise SystemExit(f"No gaps file in {audit}. Run build_ncert_official_catalog.py first.")
    return files[0]


def folder_subject(subject: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", subject.lower()).strip("-")
    return SUBJECT_FOLDER.get(slug, slug)


def download(url: str, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = Request(url, headers={"User-Agent": "bixy-ncert-download/1.0"})
    with urlopen(req, timeout=90) as resp:
        data = resp.read()
    if len(data) < 500:
        raise ValueError(f"Response too small ({len(data)} bytes)")
    dest.write_bytes(data)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gaps", type=Path, help="Path to gaps JSON (default: latest)")
    parser.add_argument("--class", dest="class_key", help="e.g. class-9")
    parser.add_argument("--subject", help="Filter by subject name")
    parser.add_argument("--language", help="Filter by language (English/Hindi)")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument(
        "--core-only",
        action="store_true",
        help="Download only core subjects (EN/HI/UR medium, classes 1-12)",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    gaps_path = args.gaps or latest_gaps_file()
    gaps = json.loads(gaps_path.read_text(encoding="utf-8"))
    print(f"Using gaps file: {gaps_path} ({len(gaps)} entries)")

    rows = gaps
    if args.core_only:
        rows = [r for r in rows if is_core_subject_row(r)]
        print(f"Core-only filter: {len(rows)} chapter PDFs")
    if args.class_key:
        rows = [r for r in rows if r.get("class_key") == args.class_key]
    if args.subject:
        rows = [r for r in rows if args.subject.lower() in (r.get("subject") or "").lower()]
    if args.language:
        rows = [r for r in rows if (r.get("language") or "").lower() == args.language.lower()]
    if args.limit:
        rows = rows[: args.limit]

    tracker = NCERT_ROOT / "ncert_download_tracker.csv"
    tracker_fields = [
        "class", "subject", "book_or_chapter", "pdf_filename",
        "source_url", "download_status", "ingest_status", "notes",
    ]
    session_rows: list[dict[str, str]] = []

    ok, fail, skip = 0, 0, 0
    for row in rows:
        cls = row.get("class_key", "")
        subj = folder_subject(row.get("subject", ""))
        raw = row.get("raw_code", "")
        url = row.get("official_ncert_pdf_url", "")
        if not url or not raw:
            continue
        dest = NCERT_ROOT / cls / subj / f"{raw}.pdf"
        if dest.exists() and dest.stat().st_size > 1000:
            skip += 1
            continue
        print(
            f"  {'would download' if args.dry_run else 'downloading'}: {url} -> {dest.relative_to(ROOT)}",
            flush=True,
        )
        if args.dry_run:
            continue
        try:
            download(url, dest)
            ok += 1
            session_rows.append({
                "class": cls,
                "subject": subj,
                "book_or_chapter": row.get("book_title") or raw,
                "pdf_filename": f"{raw}.pdf",
                "source_url": url,
                "download_status": "done",
                "ingest_status": "pending",
                "notes": f"gap download ch={row.get('chapter_number')}",
            })
        except Exception as e:
            fail += 1
            print(f"    ✗ {e}", file=sys.stderr)
        time.sleep(0.08)

    if not args.dry_run and session_rows:
        write_header = not tracker.exists()
        with tracker.open("a" if tracker.exists() else "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(f, fieldnames=tracker_fields)
            if write_header:
                w.writeheader()
            w.writerows(session_rows)

    print(f"\nDone: {ok} downloaded, {skip} skipped (exists), {fail} failed")
    return 0 if fail == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
