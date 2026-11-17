#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
init_kb_batch.py
================

Initialize specific knowledge bases using the KnowledgeBaseInitializer.

This script:
1. Restructures flat PDF directories into the proper KB format (raw/, rag_storage/, etc.)
2. Runs the RAG pipeline (LlamaIndex) to index documents
3. Registers the KB in kb_config.json

Usage:
    python scripts/init_kb_batch.py                          # Initialize default KBs
    python scripts/init_kb_batch.py --kb class_12_physics    # Initialize specific KB
    python scripts/init_kb_batch.py --kb "Remote Sensing"    # Re-initialize Remote Sensing
    python scripts/init_kb_batch.py --all                    # Initialize ALL available KBs
    python scripts/init_kb_batch.py --list                   # List available KBs
"""

import argparse
import asyncio
import json
import os
import shutil
import sys
from pathlib import Path

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

KB_BASE_DIR = PROJECT_ROOT / "data" / "knowledge_bases"

# Default KBs to initialize if none specified
DEFAULT_KBS = ["Remote Sensing"]


def list_available_kbs():
    """List all KB directories in data/knowledge_bases/."""
    print("\n[*] Available Knowledge Bases:")
    print("=" * 60)
    for d in sorted(KB_BASE_DIR.iterdir()):
        if not d.is_dir() or d.name in ("rag_storage",):
            continue
        # Check if it has proper structure
        has_raw = (d / "raw").exists()
        has_index = (d / "llamaindex_storage").exists() or (d / "rag_storage").exists()
        has_metadata = (d / "metadata.json").exists()

        # Count PDFs
        if has_raw:
            pdfs = list((d / "raw").glob("*.pdf"))
        else:
            pdfs = list(d.glob("*.pdf"))

        status = "[OK] Indexed" if has_index and has_metadata else "[PDF] PDFs only" if pdfs else "[--] Empty"
        print(f"  {d.name:<40} {len(pdfs):>3} PDFs  {status}")
    print()


def restructure_flat_kb(kb_name: str):
    """
    If a KB directory contains flat PDFs (not in raw/ subfolder),
    restructure it into the proper format.
    """
    kb_dir = KB_BASE_DIR / kb_name
    if not kb_dir.exists():
        print(f"[ERR] KB directory not found: {kb_dir}")
        return False

    raw_dir = kb_dir / "raw"

    # Check if PDFs are at top level (flat structure)
    top_level_pdfs = list(kb_dir.glob("*.pdf"))

    if top_level_pdfs and not raw_dir.exists():
        print(f"[>>] Restructuring {kb_name}: moving {len(top_level_pdfs)} PDFs into raw/")
        raw_dir.mkdir(parents=True, exist_ok=True)

        for pdf in top_level_pdfs:
            dest = raw_dir / pdf.name
            shutil.move(str(pdf), str(dest))
            print(f"   -> {pdf.name}")

        # Create other directories
        for subdir in ["images", "rag_storage", "content_list"]:
            (kb_dir / subdir).mkdir(parents=True, exist_ok=True)

        print(f"[OK] Restructured {kb_name}")
        return True
    elif raw_dir.exists():
        pdfs_in_raw = list(raw_dir.glob("*.pdf"))
        if pdfs_in_raw:
            print(f"[OK] {kb_name} already has proper structure ({len(pdfs_in_raw)} PDFs in raw/)")
        else:
            print(f"[WARN] {kb_name} has raw/ but no PDFs in it")
        return True
    else:
        print(f"[WARN] {kb_name} has no PDFs at top level or in raw/")
        return False


async def initialize_kb(kb_name: str, provider: str = "llamaindex"):
    """Initialize a single knowledge base."""
    from src.knowledge.initializer import KnowledgeBaseInitializer
    from src.knowledge.manager import KnowledgeBaseManager

    kb_dir = KB_BASE_DIR / kb_name

    print(f"\n{'=' * 60}")
    print(f"[>>] Initializing KB: {kb_name}")
    print(f"   Provider: {provider}")
    print(f"   Directory: {kb_dir}")
    print(f"{'=' * 60}\n")

    # Step 1: Restructure if needed
    if not restructure_flat_kb(kb_name):
        return False

    # Step 2: Check for PDFs
    raw_dir = kb_dir / "raw"
    pdf_files = list(raw_dir.glob("*.pdf"))
    if not pdf_files:
        print(f"[ERR] No PDFs found in {raw_dir}")
        return False

    # For English-only physics, filter out Hindi PDFs (lhph* files)
    # Keep all PDFs for now since both English and Hindi are useful
    print(f"[PDF] Found {len(pdf_files)} PDFs to process")

    # Step 3: Initialize using KnowledgeBaseInitializer
    initializer = KnowledgeBaseInitializer(
        kb_name=kb_name,
        base_dir=str(KB_BASE_DIR),
        rag_provider=provider,
    )

    # Create directory structure (idempotent)
    initializer.create_directory_structure()

    # Step 4: Process documents (this creates embeddings/index)
    await initializer.process_documents()

    # Step 5: Update kb_config.json status
    try:
        manager = KnowledgeBaseManager(base_dir=str(KB_BASE_DIR))
        manager.update_kb_status(
            name=kb_name,
            status="ready",
            progress={
                "stage": "completed",
                "message": "Knowledge base initialization complete!",
                "percent": 100,
                "current": len(pdf_files),
                "total": len(pdf_files),
            },
        )
        # Save the RAG provider
        manager.config["knowledge_bases"][kb_name]["rag_provider"] = provider
        manager._save_config()
        print(f"[OK] KB '{kb_name}' registered in kb_config.json with provider={provider}")
    except Exception as e:
        print(f"[WARN] Failed to update kb_config.json: {e}")

    print(f"\n[OK] KB '{kb_name}' initialization complete!")
    return True


async def main():
    parser = argparse.ArgumentParser(
        description="Initialize knowledge bases for RAG",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--kb", nargs="+",
        help="KB names to initialize (default: class_12_physics, Remote Sensing)",
    )
    parser.add_argument(
        "--list", action="store_true",
        help="List available KBs and exit",
    )
    parser.add_argument(
        "--all", action="store_true",
        help="Initialize all KBs containing PDFs",
    )
    parser.add_argument(
        "--provider", default="llamaindex",
        choices=["llamaindex", "raganything", "lightrag"],
        help="RAG provider to use (default: llamaindex)",
    )
    args = parser.parse_args()

    if args.list:
        list_available_kbs()
        return

    if args.all:
        kb_names = []
        for d in sorted(KB_BASE_DIR.iterdir()):
            if not d.is_dir() or d.name in ("rag_storage",):
                continue
            has_raw = (d / "raw").exists()
            pdfs = list((d / "raw").glob("*.pdf")) if has_raw else list(d.glob("*.pdf"))
            if pdfs:
                kb_names.append(d.name)
    else:
        kb_names = args.kb or DEFAULT_KBS

    print(f"\n[START] Will initialize {len(kb_names)} knowledge base(s): {', '.join(kb_names)}")
    print(f"   Provider: {args.provider}")
    print(f"   Base dir: {KB_BASE_DIR}\n")

    results = {}
    for kb_name in kb_names:
        try:
            success = await initialize_kb(kb_name, provider=args.provider)
            results[kb_name] = "[OK] Success" if success else "[ERR] Failed"
        except Exception as e:
            print(f"\n[ERR] Error initializing '{kb_name}': {e}")
            import traceback
            traceback.print_exc()
            results[kb_name] = f"[ERR] Error: {e}"

    # Summary
    print(f"\n{'=' * 60}")
    print("[SUMMARY] Initialization Summary")
    print(f"{'=' * 60}")
    for kb, status in results.items():
        print(f"  {kb:<40} {status}")
    print()


if __name__ == "__main__":
    asyncio.run(main())
