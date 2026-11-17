#!/usr/bin/env python3
"""
Register NCERT knowledge bases locally and ingest PDFs.

Knowledge bases are named per-class-subject: ncert-class-8-science
Each subject within a class gets its own isolated RAG index.

Usage:
  # Register all per-subject KBs (no ingest)
  python scripts/setup_local_ncert_kbs.py --register

  # Download + ingest all subjects for class-8
  python scripts/setup_local_ncert_kbs.py --class class-8 --ingest

  # Science only for class-8 (faster smoke test)
  python scripts/setup_local_ncert_kbs.py --class class-8 --subject science --ingest

  # Ingest all available classes and subjects
  python scripts/setup_local_ncert_kbs.py --all --ingest
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

project_root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv

load_dotenv(project_root / ".env", override=True)

CHAPTER_MAP = project_root / "web" / "public" / "ncert" / "chapter_map.json"
KB_BASE = project_root / "data" / "knowledge_bases"


def _class_num(class_key: str) -> int:
    return int(class_key.replace("class-", "").replace("class_", ""))


def kb_names_for_registry() -> list[str]:
    """Return all per-class-subject KB names derived from chapter_map.json."""
    data = json.loads(CHAPTER_MAP.read_text(encoding="utf-8"))
    names: list[str] = []
    for class_key in sorted(data.keys(), key=_class_num):
        for subj_key in sorted(data[class_key].keys()):
            names.append(f"ncert-{class_key}-{subj_key}")
    return names


def register_kbs(kb_names: list[str] | None = None) -> None:
    from src.knowledge.manager import KnowledgeBaseManager

    manager = KnowledgeBaseManager(base_dir=str(KB_BASE))
    targets = kb_names or kb_names_for_registry()

    for name in targets:
        manager.update_kb_status(
            name=name,
            status="pending",
            progress={
                "stage": "pending",
                "message": "Run setup_local_ncert_kbs.py --ingest to index PDFs",
                "percent": 0,
                "current": 0,
                "total": 0,
            },
        )
        kb_dir = KB_BASE / name
        kb_dir.mkdir(parents=True, exist_ok=True)
        metadata_file = kb_dir / "metadata.json"
        if not metadata_file.exists():
            metadata_file.write_text(
                json.dumps(
                    {
                        "name": name,
                        "description": f"NCERT knowledge base: {name}",
                        "rag_provider": None,
                    },
                    indent=2,
                ),
                encoding="utf-8",
            )
        print(f"  ✓ Registered {name}")

    print(f"\nRegistered {len(targets)} knowledge base(s) in {KB_BASE / 'kb_config.json'}")


def collect_pdf_urls_by_subject(
    class_key: str, subject: str | None = None
) -> dict[str, list[tuple[str, str]]]:
    """
    Return a mapping of subject_key → [(filename, url)] for ok/remapped chapters.
    If subject is given, only that subject is returned.
    """
    data = json.loads(CHAPTER_MAP.read_text(encoding="utf-8"))
    class_data = data.get(class_key)
    if not class_data:
        raise SystemExit(f"No chapter_map entry for {class_key}")

    result: dict[str, list[tuple[str, str]]] = {}

    for subj_key, mediums in class_data.items():
        if subject and subj_key != subject:
            continue
        if not isinstance(mediums, dict):
            continue
        seen: set[str] = set()
        pairs: list[tuple[str, str]] = []
        for _medium, chapters in mediums.items():
            if not isinstance(chapters, dict):
                continue
            for _code, entry in chapters.items():
                if not isinstance(entry, dict):
                    continue
                if entry.get("status") not in ("ok", "remapped"):
                    continue
                url = (entry.get("resolved_url") or "").strip()
                if not url or url in seen:
                    continue
                seen.add(url)
                fname = entry.get("resolved_file") or Path(urlparse(url).path).name
                if fname:
                    pairs.append((fname, url))
        if pairs:
            result[subj_key] = sorted(pairs, key=lambda x: x[0])

    return result


def download_pdfs(urls: list[tuple[str, str]], dest_dir: Path) -> list[str]:
    dest_dir.mkdir(parents=True, exist_ok=True)
    paths: list[str] = []
    for fname, url in urls:
        dest = dest_dir / fname
        if dest.exists() and dest.stat().st_size > 10_000:
            print(f"  skip (exists) {fname}")
            paths.append(str(dest))
            continue
        print(f"  download {fname}")
        req = Request(url, headers={"User-Agent": "bixy_AiTutor/1.0"})
        with urlopen(req, timeout=120) as resp:
            data = resp.read()
        dest.write_bytes(data)
        paths.append(str(dest))
    return paths


async def ingest_kb(kb_name: str, file_paths: list[str]) -> None:
    from src.knowledge.initializer import KnowledgeBaseInitializer
    from src.knowledge.manager import KnowledgeBaseManager
    from src.knowledge.progress_tracker import ProgressTracker
    from src.services.llm.config import get_llm_config

    llm = get_llm_config()
    manager = KnowledgeBaseManager(base_dir=str(KB_BASE))
    manager.update_kb_status(
        kb_name,
        status="processing",
        progress={
            "stage": "processing",
            "message": f"Indexing {len(file_paths)} PDF(s)…",
            "percent": 5,
            "current": 0,
            "total": len(file_paths),
        },
    )

    tracker = ProgressTracker(kb_name, KB_BASE)
    provider = __import__("os").environ.get("RAG_PROVIDER", "raganything")

    init = KnowledgeBaseInitializer(
        kb_name=kb_name,
        base_dir=str(KB_BASE),
        api_key=llm.api_key,
        base_url=llm.base_url,
        progress_tracker=tracker,
        rag_provider=provider,
    )
    init.create_directory_structure()
    raw_resolved = init.raw_dir.resolve()
    if all(Path(p).resolve().parent == raw_resolved for p in file_paths):
        copied = file_paths
        print(f"\nUsing {len(copied)} PDF(s) already in {init.raw_dir}")
    else:
        copied = init.copy_documents(file_paths)
    print(f"\nIngesting {len(copied)} file(s) into '{kb_name}' (provider={provider})…")
    await init.process_documents()
    init.extract_numbered_items()

    manager.update_kb_status(
        kb_name,
        status="ready",
        progress={
            "stage": "ready",
            "message": f"Indexed {len(copied)} PDF(s)",
            "percent": 100,
            "current": len(copied),
            "total": len(copied),
        },
    )
    print(f"\n✓ '{kb_name}' is ready for RAG search.")


def _all_class_keys() -> list[str]:
    data = json.loads(CHAPTER_MAP.read_text(encoding="utf-8"))
    return sorted(data.keys(), key=_class_num)


def main() -> None:
    parser = argparse.ArgumentParser(description="Register and ingest local NCERT KBs (per-class-subject)")
    parser.add_argument("--register", action="store_true", help="Register per-subject KB names in kb_config.json")
    parser.add_argument("--ingest", action="store_true", help="Download PDFs and run RAG indexing")
    parser.add_argument("--class", dest="class_key", default="class-8", help="Class to ingest (e.g. class-8)")
    parser.add_argument("--subject", default=None, help="Optional subject filter (e.g. science)")
    parser.add_argument("--all", dest="all_classes", action="store_true", help="Ingest all available classes")
    args = parser.parse_args()

    if not args.register and not args.ingest:
        parser.error("Pass --register and/or --ingest")

    if args.register:
        print("Registering per-subject NCERT knowledge bases…")
        register_kbs()

    if args.ingest:
        class_keys = _all_class_keys() if args.all_classes else [args.class_key]

        for class_key in class_keys:
            n = _class_num(class_key)
            print(f"\n{'='*50}")
            print(f"Processing {class_key}" + (f" / {args.subject}" if args.subject else " (all subjects)"))
            by_subject = collect_pdf_urls_by_subject(class_key, args.subject)
            if not by_subject:
                print(f"  ⚠ No ok/remapped PDFs found for {class_key}, skipping.")
                continue

            for subj_key, pairs in by_subject.items():
                kb_name = f"ncert-class-{n}-{subj_key}"
                print(f"\n  Subject: {subj_key} → KB: {kb_name} ({len(pairs)} PDFs)")

                register_kbs([kb_name])
                raw_dir = KB_BASE / kb_name / "raw"
                file_paths = download_pdfs(pairs, raw_dir)
                asyncio.run(ingest_kb(kb_name, file_paths))


if __name__ == "__main__":
    main()
