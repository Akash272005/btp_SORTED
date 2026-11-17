#!/usr/bin/env python3
"""
Setup script to index all NCERT PDFs into Azure AI Search (Hybrid mode).
Run this once after configuring AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_KEY in .env
"""
import os
import sys
import asyncio
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from dotenv import load_dotenv
load_dotenv()

async def setup_azure_search_cloud():
    print("☁️🚀 Starting End-to-End Azure AI Search Pipeline...")
    
    # Check credentials
    if not os.getenv("AZURE_SEARCH_ENDPOINT") or not os.getenv("AZURE_SEARCH_KEY"):
        print("❌ Error: Missing AZURE_SEARCH_ENDPOINT or AZURE_SEARCH_KEY in .env")
        print("Please configure them first.")
        return

    # 1. Find all PDFs in ncert_source
    ncert_source = project_root / "ncert_source"
    if not ncert_source.exists():
        print(f"❌ Error: {ncert_source} not found. Ensure the ncert_source folder exists.")
        return

    pdf_files = sorted(ncert_source.rglob("*.pdf"))
    print(f"📚 Found {len(pdf_files)} PDF files to push to Azure...")

    if not pdf_files:
        print("❌ No PDFs found to index.")
        return

    # 2. Use the Azure Search pipeline directly (bypass KnowledgeBaseInitializer)
    from src.services.rag.factory import get_pipeline
    
    kb_name = "ncert-all"
    file_paths = [str(f.resolve()) for f in pdf_files]
    
    print(f"⚙️ Initializing '{kb_name}' on Azure AI Search (Hybrid mode)...")
    
    try:
        pipeline = get_pipeline("azure_search")
        success = await pipeline.initialize(kb_name, file_paths)
        
        if success:
            print(f"\n✅ Success! Knowledge base '{kb_name}' has been indexed into Azure AI Search.")
            print("📊 Your system is now running on cloud-based Vector DB.")
            print("\n🔍 Testing search...")
            result = await pipeline.search("What is photosynthesis?", kb_name)
            if result.get("content") and "No relevant" not in result["content"]:
                print("✅ Search test passed! Azure AI Search is working correctly.")
            else:
                print("⚠️ Search returned no results. Index may still be processing.")
        else:
            print("❌ Indexing failed. Check logs above for details.")
    except Exception as e:
        print(f"❌ Failed to initialize on Azure: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(setup_azure_search_cloud())
