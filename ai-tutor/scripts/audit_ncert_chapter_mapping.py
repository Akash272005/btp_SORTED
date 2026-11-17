#!/usr/bin/env python3
"""Audit NCERT manifest PDFs vs chapter_names.json titles.

Fetches each PDF (first page), extracts a title heuristic, and compares with
the mapped chapter name. Writes a JSON report under data/.

Usage:
  python3 scripts/audit_ncert_chapter_mapping.py
  python3 scripts/audit_ncert_chapter_mapping.py --class class-8
  python3 scripts/audit_ncert_chapter_mapping.py --workers 12 --limit 50
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

try:
    from pypdf import PdfReader
except ImportError:
    print("Install pypdf: pip install pypdf", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent
MANIFEST = ROOT / "web" / "public" / "ncert" / "manifest.json"
CHAPTER_NAMES = ROOT / "web" / "public" / "ncert" / "chapter_names.json"
REPORT_DIR = ROOT / "data" / "ncert_audit"


def normalize_title(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def extract_pdf_title(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    if not reader.pages:
        return ""
    text = (reader.pages[0].extract_text() or "").strip()
    if not text:
        return ""

    # CHAPTER 4: Combustion and Flame
    m = re.search(
        r"chapter\s*\d+\s*[:\-–]\s*(.+?)(?:\n|$)",
        text,
        re.IGNORECASE,
    )
    if m:
        return m.group(1).strip()[:120]

    # ALL CAPS block at start (common NCERT layout)
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines[:6]:
        letters = re.sub(r"[^A-Za-z]", "", ln)
        if len(letters) >= 8 and letters.isupper():
            # De-duplicate doubled titles (e.g. "COMBUSTION AND FLAME" twice)
            half = len(ln) // 2
            if half > 10 and ln[:half].strip().upper() == ln[half:].strip().upper():
                return ln[:half].strip().title()
            return ln.strip().title()

    # First substantial line
    for ln in lines[:4]:
        if len(ln) >= 6 and not ln.lower().startswith("ncert"):
            return ln[:120]
    return lines[0][:120] if lines else ""


def title_similarity(expected: str, actual: str) -> float:
    a = normalize_title(expected)
    b = normalize_title(actual)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.85
    aw = set(a.split())
    bw = set(b.split())
    if not aw or not bw:
        return 0.0
    overlap = len(aw & bw) / max(len(aw), len(bw))
    return overlap


@dataclass
class AuditRow:
    class_key: str
    subject_key: str
    raw_code: str
    url: str
    mapped_title: str
    pdf_title: str
    similarity: float
    status: str  # ok | mismatch | missing_pdf | no_title | no_mapping
    error: str = ""


def fetch_pdf(url: str, timeout: int = 25) -> bytes:
    req = Request(url, headers={"User-Agent": "bixy-ncert-audit/1.0"})
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def audit_one(
    class_key: str,
    subject_key: str,
    entry: dict[str, Any],
    chapter_names: dict,
    threshold: float,
) -> AuditRow:
    raw = entry.get("raw_code", "")
    url = entry.get("url", "")
    mapped = (
        chapter_names.get(class_key, {})
        .get(subject_key, {})
        .get(raw, "")
        .strip()
    )
    if not mapped:
        mapped = re.sub(r"^🇬🇧 |^🇮🇳 ", "", entry.get("label", "")).strip()

    try:
        pdf_bytes = fetch_pdf(url)
        pdf_title = extract_pdf_title(pdf_bytes)
    except HTTPError as e:
        return AuditRow(
            class_key, subject_key, raw, url, mapped, "", 0.0, "missing_pdf",
            error=f"HTTP {e.code}",
        )
    except (URLError, TimeoutError, OSError) as e:
        return AuditRow(
            class_key, subject_key, raw, url, mapped, "", 0.0, "missing_pdf",
            error=str(e)[:120],
        )
    except Exception as e:
        return AuditRow(
            class_key, subject_key, raw, url, mapped, "", 0.0, "no_title",
            error=str(e)[:120],
        )

    if not pdf_title:
        return AuditRow(
            class_key, subject_key, raw, url, mapped, "", 0.0, "no_title",
        )

    sim = title_similarity(mapped, pdf_title)
    status = "ok" if sim >= threshold else "mismatch"
    return AuditRow(
        class_key, subject_key, raw, url, mapped, pdf_title, round(sim, 3), status,
    )


def iter_entries(manifest: dict, class_filter: str | None):
    for class_key in sorted(manifest.keys(), key=lambda c: int(c.replace("class-", "") or 0)):
        if class_filter and class_key != class_filter:
            continue
        for subject_key, files in manifest[class_key].items():
            for entry in files:
                if entry.get("url", "").lower().endswith(".pdf"):
                    yield class_key, subject_key, entry


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--class", dest="class_key", help="Only audit one class (e.g. class-8)")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--limit", type=int, default=0, help="Max PDFs to check (0 = all)")
    parser.add_argument("--threshold", type=float, default=0.55,
                        help="Min similarity to count as ok")
    args = parser.parse_args()

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    chapter_names = json.loads(CHAPTER_NAMES.read_text(encoding="utf-8"))

    tasks = list(iter_entries(manifest, args.class_key))
    if args.limit:
        tasks = tasks[: args.limit]

    print(f"Auditing {len(tasks)} PDFs (workers={args.workers})…")

    rows: list[AuditRow] = []
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(
                audit_one, ck, sk, entry, chapter_names, args.threshold,
            ): (ck, sk, entry.get("raw_code"))
            for ck, sk, entry in tasks
        }
        for fut in as_completed(futures):
            rows.append(fut.result())
            done += 1
            if done % 50 == 0 or done == len(tasks):
                print(f"  {done}/{len(tasks)}", flush=True)

    rows.sort(key=lambda r: (r.class_key, r.subject_key, r.raw_code))

    by_status: dict[str, int] = {}
    by_class: dict[str, dict[str, int]] = {}
    mismatches = [r for r in rows if r.status == "mismatch"]

    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + 1
        cls = by_class.setdefault(r.class_key, {"ok": 0, "mismatch": 0, "other": 0})
        if r.status == "ok":
            cls["ok"] += 1
        elif r.status == "mismatch":
            cls["mismatch"] += 1
        else:
            cls["other"] += 1

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    stamp = __import__("datetime").datetime.now().strftime("%Y%m%d_%H%M%S")
    suffix = args.class_key or "all"
    report_path = REPORT_DIR / f"chapter_audit_{suffix}_{stamp}.json"
    summary_path = REPORT_DIR / f"chapter_audit_{suffix}_{stamp}_summary.txt"

    report = {
        "threshold": args.threshold,
        "total": len(rows),
        "by_status": by_status,
        "by_class": by_class,
        "mismatches": [asdict(r) for r in mismatches],
        "all_rows": [asdict(r) for r in rows],
    }
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        f"NCERT chapter mapping audit ({suffix})",
        f"Total PDFs: {len(rows)}",
        f"Threshold: {args.threshold}",
        "",
        "By status:",
    ]
    for k, v in sorted(by_status.items()):
        lines.append(f"  {k}: {v}")
    lines += ["", "By class (ok / mismatch / other):"]
    for ck in sorted(by_class.keys(), key=lambda c: int(c.replace("class-", "") or 0)):
        c = by_class[ck]
        lines.append(f"  {ck}: {c['ok']} ok, {c['mismatch']} mismatch, {c['other']} other")

    lines += ["", f"Sample mismatches (up to 40 of {len(mismatches)}):"]
    for r in mismatches[:40]:
        lines.append(
            f"  [{r.class_key}/{r.subject_key}] {r.raw_code}: "
            f"mapped='{r.mapped_title}' pdf='{r.pdf_title}' (sim={r.similarity})"
        )

    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines[:30]))
    if len(lines) > 30:
        print(f"… ({len(lines)} lines total)")
    print(f"\nFull report: {report_path}")
    print(f"Summary:     {summary_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
