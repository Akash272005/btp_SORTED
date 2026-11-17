#!/usr/bin/env python3
"""Build verified NCERT catalog (classes 1–12) from ncert.nic.in and compare with local manifest.

Output hierarchy:
  Class → Subject → Book → Chapters (number, name, PDF URL, verification status)

Usage:
  python3 scripts/build_ncert_official_catalog.py
  python3 scripts/build_ncert_official_catalog.py --verify-limit 50
  python3 scripts/build_ncert_official_catalog.py --class 10
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from pypdf import PdfReader
except ImportError:
    PdfReader = None  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "web" / "public" / "ncert" / "manifest.json"
CHAPTER_NAMES = ROOT / "web" / "public" / "ncert" / "chapter_names.json"
PDF_TITLES = ROOT / "web" / "public" / "ncert" / "pdf_titles.json"
TITLE_CACHE = ROOT / "data" / "ncert_audit" / "pdf_title_cache.json"
OUT_DIR = ROOT / "data" / "ncert_audit"

NCERT_BASE = "https://ncert.nic.in"
TEXTBOOK_PHP = f"{NCERT_BASE}/textbook.php"
PDF_BASE = f"{NCERT_BASE}/textbook/pdf"

CLASS_LETTERS = {i: chr(ord("a") + i - 1) for i in range(1, 13)}  # 1=a … 12=l
LETTER_CLASS = {v: k for k, v in CLASS_LETTERS.items()}

SUBJECT_CODES = {
    "bo": "Biology", "ph": "Physics", "ch": "Chemistry", "mh": "Mathematics",
    "ec": "Economics", "gy": "Geography", "hs": "History", "ps": "Political Science",
    "sy": "Sociology", "py": "Psychology", "ac": "Accountancy", "bs": "Business Studies",
    "sc": "Science", "ss": "Social Science", "es": "Social Science", "en": "English",
    "fl": "English", "kl": "English", "vt": "English", "hd": "English", "ih": "English",
    "hc": "English", "ah": "English", "pr": "English", "ml": "Hindi", "at": "Hindi",
    "ar": "Hindi", "an": "Hindi", "dv": "Hindi", "bk": "Hindi", "vs": "Hindi",
    "jm": "Mathematics", "gp": "Mathematics", "cu": "Science", "mm": "Mathematics",
    "ev": "The World Around Us", "sr": "Hindi", "ve": "Hindi", "sa": "English",
    "bu": "Arts", "ky": "Physical Education and Well Being", "kb": "Vocational Education",
    "kr": "Hindi", "ks": "Hindi", "sp": "Hindi", "ga": "Hindi", "be": "English",
    "mo": "English", "we": "English", "ff": "English", "fp": "English", "hp": "Health and Physical Education",
    "lm": "ICT", "ep": "Exemplar", "pr": "English", "de": "Sanskrit", "sh": "Sanskrit",
    "sk": "Sanskrit", "va": "Sanskrit", "ab": "Sanskrit", "es": "Social Science",
    "ee": "Social Science", "he": "Social Science", "ue": "Social Science",
    "ap": "Environmental Studies", "rd": "English", "mr": "English", "rd": "English",
    "uri": "Mathematics", "ma": "Mathematics", "mh": "Mathematics",
}

SUFFIX_LABELS = {
    "ps": "Prelims / Contents",
    "an": "Appendix",
    "gl": "Glossary",
    "gs": "Glossary",
    "sk": "Shabdkosh",
    "ex": "Extra Material",
    "dd": "Complete Book (ZIP)",
    "a1": "Appendix 1",
    "a2": "Appendix 2",
    "lp": "Learning Points",
}

# Rationalized Class 10 Mathematics (2025-26): Constructions removed, 14 chapters
C10_MATHS_CHAPTERS = {
    1: "Real Numbers", 2: "Polynomials", 3: "Pair of Linear Equations in Two Variables",
    4: "Quadratic Equations", 5: "Arithmetic Progressions", 6: "Triangles",
    7: "Coordinate Geometry", 8: "Introduction to Trigonometry",
    9: "Some Applications of Trigonometry", 10: "Circles",
    11: "Areas Related to Circles", 12: "Surface Areas and Volumes",
    13: "Statistics", 14: "Probability",
}

UA = "bixy-ncert-catalog/1.0"


def normalize_title(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def extract_pdf_title(pdf_bytes: bytes) -> str:
    if PdfReader is None:
        return ""
    reader = PdfReader(BytesIO(pdf_bytes))
    if not reader.pages:
        return ""
    text = (reader.pages[0].extract_text() or "").strip()
    if not text:
        return ""
    m = re.search(r"chapter\s*\d+\s*[:\-–]\s*(.+?)(?:\n|$)", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()[:120]
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines[:6]:
        letters = re.sub(r"[^A-Za-z]", "", ln)
        if len(letters) >= 8 and letters.isupper():
            half = len(ln) // 2
            if half > 10 and ln[:half].strip().upper() == ln[half:].strip().upper():
                return ln[:half].strip().title()
            return ln.strip().title()
    for ln in lines[:4]:
        if len(ln) >= 6 and not ln.lower().startswith("ncert"):
            return ln[:120]
    return lines[0][:120] if lines else ""


def fetch_url(url: str, timeout: int = 25, method: str = "GET") -> tuple[int, bytes, dict[str, str]]:
    req = Request(url, headers={"User-Agent": UA}, method=method)
    try:
        with urlopen(req, timeout=timeout) as resp:
            headers = {k.lower(): v for k, v in resp.headers.items()}
            data = resp.read() if method == "GET" else b""
            return resp.status, data, headers
    except HTTPError as e:
        return e.code, b"", {}
    except (URLError, TimeoutError, OSError):
        return 0, b"", {}


def verify_pdf_url(url: str) -> dict[str, Any]:
    status, _, headers = fetch_url(url, method="HEAD")
    if status in (405, 501, 0):
        status, data, headers = fetch_url(url, method="GET")
        size = len(data)
    else:
        size = int(headers.get("content-length", 0) or 0)
    ctype = headers.get("content-type", "")
    valid = status == 200 and ("pdf" in ctype.lower() or url.lower().endswith(".pdf"))
    if status == 200 and size > 1000 and not valid:
        valid = True  # NCERT sometimes omits content-type
    return {
        "http_status": status,
        "content_length": size,
        "content_type": ctype,
        "pdf_verification_status": "valid" if valid else "invalid",
    }


def decode_book_code(code: str) -> dict[str, Any]:
    """Decode NCERT filename prefix (e.g. jemh1 → class 10 English Maths book 1)."""
    code = code.rstrip(".")
    if len(code) < 5:
        return {}
    cls_letter = code[0]
    medium_code = code[1]
    subj_code = code[2:4]
    book_num = code[4]
    medium = {"e": "English", "h": "Hindi", "u": "Urdu"}.get(medium_code, medium_code)
    if len(code) > 5 and code[2:5] in ("mrj", "bnj", "knj", "tmj", "tlj", "orj", "sij", "ksj", "dgj", "npj", "skj", "snj", "mnj", "koj", "asj", "bdj", "mtj", "mlj", "pnj", "gj", "mr", "bn", "kn", "tm", "tl", "or", "si", "ks", "dg", "np", "sk", "sn", "mn", "ko", "as", "bd", "mt", "ml", "pn"):
        pass  # regional language codes – medium from book title
    return {
        "class_num": LETTER_CLASS.get(cls_letter),
        "medium": medium,
        "subject_code": subj_code,
        "subject_decoded": SUBJECT_CODES.get(subj_code, subj_code.upper()),
        "book_number": int(book_num) if book_num.isdigit() else book_num,
    }


def raw_code_from_book(book_code: str, chapter_num: int | None, suffix: str | None = None) -> str:
    if suffix:
        return f"{book_code}{suffix}"
    if chapter_num is None:
        return f"{book_code}ps"
    return f"{book_code}{chapter_num:02d}"


def chapter_entries_for_book(book_code: str, chapter_count: int) -> list[dict[str, Any]]:
    """Generate chapter + extras entries for a book."""
    entries: list[dict[str, Any]] = []

    # Prelims
    entries.append({
        "chapter_number": None,
        "chapter_name": SUFFIX_LABELS["ps"],
        "raw_code": raw_code_from_book(book_code, None, "ps"),
        "suffix": "ps",
    })

    for n in range(1, chapter_count + 1):
        name = ""
        if book_code == "jemh1":
            name = C10_MATHS_CHAPTERS.get(n, "")
        entries.append({
            "chapter_number": n,
            "chapter_name": name,
            "raw_code": raw_code_from_book(book_code, n),
            "suffix": f"{n:02d}",
        })

    # Common extras – verified separately
    for suf in ("a1", "a2", "an", "gl", "gs"):
        entries.append({
            "chapter_number": None,
            "chapter_name": SUFFIX_LABELS.get(suf, suf),
            "raw_code": raw_code_from_book(book_code, None, suf),
            "suffix": suf,
            "optional": True,
        })
    return entries


def parse_ncert_textbook_php(html: str) -> list[dict[str, Any]]:
    """Extract class → subject → book entries from textbook.php JavaScript."""
    entries: list[dict[str, Any]] = []
    book_pat = re.compile(
        r'tbook\.options\[\d+\]\.text="([^"]*)";\s*'
        r'document\.test\.tbook\.options\[\d+\]\.value="textbook\.php\?([a-z0-9]+)=([0-9]+-[0-9]+)"\s*;?',
    )
    parts = re.split(
        r'else if\(\(document\.test\.tclass\.value==(\d+)\) && '
        r'\(document\.test\.tsubject\.options\[sind\]\.text=="([^"]+)"\)\)',
        html,
    )
    for i in range(1, len(parts) - 2, 3):
        cls = int(parts[i])
        subject = parts[i + 1]
        body = parts[i + 2]
        for title, code, range_ in book_pat.findall(body):
            if title.startswith("..Select") or not title.strip():
                continue
            _start, end = range_.split("-")
            lang = _detect_language(title, code)
            entries.append({
                "class": cls,
                "class_key": f"class-{cls}",
                "subject": subject,
                "book_title": title.strip(),
                "book_code": code,
                "book_url": f"{TEXTBOOK_PHP}?{code}={range_}",
                "chapter_count": int(end),
                "language": lang,
                "is_nep_candidate": _is_nep_book(title, code, cls),
            })
    return entries


def _detect_language(title: str, code: str) -> str:
    if "(Hindi)" in title or "(hindi)" in title.lower():
        return "Hindi"
    if "(Urdu)" in title or "(urdu)" in title.lower():
        return "Urdu"
    if "Ganit" in title or title in ("Vigyan", "Kshitij", "Sparsh", "Kritika"):
        return "Hindi"
    if "Riyazi" in title or "Tajassus" in title or "Jigyasa" in title:
        if "Jigyasa" in title:
            return "Hindi"
        return "Urdu"
    decoded = decode_book_code(code)
    return decoded.get("medium", "English") or "English"


def _is_nep_book(title: str, code: str, cls: int) -> bool:
    """Heuristic: NEP 2020 aligned books (new series)."""
    nep_markers = [
        "Joyful", "Mridang", "Sarangi", "Santoor", "Veena", "Math-Mela", "Maths Mela",
        "Our Wondrous", "Our Wonderous", "Bansuri", "Khel Yoga", "Khel Yatra",
        "Poorvi", "Curiosity", "Jigyasa", "Ganita Prakash", "Malhar", "Deepakam",
        "Exploring Society", "Kaveri", "Ganga", "Ganita Manjari", "Exploration", "Sharada",
        "Kaushal Bodh", "Kriti",
    ]
    old_markers = ["Marigold", "Honeydew", "Rimjhim", "Math-Magic", "Looking Around", "Vigyan", "Beehive"]
    t = title
    if any(m in t for m in nep_markers):
        return True
    if any(m in t for m in old_markers) and cls <= 8:
        return False
    return cls >= 6


def slug_subject(subject: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", subject.lower()).strip("-")


def load_json(path: Path) -> Any:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def index_manifest(manifest: dict) -> dict[str, dict]:
    """raw_code → {class, subject, url, label, ...}"""
    idx: dict[str, dict] = {}
    for cls, subs in manifest.items():
        for subj, files in subs.items():
            for f in files:
                raw = (f.get("raw_code") or "").rstrip(".")
                if raw:
                    idx[raw] = {**f, "class_key": cls, "subject_key": subj}
    return idx


def get_chapter_name(
    class_key: str,
    subject_key: str,
    raw_code: str,
    chapter_names: dict,
    pdf_titles: dict,
    title_cache: dict,
) -> str:
    name = (
        chapter_names.get(class_key, {}).get(subject_key, {}).get(raw_code)
        or chapter_names.get(class_key, {}).get(subject_key, {}).get(raw_code + ".")
        or pdf_titles.get(raw_code)
        or title_cache.get(raw_code)
        or ""
    )
    return (name or "").strip()


MANIFEST_SUBJECT_ALIASES = {
    "mathematics": "maths",
    "maths": "maths",
    "social science": "social-science",
    "social-science": "social-science",
    "the world around us": "evs",
    "environmental studies": "evs",
    "physical education and well being": "physical-education",
    "health and physical education": "physical-education",
    "vocational education": "vocational-education",
    "political science": "political-science",
    "business studies": "business-studies",
    "computer science": "computer-science",
    "informatics practices": "informatics-practices",
    "creative writing and translation": "creative-writing",
    "creative writing & translation": "creative-writing",
    "fine art": "fine-art",
    "home science": "home-science",
}


def manifest_subject_key(official_subject: str) -> str:
    slug = slug_subject(official_subject)
    return MANIFEST_SUBJECT_ALIASES.get(slug, slug)


def load_curated_chapter_names() -> dict[str, str]:
    """Load raw_code → title from scripts/generate_chapter_names.py."""
    path = ROOT / "scripts" / "generate_chapter_names.py"
    if not path.exists():
        return {}
    text = path.read_text(encoding="utf-8")
    m = re.search(r"CHAPTER_NAMES\s*=\s*\{", text)
    if not m:
        return {}
    # Safe-ish eval of string dict literals only
    start = m.end() - 1
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                blob = text[start : i + 1]
                try:
                    data = eval(blob, {"__builtins__": {}})  # noqa: S307
                    if isinstance(data, dict):
                        return {str(k): str(v) for k, v in data.items()}
                except Exception:
                    pass
                break
    return {}


def build_catalog(
    books: list[dict[str, Any]],
    manifest_idx: dict[str, dict],
    chapter_names: dict,
    pdf_titles: dict,
    title_cache: dict,
    curated_names: dict[str, str],
    *,
    verify_pdfs: bool = True,
    verify_workers: int = 12,
    class_filter: int | None = None,
    verify_limit: int = 0,
) -> dict[str, Any]:
    """Build full catalog with verification."""
    if class_filter:
        books = [b for b in books if b["class"] == class_filter]

    pdf_tasks: list[tuple[str, str]] = []
    for book in books:
        for ch in chapter_entries_for_book(book["book_code"], book["chapter_count"]):
            pdf_tasks.append((ch["raw_code"], f"{PDF_BASE}/{ch['raw_code']}.pdf"))

    seen: set[str] = set()
    unique_tasks: list[tuple[str, str]] = []
    for raw, url in pdf_tasks:
        if raw not in seen:
            seen.add(raw)
            unique_tasks.append((raw, url))
    if verify_limit:
        unique_tasks = unique_tasks[:verify_limit]

    verification: dict[str, dict] = {}
    if verify_pdfs and unique_tasks:
        print(f"Verifying {len(unique_tasks)} official PDF URLs…", flush=True)
        done = 0
        with ThreadPoolExecutor(max_workers=verify_workers) as pool:
            futs = {pool.submit(verify_pdf_url, url): raw for raw, url in unique_tasks}
            for fut in as_completed(futs):
                raw = futs[fut]
                verification[raw] = fut.result()
                done += 1
                if done % 200 == 0:
                    print(f"  verified {done}/{len(unique_tasks)}", flush=True)

    # Build catalog with verification + local match status
    by_class: dict[str, dict] = {}
    flags: list[dict] = []
    stats = {
        "books": 0, "chapters": 0, "official_valid": 0, "official_invalid": 0,
        "in_local_manifest": 0, "missing_local": 0, "outdated_books": 0,
    }

    for book in books:
        cls_key = book["class_key"]
        subj_slug = manifest_subject_key(book["subject"])
        by_class.setdefault(cls_key, {"class": book["class"], "subjects": {}})

        chapters = chapter_entries_for_book(book["book_code"], book["chapter_count"])
        ch_out = []
        for ch in chapters:
            raw = ch["raw_code"]
            official_url = f"{PDF_BASE}/{raw}.pdf"
            local = manifest_idx.get(raw) or manifest_idx.get(raw + ".")
            ver = verification.get(raw, {})
            status = ver.get("pdf_verification_status", "not_checked")

            name = (
                ch.get("chapter_name")
                or curated_names.get(raw)
                or get_chapter_name(cls_key, subj_slug, raw, chapter_names, pdf_titles, title_cache)
            )
            if not name and ch.get("chapter_number") and book["book_code"] == "jemh1":
                name = C10_MATHS_CHAPTERS.get(ch["chapter_number"], "")

            # Title from PDF if we verified and have no name
            pdf_title = ""
            if status == "valid" and not name and PdfReader is not None:
                _, data, _ = fetch_url(official_url)
                if data:
                    pdf_title = extract_pdf_title(data)
                    name = pdf_title

            local_match = "present" if local else "missing"
            if local and status == "valid":
                local_match = "matched"
            elif local and status == "invalid":
                local_match = "local_only_unverified_official"

            discrepancy = []
            if status == "invalid" and not ch.get("optional"):
                discrepancy.append("official_pdf_unreachable")
            if not local and status == "valid" and not ch.get("optional"):
                discrepancy.append("missing_in_local_manifest")
            if local and not book.get("is_nep_candidate") and book["class"] <= 8:
                discrepancy.append("possibly_old_edition")

            ch_entry = {
                "chapter_number": ch.get("chapter_number"),
                "chapter_name": name,
                "raw_code": raw,
                "book_code": book["book_code"],
                "official_ncert_pdf_url": official_url,
                "local_manifest_url": local.get("url", "") if local else "",
                "pdf_verification_status": status,
                "http_status": ver.get("http_status"),
                "content_length": ver.get("content_length"),
                "local_manifest_status": local_match,
                "discrepancy_flags": discrepancy,
                "optional": ch.get("optional", False),
            }
            ch_out.append(ch_entry)
            stats["chapters"] += 1
            if status == "valid":
                stats["official_valid"] += 1
            elif status == "not_checked":
                pass
            else:
                stats["official_invalid"] += 1
            if local:
                stats["in_local_manifest"] += 1
            elif status == "valid" and not ch.get("optional"):
                stats["missing_local"] += 1
                flags.append({
                    "type": "missing_local",
                    "class": cls_key,
                    "subject": book["subject"],
                    "book": book["book_title"],
                    "raw_code": raw,
                    "official_url": official_url,
                })

        # Filter optional chapters that don't exist
        ch_out_filtered = [
            c for c in ch_out
            if not c.get("optional") or c.get("pdf_verification_status") == "valid"
        ]

        book_entry = {
            "book_title": book["book_title"],
            "book_code": book["book_code"],
            "book_url": book["book_url"],
            "language": book["language"],
            "chapter_count": book["chapter_count"],
            "is_nep_aligned": book.get("is_nep_candidate", False),
            "publication_edition_notes": "Reprint 2026-27 seen on several Class 10 PDFs",
            "chapters": ch_out_filtered,
        }
        by_class[cls_key]["subjects"].setdefault(book["subject"], {"books": []})
        by_class[cls_key]["subjects"][book["subject"]]["books"].append(book_entry)
        stats["books"] += 1
        if not book.get("is_nep_candidate") and book["class"] <= 9:
            stats["outdated_books"] += 1

    return {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "official_source": TEXTBOOK_PHP,
            "pdf_base": PDF_BASE,
            "local_manifest": str(MANIFEST.relative_to(ROOT)),
            "stats": stats,
        },
        "flags": flags[:500],
        "catalog": by_class,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Build verified NCERT official catalog")
    parser.add_argument("--class", type=int, dest="class_num", help="Limit to one class (1-12)")
    parser.add_argument("--no-verify", action="store_true", help="Skip PDF URL verification")
    parser.add_argument("--verify-limit", type=int, default=0, help="Max PDFs to verify (0=all)")
    parser.add_argument("--workers", type=int, default=12)
    args = parser.parse_args()

    print("Fetching NCERT textbook.php…", flush=True)
    status, html_bytes, _ = fetch_url(TEXTBOOK_PHP)
    if status != 200:
        print(f"Failed to fetch textbook.php (HTTP {status})", file=sys.stderr)
        return 1
    html = html_bytes.decode("utf-8", errors="ignore")

    books = parse_ncert_textbook_php(html)
    print(f"Parsed {len(books)} official books from NCERT", flush=True)

    manifest = load_json(MANIFEST)
    chapter_names = load_json(CHAPTER_NAMES)
    pdf_titles = load_json(PDF_TITLES)
    title_cache = load_json(TITLE_CACHE)
    curated_names = load_curated_chapter_names()
    manifest_idx = index_manifest(manifest) if manifest else {}

    catalog = build_catalog(
        books,
        manifest_idx,
        chapter_names,
        pdf_titles,
        title_cache,
        curated_names,
        verify_pdfs=not args.no_verify,
        verify_workers=args.workers,
        class_filter=args.class_num,
        verify_limit=args.verify_limit,
    )

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d")
    suffix = f"_class-{args.class_num}" if args.class_num else ""
    out_path = OUT_DIR / f"ncert_official_catalog_{stamp}{suffix}.json"
    out_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False), encoding="utf-8")

    # Flat array for RAG / download tooling
    flat: list[dict[str, Any]] = []
    for cls_key, cls_data in catalog.get("catalog", {}).items():
        for subject, subj_data in cls_data.get("subjects", {}).items():
            for book in subj_data.get("books", []):
                for ch in book.get("chapters", []):
                    flat.append({
                        "class": cls_data.get("class"),
                        "class_key": cls_key,
                        "subject": subject,
                        "book_title": book.get("book_title"),
                        "book_code": book.get("book_code"),
                        "language": ch.get("language") or book.get("language"),
                        "chapter_number": ch.get("chapter_number"),
                        "chapter_name": ch.get("chapter_name"),
                        "raw_code": ch.get("raw_code"),
                        "official_ncert_pdf_url": ch.get("official_ncert_pdf_url"),
                        "local_manifest_url": ch.get("local_manifest_url"),
                        "pdf_verification_status": ch.get("pdf_verification_status"),
                        "local_manifest_status": ch.get("local_manifest_status"),
                        "discrepancy_flags": ch.get("discrepancy_flags"),
                        "is_nep_aligned": book.get("is_nep_aligned"),
                    })
    flat_path = OUT_DIR / f"ncert_official_catalog_{stamp}{suffix}_flat.json"
    flat_path.write_text(json.dumps(flat, indent=2, ensure_ascii=False), encoding="utf-8")

    # Download gaps: valid on NCERT but missing locally
    gaps = [
        {
            "class_key": row["class_key"],
            "subject": row["subject"],
            "book_title": row["book_title"],
            "raw_code": row["raw_code"],
            "chapter_number": row["chapter_number"],
            "chapter_name": row["chapter_name"],
            "official_ncert_pdf_url": row["official_ncert_pdf_url"],
            "language": row["language"],
        }
        for row in flat
        if row.get("pdf_verification_status") == "valid"
        and row.get("local_manifest_status") == "missing"
        and row.get("chapter_number") is not None
    ]
    gaps_path = OUT_DIR / f"ncert_download_gaps_{stamp}{suffix}.json"
    gaps_path.write_text(json.dumps(gaps, indent=2, ensure_ascii=False), encoding="utf-8")

    # Compact summary
    summary_path = OUT_DIR / f"ncert_official_catalog_{stamp}{suffix}_summary.txt"
    s = catalog["meta"]["stats"]
    lines = [
        "NCERT Official Catalog Audit",
        f"Generated: {catalog['meta']['generated_at']}",
        f"Books: {s['books']}",
        f"Chapter entries: {s['chapters']}",
        f"Official PDF valid: {s['official_valid']}",
        f"Official PDF invalid: {s['official_invalid']}",
        f"In local manifest: {s['in_local_manifest']}",
        f"Missing locally (valid official): {s['missing_local']}",
        f"Possibly outdated books: {s['outdated_books']}",
        f"Flags recorded: {len(catalog['flags'])}",
        f"Download gaps (valid official, missing local): {len(gaps)}",
        "",
        f"Full catalog: {out_path}",
        f"Flat catalog:  {flat_path}",
        f"Download gaps: {gaps_path}",
    ]
    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

    comparison_path = OUT_DIR / f"ncert_curriculum_comparison_{stamp}{suffix}.json"
    _write_comparison_summary(catalog, flat, gaps, comparison_path, out_path)

    print("\n".join(lines))
    print(f"Comparison:    {comparison_path}")
    return 0


def _write_comparison_summary(
    catalog: dict[str, Any],
    flat: list[dict[str, Any]],
    gaps: list[dict[str, Any]],
    path: Path,
    catalog_path: Path,
) -> None:
    """Write per-class subject status summary."""
    classes_summary: dict[str, Any] = {}
    for cls_key, cls_data in catalog.get("catalog", {}).items():
        try:
            n = int(str(cls_key).replace("class-", ""))
        except ValueError:
            continue
        if n < 1 or n > 12:
            continue
        subjects: dict[str, Any] = {}
        for subj_name, subj_data in cls_data.get("subjects", {}).items():
            books_out = []
            for book in subj_data.get("books", []):
                ch_valid = sum(
                    1 for c in book["chapters"]
                    if c.get("pdf_verification_status") == "valid" and c.get("chapter_number")
                )
                ch_local = sum(
                    1 for c in book["chapters"]
                    if c.get("local_manifest_url") and c.get("chapter_number")
                )
                status = "missing_local"
                if ch_valid and ch_local >= ch_valid:
                    status = "complete_local"
                elif ch_local > 0:
                    status = "partial_local"
                books_out.append({
                    "book_title": book["book_title"],
                    "book_code": book["book_code"],
                    "language": book["language"],
                    "is_nep_aligned": book.get("is_nep_aligned"),
                    "chapters_valid_on_ncert": ch_valid,
                    "chapters_in_local_manifest": ch_local,
                    "status": status,
                })
            subjects[subj_name] = {"books": books_out}
        classes_summary[cls_key] = {"class_number": n, "subjects": subjects}

    comparison = {
        "meta": {
            "generated_at": catalog["meta"]["generated_at"],
            "official_source": TEXTBOOK_PHP,
            "full_catalog": str(catalog_path.relative_to(ROOT)),
        },
        "summary": catalog["meta"]["stats"],
        "download_gaps_count": len(gaps),
        "classes_1_to_12": classes_summary,
        "recommendations": [
            "Run scripts/download_ncert_gaps.py for missing official PDFs",
            "Update web/public/ncert/manifest.json after new downloads (generate_ncert_manifest.py)",
            "Re-run this script after manifest changes",
        ],
    }
    path.write_text(json.dumps(comparison, indent=2, ensure_ascii=False), encoding="utf-8")


if __name__ == "__main__":
    raise SystemExit(main())
