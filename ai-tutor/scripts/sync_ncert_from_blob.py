#!/usr/bin/env python3
"""Sync ncert_source + manifest.json from Azure Blob (English/Hindi PDFs only).

Replaces Urdu/regional local copies when matching e/h chapters exist on blob,
regenerates manifest.json with blob URLs, then refreshes chapter names + remap.

Usage:
  .venv/bin/python scripts/sync_ncert_from_blob.py
  .venv/bin/python scripts/sync_ncert_from_blob.py --class class-10
  .venv/bin/python scripts/sync_ncert_from_blob.py --dry-run
  .venv/bin/python scripts/sync_ncert_from_blob.py --skip-sync --skip-remap
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from generate_ncert_manifest import build_manifest  # noqa: E402
from ncert_blob_storage import (  # noqa: E402
    MANIFEST_OUT,
    NCERT_SOURCE,
    blob_name_for_pdf,
    chapter_tail,
    is_english_hindi_code,
    list_blob_ncert_pdfs,
    load_project_env,
    ncert_storage_base_url,
)

PYTHON = sys.executable
REPORT_DIR = ROOT / "data" / "ncert_audit"


def _container_client():
    from src.services.storage.azure_kb_blob import get_kb_blob_container_client

    client = get_kb_blob_container_client()
    if client is None:
        raise RuntimeError(
            "Azure Blob not configured. Set AZURE_STORAGE_CONNECTION_STRING in .env",
        )
    return client


def _download_one(rel: str, dest: Path, blob_size: int, force: bool) -> dict:
    if dest.exists() and not force:
        local_size = dest.stat().st_size
        if local_size == blob_size and local_size > 500:
            return {"status": "skipped", "rel": rel, "bytes": local_size}

    container = _container_client()
    blob_client = container.get_blob_client(blob_name_for_pdf(rel))
    dest.parent.mkdir(parents=True, exist_ok=True)
    data = blob_client.download_blob().readall()
    if len(data) < 500:
        return {"status": "failed", "rel": rel, "error": "response too small"}
    dest.write_bytes(data)
    return {"status": "downloaded", "rel": rel, "bytes": len(data)}


def purge_non_eh_local(
    ncert_root: Path,
    eh_blob_rels: list[str],
    *,
    dry_run: bool,
) -> list[str]:
    """Remove Urdu/other local PDFs when the same chapter exists as e/h on blob."""
    eh_tails: set[tuple[str, str, str]] = set()
    for rel in eh_blob_rels:
        parts = rel.split("/")
        if len(parts) < 3:
            continue
        stem = Path(rel).stem
        eh_tails.add((parts[0], parts[1], chapter_tail(stem)))

    removed: list[str] = []
    for pdf in sorted(ncert_root.rglob("*.pdf")):
        rel = str(pdf.relative_to(ncert_root)).replace("\\", "/")
        parts = rel.split("/")
        if len(parts) < 3:
            continue
        stem = pdf.stem
        if is_english_hindi_code(stem):
            continue
        key = (parts[0], parts[1], chapter_tail(stem))
        if key not in eh_tails:
            continue
        removed.append(rel)
        if not dry_run:
            pdf.unlink()
    return removed


def sync_local_from_blob(
    ncert_root: Path,
    *,
    class_key: str | None,
    workers: int,
    force: bool,
    dry_run: bool,
) -> tuple[list[str], dict[str, int]]:
    blob_rows = list_blob_ncert_pdfs(medium_codes=("e", "h"), class_key=class_key)
    eh_rels = [rel for rel, _ in blob_rows]
    blob_sizes = {rel: size for rel, size in blob_rows}

    print(f"Found {len(eh_rels)} English/Hindi PDFs on blob")

    removed = purge_non_eh_local(ncert_root, eh_rels, dry_run=dry_run)
    print(f"{'Would remove' if dry_run else 'Removed'} {len(removed)} non-e/h local PDFs")

    stats = {"downloaded": 0, "skipped": 0, "failed": 0}
    rows: list[dict] = []

    if dry_run:
        need = 0
        for rel in eh_rels[:10]:
            dest = ncert_root / rel
            if not dest.exists() or dest.stat().st_size != blob_sizes.get(rel, -1):
                need += 1
                print(f"  would download: {rel}")
        if len(eh_rels) > 10:
            print(f"  ... and {len(eh_rels) - 10} more")
        print(f"Dry-run: ~{sum(1 for r in eh_rels if not (ncert_root / r).exists())} downloads needed")
        return eh_rels, stats

    t0 = time.time()

    def work(rel: str) -> dict:
        dest = ncert_root / rel
        return _download_one(rel, dest, blob_sizes.get(rel, 0), force)

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {pool.submit(work, rel): rel for rel in eh_rels}
        done = 0
        for fut in as_completed(futures):
            done += 1
            try:
                row = fut.result()
                stats[row["status"]] = stats.get(row["status"], 0) + 1
                rows.append(row)
            except Exception as e:
                rel = futures[fut]
                stats["failed"] += 1
                rows.append({"status": "failed", "rel": rel, "error": str(e)[:200]})
            if done % 100 == 0 or done == len(eh_rels):
                print(f"  download {done}/{len(eh_rels)} ({time.time() - t0:.0f}s)", flush=True)

    print(
        f"Downloads: {stats['downloaded']} new, {stats['skipped']} skipped, "
        f"{stats['failed']} failed ({time.time() - t0:.0f}s)",
    )

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report = REPORT_DIR / f"ncert_blob_sync_{stamp}.json"
    report.write_text(
        json.dumps(
            {
                "generated_at": stamp,
                "blob_eh_count": len(eh_rels),
                "removed_local": removed,
                "download_stats": stats,
                "failures": [r for r in rows if r.get("status") == "failed"][:50],
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(f"Report: {report}")
    return eh_rels, stats


def regenerate_manifest(*, dry_run: bool) -> int:
    load_project_env()
    base_url = ncert_storage_base_url()
    manifest = build_manifest(
        NCERT_SOURCE,
        base_url=base_url,
        medium_codes=("e", "h"),
    )
    total = sum(len(files) for cls in manifest.values() for files in cls.values())
    print(f"Manifest would contain {len(manifest)} classes, {total} PDFs (English/Hindi only)")

    if dry_run:
        return 0

    if MANIFEST_OUT.exists():
        backup = MANIFEST_OUT.with_suffix(".json.bak")
        shutil.copy2(MANIFEST_OUT, backup)
        print(f"Backed up manifest → {backup}")

    MANIFEST_OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✅ Wrote {MANIFEST_OUT}")
    return total


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sync ncert_source + manifest from Azure Blob (English/Hindi)",
    )
    parser.add_argument("--class", dest="class_key", help="Limit to one class, e.g. class-10")
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--force", action="store_true", help="Re-download even when size matches")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-download", action="store_true", help="Only regenerate manifest")
    parser.add_argument("--skip-sync", action="store_true", help="Skip sync_chapter_names_from_pdfs.py")
    parser.add_argument("--skip-remap", action="store_true", help="Skip build_ncert_pdf_remap.py")
    args = parser.parse_args()

    load_project_env()
    NCERT_SOURCE.mkdir(parents=True, exist_ok=True)

    if not args.skip_download:
        _, stats = sync_local_from_blob(
            NCERT_SOURCE,
            class_key=args.class_key,
            workers=args.workers,
            force=args.force,
            dry_run=args.dry_run,
        )
        if args.dry_run:
            regenerate_manifest(dry_run=True)
            return 0
        if stats.get("failed", 0) > 0:
            print("⚠ Some downloads failed — continuing with manifest anyway")

    total = regenerate_manifest(dry_run=args.dry_run)
    if args.dry_run:
        return 0

    if not args.skip_sync:
        cmd = [PYTHON, str(ROOT / "scripts" / "sync_chapter_names_from_pdfs.py")]
        if args.class_key:
            cmd.extend(["--class", args.class_key])
        print(f"\n{'=' * 60}\nRunning sync_chapter_names_from_pdfs.py\n{'=' * 60}")
        if subprocess.call(cmd, cwd=ROOT) != 0:
            print("⚠ sync_chapter_names_from_pdfs.py failed", file=sys.stderr)

    if not args.skip_remap:
        cmd = [PYTHON, str(ROOT / "scripts" / "build_ncert_pdf_remap.py")]
        if args.class_key:
            cmd.extend(["--class", args.class_key])
        print(f"\n{'=' * 60}\nRunning build_ncert_pdf_remap.py\n{'=' * 60}")
        if subprocess.call(cmd, cwd=ROOT) != 0:
            print("⚠ build_ncert_pdf_remap.py failed", file=sys.stderr)

    print(f"\n✅ Done. Manifest has {total} English/Hindi chapters.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
