# -*- coding: utf-8 -*-
"""Pre-warm RAG pipelines for faster first question-generation request."""

from __future__ import annotations

from pathlib import Path

from src.app_logging import get_logger

logger = get_logger("RAGWarmup")

_WARMUP_QUERY = "__warmup__"


async def warm_knowledge_base(kb_name: str, mode: str = "naive") -> bool:
    """Initialize RAG storage for a KB with a lightweight query."""
    if not kb_name:
        return False
    try:
        from src.tools.rag_tool import rag_search

        await rag_search(
            _WARMUP_QUERY,
            kb_name=kb_name,
            mode=mode,
            only_need_context=True,
        )
        logger.info(f"RAG warm-up complete for KB '{kb_name}' (mode={mode})")
        return True
    except Exception as exc:
        logger.warning(f"RAG warm-up skipped for KB '{kb_name}': {exc}")
        return False


async def warm_default_knowledge_bases() -> None:
    """Warm common KBs used by the question generator."""
    from src.services.config import load_config_with_main

    project_root = Path(__file__).resolve().parent.parent.parent.parent
    config = load_config_with_main("main.yaml", project_root)
    default_kb = config.get("tools", {}).get("rag_tool", {}).get("default_kb", "ai_textbook")
    rag_mode = config.get("question", {}).get("rag_mode", "naive")

    names: list[str] = []
    for name in (default_kb, "ncert-all", "ai_textbook"):
        if name and name not in names:
            names.append(name)

    for kb_name in names:
        await warm_knowledge_base(kb_name, mode=rag_mode)
