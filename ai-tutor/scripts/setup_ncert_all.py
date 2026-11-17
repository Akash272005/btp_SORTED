#!/usr/bin/env python3
import os
import sys
import asyncio
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.services.rag.service import RAGService
from src.knowledge.initializer import KnowledgeBaseInitializer

async def setup_ncert_all():
    print("🚀 Starting NCERT-ALL Indexing for Teammate...")
    
    # 1. Find all PDFs in ncert_source
    ncert_source = project_root / "ncert_source"
    if not ncert_source.exists():
        print(f"❌ Error: {ncert_source} not found. Please ensure you have the 'ncert_source' folder.")
        return

    pdf_files = list(ncert_source.rglob("*.pdf"))
    print(f"📚 Found {len(pdf_files)} PDF files.")

    if not pdf_files:
        print("❌ No PDFs found to index.")
        return

    # 2. Initialize the ncert-all Knowledge Base
    kb_name = "ncert-all"
    # Convert paths to strings for the service
    file_paths = [str(f.resolve()) for f in pdf_files]
    
    # Use the robust Docling provider we configured
    provider = "raganything_docling"
    
    print(f"⚙️ Initializing '{kb_name}' using '{provider}'...")
    
    # We use KnowledgeBaseInitializer because it handles the folder creation and progress tracking setup
    initializer = KnowledgeBaseInitializer(project_root)
    
    try:
        # This will create the KB folder, metadata, and start the background indexing
        await initializer.process_documents(
            kb_name=kb_name,
            files=file_paths,
            rag_provider=provider
        )
        print(f"✅ Success! Knowledge base '{kb_name}' has been created and indexing started.")
        print("📊 You can now see the progress card on your Dashboard.")
    except Exception as e:
        print(f"❌ Failed to initialize: {e}")

if __name__ == "__main__":
    asyncio.run(setup_ncert_all())
