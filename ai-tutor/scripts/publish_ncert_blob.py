#!/usr/bin/env python3
"""Publish ncert_source to Azure Blob and regenerate manifest.json (full pipeline).

Steps:
  1. Upload PDFs → ``pdfs/ncert/class-XX/subject/{raw_code}.pdf``
  2. Regenerate ``web/public/ncert/manifest.json`` with blob URLs
  3. Print follow-up commands (chapter names, remap, RAG re-index)

Usage:
  .venv/bin/python scripts/publish_ncert_blob.py --dry-run
  .venv/bin/python scripts/publish_ncert_blob.py
  .venv/bin/python scripts/publish_ncert_blob.py --manifest-only
  .venv/bin/python scripts/publish_ncert_blob.py --upload-only --class class-9
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PYTHON = sys.executable
SCRIPTS = ROOT / "scripts"


def _run(cmd: list[str], label: str) -> int:
    print(f"\n{'=' * 60}\n{label}\n{'=' * 60}")
    print(" ".join(cmd), flush=True)
    return subprocess.call(cmd, cwd=ROOT)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Upload ncert_source to Azure Blob and refresh manifest.json",
    )
    parser.add_argument("--source", type=Path, default=ROOT / "ncert_source")
    parser.add_argument("--class", dest="class_key", help="Limit to one class, e.g. class-9")
    parser.add_argument("--subject", help="Limit to one subject, e.g. science")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--force", action="store_true", help="Re-upload all PDFs")
    parser.add_argument("--upload-only", action="store_true")
    parser.add_argument("--manifest-only", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-backup", action="store_true")
    parser.add_argument(
        "--yes",
        "-y",
        action="store_true",
        help="Confirm overwriting web/public/ncert/manifest.json",
    )
    args = parser.parse_args()

    if args.upload_only and args.manifest_only:
        print("❌ Use only one of --upload-only or --manifest-only", file=sys.stderr)
        return 2

    do_upload = not args.manifest_only
    do_manifest = not args.upload_only

    if do_upload:
        upload_cmd = [
            PYTHON,
            str(SCRIPTS / "upload_ncert_to_blob.py"),
            "--source",
            str(args.source),
            "--workers",
            str(args.workers),
        ]
        if args.class_key:
            upload_cmd.extend(["--class", args.class_key])
        if args.subject:
            upload_cmd.extend(["--subject", args.subject])
        if args.limit:
            upload_cmd.extend(["--limit", str(args.limit)])
        if args.force:
            upload_cmd.append("--force")
        if args.dry_run:
            upload_cmd.append("--dry-run")

        code = _run(upload_cmd, "Step 1/2: Upload ncert_source → Azure Blob")
        if code != 0:
            return code
        if args.dry_run:
            print("\n(dry-run — skipping manifest generation)")
            return 0

    if do_manifest:
        if not args.dry_run and not args.yes:
            print(
                "❌ Refusing to overwrite manifest.json without --yes\n"
                "   Preview first:  publish_ncert_blob.py --dry-run\n"
                "   Then publish:   publish_ncert_blob.py --yes",
                file=sys.stderr,
            )
            return 2

        manifest_cmd = [
            PYTHON,
            str(SCRIPTS / "generate_ncert_manifest.py"),
            "--source",
            str(args.source),
            "--blob",
        ]
        if args.no_backup:
            manifest_cmd.append("--no-backup")

        code = _run(manifest_cmd, "Step 2/2: Regenerate manifest.json (blob URLs)")
        if code != 0:
            return code

    print(
        f"""
{'=' * 60}
Next steps (recommended)
{'=' * 60}
  # Sync chapter titles from local PDFs + official NCERT
  .venv/bin/python scripts/sync_chapter_names_from_pdfs.py --local-only

  # Rebuild PDF title verification (optional; clears old remap mismatches)
  .venv/bin/python scripts/build_ncert_pdf_remap.py --refresh

  # Re-index RAG knowledge bases from ncert_source
  .venv/bin/python scripts/setup_ncert_all.py

  # Hard-refresh the student portal after deploy
"""
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
