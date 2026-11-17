#!/usr/bin/env python3
"""
upload_ncert_to_backend.py
==========================
Upload all NCERT PDFs from ncert_source/ to the bixy backend.

Creates one Knowledge Base per class+subject folder, e.g.:
  ncert_source/class-10/science/  →  KB: ncert_c10_science

Features:
  - Fully resumable (progress saved to ncert_upload_progress.json)
  - Batched uploads (configurable, default 3 files per request)
  - Skips already-uploaded files
  - Retries failed batches once

Usage:
  python3 scripts/upload_ncert_to_backend.py
  python3 scripts/upload_ncert_to_backend.py --dry-run
  python3 scripts/upload_ncert_to_backend.py --kb-filter class-10  # only class 10
  python3 scripts/upload_ncert_to_backend.py --reset               # start fresh
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

# ── Config ────────────────────────────────────────────────────────────────────
BACKEND_URL = "https://bixy-backend.jollybay-27d8f37d.centralindia.azurecontainerapps.io"
NCERT_SOURCE = Path(__file__).parent.parent / "ncert_source"
PROGRESS_FILE = Path(__file__).parent.parent / "ncert_upload_progress.json"
RAG_PROVIDER = "llamaindex"   # fastest for plain PDFs; change to raganything for full multimodal
BATCH_SIZE = 3                # files per HTTP request (keep small to avoid timeouts)
REQUEST_TIMEOUT = 300         # seconds per upload request
RETRY_PAUSE = 5               # seconds before retrying a failed batch
# ──────────────────────────────────────────────────────────────────────────────


def kb_name_for(class_dir: str, subject: str) -> str:
    """Turn class-10 / social-science → ncert_c10_social_science."""
    num = class_dir.replace("class-", "").zfill(2)
    subj = subject.lower().replace("-", "_").replace(" ", "_")
    return f"ncert_c{num}_{subj}"


def discover_folders() -> list[tuple[str, str, Path]]:
    """Return list of (class_dir, subject, folder_path) sorted."""
    results = []
    for cls in sorted(NCERT_SOURCE.iterdir()):
        if not cls.is_dir() or not cls.name.startswith("class-"):
            continue
        for subj in sorted(cls.iterdir()):
            if not subj.is_dir():
                continue
            pdfs = list(subj.glob("*.pdf"))
            if pdfs:
                results.append((cls.name, subj.name, subj))
    return results


def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        try:
            return json.loads(PROGRESS_FILE.read_text())
        except Exception:
            pass
    return {}


def save_progress(progress: dict) -> None:
    PROGRESS_FILE.write_text(json.dumps(progress, indent=2))


def get_existing_kbs() -> set[str]:
    try:
        r = requests.get(f"{BACKEND_URL}/api/v1/knowledge/list", timeout=30)
        r.raise_for_status()
        return {kb["name"] for kb in r.json()}
    except Exception as e:
        print(f"  ⚠ Could not fetch KB list: {e}")
        return set()


def create_kb(name: str, first_file: Path, dry: bool) -> bool:
    print(f"  Creating KB '{name}' with seed file: {first_file.name}")
    if dry:
        return True
    try:
        with open(first_file, "rb") as f:
            r = requests.post(
                f"{BACKEND_URL}/api/v1/knowledge/create",
                data={"name": name, "rag_provider": RAG_PROVIDER},
                files={"files": (first_file.name, f, "application/pdf")},
                timeout=REQUEST_TIMEOUT,
            )
        r.raise_for_status()
        return True
    except Exception as e:
        print(f"  ✗ Create failed: {e}")
        return False


def upload_batch(name: str, files: list[Path], dry: bool) -> bool:
    names = ", ".join(p.name for p in files)
    print(f"    → uploading: {names}")
    if dry:
        return True
    handles = []
    try:
        for p in files:
            handles.append(open(p, "rb"))
        file_tuples = [
            ("files", (p.name, h, "application/pdf"))
            for p, h in zip(files, handles)
        ]
        r = requests.post(
            f"{BACKEND_URL}/api/v1/knowledge/{name}/upload",
            files=file_tuples,
            timeout=REQUEST_TIMEOUT,
        )
        r.raise_for_status()
        return True
    except Exception as e:
        print(f"    ✗ Upload failed: {e}")
        return False
    finally:
        for h in handles:
            try:
                h.close()
            except Exception:
                pass


def process_folder(
    class_dir: str,
    subject: str,
    folder: Path,
    progress: dict,
    existing_kbs: set[str],
    dry: bool,
) -> dict:
    name = kb_name_for(class_dir, subject)
    all_pdfs = sorted(folder.glob("*.pdf"))
    total = len(all_pdfs)

    kb_progress = progress.get(name, {"status": "pending", "uploaded": []})
    uploaded_set = set(kb_progress.get("uploaded", []))

    print(f"\n[KB] {name}  ({total} PDFs in {class_dir}/{subject})")

    if kb_progress.get("status") == "done":
        print(f"  ✓ Already complete — skipping")
        return progress

    # Step 1: create KB if it doesn't exist
    remaining = [p for p in all_pdfs if p.name not in uploaded_set]
    if not remaining:
        print(f"  ✓ All files already uploaded")
        kb_progress["status"] = "done"
        progress[name] = kb_progress
        save_progress(progress)
        return progress

    if name not in existing_kbs and name not in uploaded_set:
        seed = remaining[0]
        if create_kb(name, seed, dry):
            uploaded_set.add(seed.name)
            kb_progress["uploaded"] = list(uploaded_set)
            progress[name] = kb_progress
            save_progress(progress)
            existing_kbs.add(name)
            remaining = remaining[1:]
            if not dry:
                time.sleep(2)  # let backend register the KB
        else:
            print(f"  ✗ Could not create KB '{name}', skipping folder")
            kb_progress["status"] = "error"
            progress[name] = kb_progress
            save_progress(progress)
            return progress

    # Step 2: upload remaining in batches
    done = len(uploaded_set)
    for i in range(0, len(remaining), BATCH_SIZE):
        batch = remaining[i : i + BATCH_SIZE]
        print(f"  [{done + i + 1}–{min(done + i + len(batch), total)}/{total}]", end=" ")

        ok = upload_batch(name, batch, dry)
        if not ok:
            # One retry
            print(f"    Retrying in {RETRY_PAUSE}s…")
            time.sleep(RETRY_PAUSE)
            ok = upload_batch(name, batch, dry)

        if ok:
            for p in batch:
                uploaded_set.add(p.name)
            kb_progress["uploaded"] = list(uploaded_set)
            progress[name] = kb_progress
            save_progress(progress)
        else:
            print(f"    ✗ Batch permanently failed — will retry next run")

        if not dry:
            time.sleep(1)

    # Mark done if all uploaded
    if len(uploaded_set) >= total:
        kb_progress["status"] = "done"
        print(f"  ✓ KB '{name}' complete")
    else:
        kb_progress["status"] = "partial"
        print(f"  ⚠ KB '{name}' partial ({len(uploaded_set)}/{total})")

    progress[name] = kb_progress
    save_progress(progress)
    return progress


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Upload NCERT PDFs to bixy backend")
    parser.add_argument("--dry-run", action="store_true", help="Show plan, don't upload")
    parser.add_argument("--reset", action="store_true", help="Clear saved progress and start fresh")
    parser.add_argument(
        "--kb-filter",
        default="",
        help="Only process folders matching this string, e.g. 'class-10' or 'class-12/physics'",
    )
    parser.add_argument(
        "--backend-url",
        default=BACKEND_URL,
        help="Override the backend URL",
    )
    args = parser.parse_args(argv)

    backend = args.backend_url.rstrip("/")

    if not NCERT_SOURCE.exists():
        print(f"✗ ncert_source not found at: {NCERT_SOURCE}")
        return 1

    if args.reset:
        PROGRESS_FILE.unlink(missing_ok=True)
        print("Progress reset.")

    folders = discover_folders()
    if args.kb_filter:
        folders = [
            (c, s, f) for c, s, f in folders if args.kb_filter in str(f)
        ]

    total_pdfs = sum(len(list(f.glob("*.pdf"))) for _, _, f in folders)
    print(f"{'[DRY RUN] ' if args.dry_run else ''}Found {len(folders)} class/subject folders, {total_pdfs} PDFs total")
    print(f"Backend: {backend}")
    print(f"RAG provider: {RAG_PROVIDER}")
    print(f"Batch size: {BATCH_SIZE} files per request\n")

    if args.dry_run:
        print("Plan:")
        for cls, subj, folder in folders:
            name = kb_name_for(cls, subj)
            pdfs = list(folder.glob("*.pdf"))
            print(f"  {name}  ← {len(pdfs)} PDFs from {cls}/{subj}")
        return 0

    progress = load_progress()
    print(f"Resuming with {sum(1 for v in progress.values() if v.get('status') == 'done')} already-done KBs\n")

    existing_kbs = get_existing_kbs()
    print(f"Currently {len(existing_kbs)} KBs on backend\n")

    for cls, subj, folder in folders:
        progress = process_folder(cls, subj, folder, progress, existing_kbs, dry=args.dry_run)

    done = sum(1 for v in progress.values() if v.get("status") == "done")
    partial = sum(1 for v in progress.values() if v.get("status") == "partial")
    errors = sum(1 for v in progress.values() if v.get("status") == "error")

    print(f"\n{'='*60}")
    print(f"Upload complete: {done} done, {partial} partial, {errors} errors")
    print(f"Progress saved to: {PROGRESS_FILE}")
    if partial or errors:
        print("Re-run the script to retry failed batches.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
