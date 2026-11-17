#!/usr/bin/env python3
"""
ingest_ncert.py

Walk `web/public/ncert/` and copy PDFs into `data/knowledge_bases/`.

Creates one KB per class+subject folder named: `class_<class>_<subject>`
Example: web/public/ncert/class-01/English/book.pdf -> data/knowledge_bases/class_01_english/book.pdf

Usage:
  python3 scripts/ingest_ncert.py       # run ingest
  python3 scripts/ingest_ncert.py --dry # dry-run
"""
from pathlib import Path
import shutil
import argparse
import sys
import asyncio


def slugify(s: str) -> str:
    return (
        s.strip()
        .lower()
        .replace(" ", "_")
        .replace("-", "_")
        .replace("/", "_")
    )


def main(dry: bool = False):
    project_root = Path(__file__).parent.parent
    src_root = project_root / "web" / "public" / "ncert"
    dest_root = project_root / "data" / "knowledge_bases"

    if not src_root.exists():
        print(f"Source folder not found: {src_root}")
        sys.exit(1)

    copied = 0
    # Map KB name -> list of copied file paths (absolute)
    kb_to_paths = {}
    for class_dir in sorted(src_root.iterdir()):
        if not class_dir.is_dir():
            continue

        # For each subject directory under the class
        for subj in sorted(class_dir.iterdir()):
            if not subj.is_dir():
                continue

            # KB name: class_<class>_<subject>
            kb_name = f"{slugify(class_dir.name)}_{slugify(subj.name)}"
            dest_dir = dest_root / kb_name
            print(f"KB: {kb_name} -> {dest_dir}")

            pdfs = list(subj.glob("*.pdf"))
            if not pdfs:
                # Also try nested structure: subj/<subject_name>/*.pdf
                nested = subj / subj.name
                if nested.exists():
                    pdfs = list(nested.glob("*.pdf"))

            if not pdfs:
                print(f"  No PDFs found under {subj}")
                continue

            if dry:
                for p in pdfs:
                    print(f"  [dry] -> {p}")
                copied += len(pdfs)
                continue

            dest_dir.mkdir(parents=True, exist_ok=True)
            kb_files = []
            for p in pdfs:
                dst = dest_dir / p.name
                try:
                    shutil.copy2(p, dst)
                    copied += 1
                    kb_files.append(str(dst.resolve()))
                except Exception as e:
                    print(f"  Failed to copy {p} -> {dst}: {e}")

            if kb_files:
                kb_to_paths[kb_name] = kb_files

    print(f"Done. PDFs copied: {copied}")

    # After copying, attempt to initialize each KB with the configured RAG provider.
    if not dry and kb_to_paths:
        # Ensure project root is on sys.path so we can import src.services
        sys.path.insert(0, str(project_root))

        try:
            from src.services.rag.service import RAGService
        except Exception as e:
            print(f"Warning: could not import RAGService: {e}")
            return

        async def _init_all():
            service = RAGService()
            for kb, files in kb_to_paths.items():
                try:
                    print(f"Initializing RAG for KB: {kb} ({len(files)} files)")
                    await service.initialize(kb, files)
                    print(f"  Initialized: {kb}")
                except Exception as e:
                    print(f"  Failed to initialize KB {kb}: {e}")

        try:
            asyncio.run(_init_all())
        except Exception as e:
            print(f"Error while initializing RAG KBs: {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry", action="store_true", help="Dry run")
    args = parser.parse_args()
    main(dry=args.dry)
