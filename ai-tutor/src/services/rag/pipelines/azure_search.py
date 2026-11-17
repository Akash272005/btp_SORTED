# -*- coding: utf-8 -*-
"""
Azure AI Search Pipeline
========================

Enterprise-grade pipeline using Azure AI Search (Hybrid Mode) for RAG.
"""

import os
import re
import uuid
import asyncio
from pathlib import Path
from typing import Any, Dict, List, Optional

from src.app_logging import get_logger
from src.services.embedding import get_embedding_client

class AzureSearchPipeline:
    """
    Azure AI Search pipeline for high scalability and accuracy (Hybrid Search).
    """

    name = "azure_search"

    def __init__(self, kb_base_dir: Optional[str] = None):
        self.logger = get_logger("AzureSearchPipeline")
        self.kb_base_dir = kb_base_dir 

        self.endpoint = os.getenv("AZURE_SEARCH_ENDPOINT")
        self.key = os.getenv("AZURE_SEARCH_KEY")
        
        # Use kb-specific index names or a unified one. A unified one makes it easier for search across all KBs,
        # but to keep it compatible with existing bixy architecture, we map kb_name -> index_name.
        self._check_config_warning = False

    def _get_index_name(self, kb_name: str) -> str:
        """Sanitize kb_name for Azure Search Index naming rules."""
        # Must only contain lowercase letters, digits or dashes, cannot start/end with dashes
        sanitized = re.sub(r'[^a-z0-9-]', '-', kb_name.lower())
        sanitized = sanitized.strip('-')
        return f"bixy-{sanitized}"

    def _ensure_azure_clients(self, index_name: str):
        if not self.endpoint or not self.key:
            if not self._check_config_warning:
                self.logger.warning("AZURE_SEARCH_ENDPOINT or AZURE_SEARCH_KEY not set in .env. Search operations will fail if called.")
                self._check_config_warning = True
            raise ValueError("Azure Search connection not configured.")

        try:
            from azure.core.credentials import AzureKeyCredential
            from azure.search.documents import SearchClient
            from azure.search.documents.indexes import SearchIndexClient
            from azure.search.documents.indexes.models import (
                SearchIndex,
                SimpleField,
                SearchableField,
                SearchField,
                SearchFieldDataType,
                VectorSearch,
                HnswAlgorithmConfiguration,
                VectorSearchProfile,
                SemanticSearch,
                SemanticConfiguration,
                SemanticPrioritizedFields,
                SemanticField
            )
        except ImportError:
            raise ImportError("Please install Azure Search dependencies: pip install azure-search-documents azure-identity")

        credential = AzureKeyCredential(self.key)
        
        # Retrieve embedding config to know dimensions dynamically
        from src.services.embedding import get_embedding_config
        cfg = get_embedding_config()
        dim = cfg.dim if getattr(cfg, 'dim', None) else 3072

        index_client = SearchIndexClient(endpoint=self.endpoint, credential=credential)
        
        # Check if index exists, create if not
        try:
            index_client.get_index(index_name)
        except Exception:
            self.logger.info(f"Creating Azure Search Index: {index_name}")
            fields = [
                SimpleField(name="id", type=SearchFieldDataType.String, key=True),
                SimpleField(name="file_name", type=SearchFieldDataType.String, filterable=True, facetable=True),
                SimpleField(name="file_path", type=SearchFieldDataType.String),
                SearchableField(name="content", type=SearchFieldDataType.String, analyzer_name="en.microsoft"),
                SearchField(name="embedding", type=SearchFieldDataType.Collection(SearchFieldDataType.Single), 
                            searchable=True, vector_search_dimensions=dim, vector_search_profile_name="myHnswProfile")
            ]

            vector_search = VectorSearch(
                algorithms=[HnswAlgorithmConfiguration(name="myHnsw")],
                profiles=[VectorSearchProfile(name="myHnswProfile", algorithm_configuration_name="myHnsw")]
            )

            # Optional Semantic Configuration for re-ranking
            semantic_config = SemanticConfiguration(
                name="default",
                prioritized_fields=SemanticPrioritizedFields(
                    title_field=None,
                    content_fields=[SemanticField(field_name="content")]
                )
            )
            semantic_search = SemanticSearch(configurations=[semantic_config])

            index = SearchIndex(name=index_name, fields=fields, vector_search=vector_search, semantic_search=semantic_search)
            index_client.create_index(index)
            self.logger.info(f"Index {index_name} created successfully.")
            
        search_client = SearchClient(endpoint=self.endpoint, index_name=index_name, credential=credential)
        return search_client

    def _chunk_text(self, text: str, chunk_size: int = 400, overlap: int = 50) -> List[str]:
        """Simple word-based chunking, safe for embedding token limits."""
        words = text.split()
        if not words:
            return []
        chunks = []
        i = 0
        while i < len(words):
            chunk = " ".join(words[i:i + chunk_size])
            if chunk.strip():
                chunks.append(chunk.strip())
            i += chunk_size - overlap
        return chunks

    def _extract_pdf_text(self, file_path: Path) -> str:
        try:
            import fitz
            doc = fitz.open(file_path)
            texts = [page.get_text() for page in doc]
            doc.close()
            return "\n\n".join(texts)
        except Exception as e:
            self.logger.error(f"Failed to extract PDF text from {file_path}: {e}")
            return ""

    async def initialize(self, kb_name: str, file_paths: List[str], **kwargs) -> bool:
        self.logger.info(f"Initializing KB '{kb_name}' on Azure AI Search with {len(file_paths)} files")
        index_name = self._get_index_name(kb_name)
        search_client = self._ensure_azure_clients(index_name)
        embed_client = get_embedding_client()

        # Phase 1: Parse and chunk documents
        chunks = []
        skipped = 0
        
        for idx, file_path in enumerate(file_paths):
            path = Path(file_path)
            if path.suffix.lower() == ".pdf":
                text = self._extract_pdf_text(path)
            else:
                try:
                    with open(path, "r", encoding="utf-8") as f:
                        text = f.read()
                except UnicodeDecodeError:
                    with open(path, "r", encoding="latin-1") as f:
                        text = f.read()

            if not text.strip():
                skipped += 1
                continue
            
            file_chunks = self._chunk_text(text)
            for c in file_chunks:
                chunks.append({
                    "id": str(uuid.uuid4()).replace("-", ""),
                    "file_name": path.name,
                    "file_path": str(path),
                    "content": c,
                })
            
            if (idx + 1) % 100 == 0:
                self.logger.info(f"Parsed {idx + 1}/{len(file_paths)} files ({len(chunks)} chunks so far)")

        self.logger.info(f"Parsing complete: {len(file_paths) - skipped} files -> {len(chunks)} chunks ({skipped} skipped)")

        if not chunks:
            self.logger.warning("No text found to process.")
            return False

        # Phase 2: Embed and upload in batches (smaller batch = safer for token limits)
        BATCH_SIZE = 16
        total_batches = (len(chunks) + BATCH_SIZE - 1) // BATCH_SIZE
        failed_batches = 0
        
        for i in range(0, len(chunks), BATCH_SIZE):
            batch = chunks[i:i + BATCH_SIZE]
            texts = [b["content"] for b in batch]
            batch_num = i // BATCH_SIZE + 1
            
            try:
                embeddings = await embed_client.embed(texts)
                
                for j, b in enumerate(batch):
                    b["embedding"] = embeddings[j]
                
                search_client.upload_documents(documents=batch)
                
                if batch_num % 20 == 0 or batch_num == total_batches:
                    self.logger.info(f"✅ Uploaded batch {batch_num}/{total_batches}")
            except Exception as e:
                failed_batches += 1
                self.logger.warning(f"⚠️ Batch {batch_num} failed: {str(e)[:100]}. Skipping...")
                # Small delay before retry 
                await asyncio.sleep(1)
                continue
            
        self.logger.info(f"✅ Successfully indexed {len(file_paths)} files ({len(chunks)} chunks) into Azure. Failed batches: {failed_batches}")
        return True

    async def search(self, query: str, kb_name: str, mode: str = "hybrid", **kwargs) -> Dict[str, Any]:
        """
        Search knowledge base using Azure AI Hybrid Search.
        """
        self.logger.info(f"Searching Azure KB '{kb_name}' with query: {query[:50]}...")
        index_name = self._get_index_name(kb_name)
        search_client = self._ensure_azure_clients(index_name)
        embed_client = get_embedding_client()

        from azure.search.documents.models import VectorizedQuery

        query_embedding = (await embed_client.embed([query]))[0]
        vector_query = VectorizedQuery(vector=query_embedding, k_nearest_neighbors=5, fields="embedding")
        
        # Perform Hybrid Search (Vector + Full-Text)
        results = search_client.search(
            search_text=query,
            vector_queries=[vector_query],
            select=["file_name", "content"],
            top=kwargs.get("top_k", 5)
        )
        
        context_parts = []
        for result in results:
            context_parts.append(f"Source: {result['file_name']}\n---\n{result['content']}")
            
        content = "\n\n".join(context_parts)
        if not content:
            content = "No relevant context found in Azure AI Search."

        return {
            "query": query,
            "answer": content,
            "content": content,
            "mode": "hybrid",
            "provider": "azure_search",
        }

    async def delete(self, kb_name: str) -> bool:
        """
        Deletes the entire knowledge base (index) from Azure AI Search.
        """
        index_name = self._get_index_name(kb_name)
        try:
            from azure.core.credentials import AzureKeyCredential
            from azure.search.documents.indexes import SearchIndexClient
            
            if not self.endpoint or not self.key:
                return False
                
            credential = AzureKeyCredential(self.key)
            index_client = SearchIndexClient(endpoint=self.endpoint, credential=credential)
            index_client.delete_index(index_name)
            self.logger.info(f"Deleted Azure Search index '{index_name}'")
            return True
        except Exception as e:
            self.logger.error(f"Failed to delete Azure Search index: {e}")
            return False
