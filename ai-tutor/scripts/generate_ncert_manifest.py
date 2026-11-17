#!/usr/bin/env python3
"""Generate web/public/ncert/manifest.json from local ncert_source tree.

Writes a JSON structure:
  { "class-6": { "biology": [ {filename, url, label, medium, book, chapter_num} ] } }

The NCERT e-Pathshala filenames encode metadata:
  Position 0   – class letter  (a=1 … l=12)
  Position 1   – medium        (e=English, h=Hindi)
  Position 2-3 – subject code  (bo=Biology, ph=Physics, mh=Maths, …)
  Position 4   – book number   (1, 2, 3 …)
  Position 5-6 – chapter/extra (01-99 = chapter, ps=Prelims, an=Appendix,
                                 gl=Glossary, gs=Glossary, a1/a2=Appendix 1/2,
                                 sk=Shabdkosh, ex=Extra, dd=combined)
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Dict, List

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ncert_blob_storage import (  # noqa: E402
    MANIFEST_OUT,
    NCERT_SOURCE,
    load_project_env,
    ncert_storage_base_url,
    public_url_for_pdf,
)

# ── Subject code map ──────────────────────────────────────────────────
SUBJECT_CODES = {
    "bo": "Biology",
    "ph": "Physics",
    "ch": "Chemistry",
    "mh": "Maths",
    "ec": "Economics",
    "gy": "Geography",
    "hs": "History",
    "ps": "Political Science",
    "sy": "Sociology",
    "py": "Psychology",
    "ac": "Accountancy",
    "bs": "Business Studies",
    "sc": "Science",
    "ss": "Social Science",
    "es": "Social Science",
    "en": "English",
    "fl": "English (Flamingo)",
    "kl": "English (Kaleidoscope)",
    "vt": "English (Vistas)",
    "hd": "English (Honeydew)",
    "ih": "English (It So Happened)",
    "hc": "English (Honeycomb)",
    "ah": "English (An Alien Hand)",
    "pr": "English (A Pact with the Sun)",
    "ml": "Hindi",
    "at": "Hindi (Aroh/Antara)",
    "ar": "Hindi (Aaroh)",
    "an": "Hindi (Antra)",
    "dv": "Hindi (Durva)",
    "bk": "Hindi (Bharat Ki Khoj)",
    "vs": "Hindi (Vasant)",
    "jm": "Maths (Joyful Maths)",
    "gp": "Maths (Ganit ka Jaadu)",
    "cu": "Science (Curiosity)",
}

# ── Special suffix map ────────────────────────────────────────────────
SUFFIX_MAP = {
    "ps": "Prelims / Contents",
    "an": "Appendix",
    "gl": "Glossary",
    "gs": "Glossary",
    "sk": "Shabdkosh",
    "ex": "Extra Material",
    "dd": "Combined",
}


def _decode_filename(stem: str) -> Dict[str, str]:
    """Try to decode the NCERT e-Pathshala filename into a human label."""
    # Remove trailing dots (e.g. "leac101." → "leac101")
    stem = stem.rstrip(".")
    if len(stem) < 6:
        return {"label": stem}

    medium_code = stem[1]
    medium = "English" if medium_code == "e" else ("Hindi" if medium_code == "h" else "")
    subj_code = stem[2:4]
    subject_name = SUBJECT_CODES.get(subj_code, subj_code.upper())

    book_num = stem[4]
    tail = stem[5:]  # chapter number or special suffix

    # Check for special suffixes
    if tail in SUFFIX_MAP:
        label = SUFFIX_MAP[tail]
        if book_num.isdigit() and int(book_num) > 1:
            label = f"Book {book_num} – {label}"
        return {"label": label, "medium": medium, "subject_decoded": subject_name}

    # Appendix variants like "a1", "a2"
    if tail.startswith("a") and tail[1:].isdigit():
        app_num = tail[1:]
        label = f"Appendix {app_num}"
        if book_num.isdigit() and int(book_num) > 1:
            label = f"Book {book_num} – {label}"
        return {"label": label, "medium": medium, "subject_decoded": subject_name}

    # Chapter numbers
    if tail.isdigit():
        ch = int(tail)
        label = f"Ch {ch}"
        if book_num.isdigit() and int(book_num) > 1:
            label = f"Book {book_num} – Ch {ch}"
        return {"label": label, "medium": medium, "subject_decoded": subject_name}

    return {"label": stem, "medium": medium, "subject_decoded": subject_name}


def build_manifest(
    root: Path,
    *,
    base_url: str | None = None,
    medium_codes: tuple[str, ...] | None = None,
) -> Dict[str, Dict[str, List[Dict[str, str]]]]:
    """Build manifest from ncert_source tree.

    If ``base_url`` is set (e.g. Azure NCERT_STORAGE_BASE_URL), entries point at blob.
    Otherwise URLs are local paths under ``/ncert/`` (dev static files).
    """
    manifest: Dict[str, Dict[str, List[Dict[str, str]]]] = {}
    for dirpath, _, filenames in os.walk(root):
        rel = os.path.relpath(dirpath, root)
        if rel == ".":
            continue
        parts = rel.split(os.sep)
        if len(parts) < 2:
            continue
        cls, subj = parts[0], parts[1]
        manifest.setdefault(cls, {}).setdefault(subj, [])
        for f in sorted(filenames):
            if not f.lower().endswith(".pdf"):
                continue
            stem = os.path.splitext(f)[0]
            if medium_codes and (len(stem) < 2 or stem[1] not in medium_codes):
                continue
            if base_url:
                url = public_url_for_pdf(f"{cls}/{subj}/{f}", base_url)
            else:
                url = f"/ncert/{cls}/{subj}/{f}"
            decoded = _decode_filename(stem)
            medium = decoded.get("medium", "")
            label = decoded.get("label", stem)

            # Prefix with medium emoji for clarity
            if medium == "Hindi":
                display = f"🇮🇳 {label}"
            elif medium == "English":
                display = f"🇬🇧 {label}"
            else:
                display = label

            manifest[cls][subj].append({
                "filename": f,
                "url": url,
                "label": display,
                "medium": medium,
                "raw_code": stem,
            })

    # Sort entries within each subject: English first, then Hindi; chapters ascending
    def _sort_key(item: Dict[str, str]) -> tuple:
        medium_order = 0 if item.get("medium") == "English" else 1
        code = item.get("raw_code", "")
        # Extract trailing digits for numeric sort
        m = re.search(r"(\d+)$", code)
        num = int(m.group(1)) if m else 999
        return (medium_order, num, code)

    for cls in manifest:
        for subj in manifest[cls]:
            manifest[cls][subj].sort(key=_sort_key)

    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generate web/public/ncert/manifest.json from ncert_source/",
    )
    parser.add_argument("--source", type=Path, default=NCERT_SOURCE)
    parser.add_argument(
        "--blob",
        action="store_true",
        help="Use NCERT_STORAGE_BASE_URL from .env (Azure blob URLs)",
    )
    parser.add_argument(
        "--base-url",
        help="Override public base URL (trailing slash optional)",
    )
    parser.add_argument(
        "--local",
        action="store_true",
        help="Force local /ncert/... URLs (default when neither --blob nor --base-url)",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=MANIFEST_OUT,
        help=f"Output manifest path (default: {MANIFEST_OUT})",
    )
    parser.add_argument(
        "--no-backup",
        action="store_true",
        help="Do not copy existing manifest to manifest.json.bak",
    )
    parser.add_argument(
        "--english-hindi-only",
        action="store_true",
        help="Include only PDFs whose raw_code medium is e (English) or h (Hindi)",
    )
    args = parser.parse_args()

    load_project_env()
    ncert_root = args.source.resolve()
    out_file = args.out.resolve()
    out_file.parent.mkdir(parents=True, exist_ok=True)

    if not ncert_root.exists():
        print("ncert_source/ not found")
        return 2

    base_url: str | None = None
    if args.base_url:
        base_url = args.base_url.rstrip("/") + "/"
    elif args.blob:
        base_url = ncert_storage_base_url()
    elif not args.local:
        # Default to blob when credentials/base URL are configured (production path).
        env_url = os.getenv("NCERT_STORAGE_BASE_URL", "").strip()
        if env_url:
            base_url = ncert_storage_base_url()

    medium_codes: tuple[str, ...] | None = ("e", "h") if args.english_hindi_only else None
    manifest = build_manifest(ncert_root, base_url=base_url, medium_codes=medium_codes)
    total_pdfs = sum(len(files) for cls in manifest.values() for files in cls.values())

    if out_file.exists() and not args.no_backup:
        backup = out_file.with_suffix(".json.bak")
        shutil.copy2(out_file, backup)
        print(f"Backed up existing manifest → {backup}")

    out_file.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    url_mode = f"blob ({base_url})" if base_url else "local (/ncert/...)"
    print(f"✅ Wrote manifest: {out_file}")
    print(f"   URL mode: {url_mode}")
    print(f"   Classes: {len(manifest)}, Total PDFs: {total_pdfs}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
