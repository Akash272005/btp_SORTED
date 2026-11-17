#!/usr/bin/env python3
"""Upload ncert_source/**/*.pdf to Azure Blob (pdfs container, ncert/ prefix).

Blob path mirrors local layout:
  ncert_source/class-9/science/iesc113.pdf
    → pdfs/ncert/class-9/science/iesc113.pdf

Requires AZURE_STORAGE_CONNECTION_STRING or AZURE_BLOB_ACCOUNT_NAME + AZURE_BLOB_ACCOUNT_KEY
in .env (optional AZURE_BLOB_CONTAINER, default ``pdfs``).

Usage:
  .venv/bin/python scripts/upload_ncert_to_blob.py --dry-run
  .venv/bin/python scripts/upload_ncert_to_blob.py --class class-9 --subject science
  .venv/bin/python scripts/upload_ncert_to_blob.py --workers 8
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

from ncert_blob_storage import (  # noqa: E402
    NCERT_SOURCE,
    blob_name_for_pdf,
    iter_ncert_pdfs,
    load_project_env,
    public_url_for_pdf,
)


def _container_client():
    from src.services.storage.azure_kb_blob import get_kb_blob_container_client

    return get_kb_blob_container_client()


def _should_skip(local: Path, blob_size: int | None, force: bool) -> bool:
    if force:
        return False
    if blob_size is None:
        return False
    return local.stat().st_size == blob_size


def _upload_one(
    local: Path,
    ncert_root: Path,
    force: bool,
) -> dict:
    rel = local.relative_to(ncert_root)
    name = blob_name_for_pdf(rel)
    container = _container_client()
    if container is None:
        raise RuntimeError(
            "Azure Blob not configured. Set AZURE_STORAGE_CONNECTION_STRING or "
            "AZURE_BLOB_ACCOUNT_NAME + AZURE_BLOB_ACCOUNT_KEY in .env",
        )

    blob_client = container.get_blob_client(name)
    existing_size: int | None = None
    try:
        props = blob_client.get_blob_properties()
        existing_size = props.size
    except Exception:
        pass

    if _should_skip(local, existing_size, force):
        return {
            "status": "skipped",
            "local": str(rel),
            "blob": name,
            "url": public_url_for_pdf(rel),
            "bytes": local.stat().st_size,
        }

    with open(local, "rb") as fh:
        blob_client.upload_blob(fh, overwrite=True)

    return {
        "status": "uploaded",
        "local": str(rel),
        "blob": name,
        "url": public_url_for_pdf(rel),
        "bytes": local.stat().st_size,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Upload ncert_source PDFs to Azure Blob")
    parser.add_argument("--source", type=Path, default=NCERT_SOURCE)
    parser.add_argument("--class", dest="class_key", help="e.g. class-9")
    parser.add_argument("--subject", help="e.g. science")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--force", action="store_true", help="Re-upload even if size matches")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--report", type=Path, help="Write JSON report (default: data/ncert_audit/)")
    args = parser.parse_args()

    load_project_env()
    ncert_root = args.source.resolve()
    if not ncert_root.is_dir():
        print(f"❌ Not found: {ncert_root}", file=sys.stderr)
        return 2

    pdfs = iter_ncert_pdfs(ncert_root, args.class_key, args.subject)
    if args.limit:
        pdfs = pdfs[: args.limit]

    print(f"Found {len(pdfs)} PDFs under {ncert_root}")
    if not pdfs:
        return 0

    if args.dry_run:
        total = sum(p.stat().st_size for p in pdfs)
        for p in pdfs[:5]:
            rel = p.relative_to(ncert_root)
            print(f"  would upload: {blob_name_for_pdf(rel)} ({p.stat().st_size // 1024} KB)")
        if len(pdfs) > 5:
            print(f"  ... and {len(pdfs) - 5} more")
        print(f"Total: {total / (1024 * 1024):.1f} MB")
        return 0

    if _container_client() is None:
        print("❌ Azure Blob client unavailable — check .env credentials", file=sys.stderr)
        return 2

    stats = {"uploaded": 0, "skipped": 0, "failed": 0}
    rows: list[dict] = []
    t0 = time.time()

    def work(pdf: Path) -> dict:
        return _upload_one(pdf, ncert_root, args.force)

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(work, p): p for p in pdfs}
        done = 0
        for fut in as_completed(futures):
            done += 1
            pdf = futures[fut]
            try:
                row = fut.result()
                stats[row["status"]] = stats.get(row["status"], 0) + 1
                rows.append(row)
            except Exception as e:
                stats["failed"] += 1
                rel = pdf.relative_to(ncert_root)
                rows.append({
                    "status": "failed",
                    "local": str(rel),
                    "blob": blob_name_for_pdf(rel),
                    "error": str(e),
                })
            if done % 50 == 0 or done == len(pdfs):
                elapsed = time.time() - t0
                print(f"  {done}/{len(pdfs)} ({elapsed:.0f}s)", flush=True)

    elapsed = time.time() - t0
    print(
        f"\nDone in {elapsed:.1f}s: "
        f"{stats['uploaded']} uploaded, {stats['skipped']} skipped, {stats['failed']} failed",
    )

    audit = ROOT / "data" / "ncert_audit"
    audit.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    report_path = args.report or audit / f"ncert_blob_upload_{stamp}.json"
    report_path.write_text(
        json.dumps(
            {
                "generated_at": stamp,
                "source": str(ncert_root),
                "stats": stats,
                "elapsed_seconds": round(elapsed, 1),
                "files": rows,
            },
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    print(f"Report: {report_path}")

    return 0 if stats["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
