#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
LightRAG Log Forwarder
======================

Forwards LightRAG and RAG-Anything logs to bixy_AiTutor's unified logging system.
"""

import logging
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Dict, Optional

from src.config.constants import PROJECT_ROOT


class LightRAGLogForwarder(logging.Handler):
    """
    Handler that forwards LightRAG logger messages to bixy_AiTutor logger.
    """

    def __init__(self, ai_tutor_logger, add_prefix: bool = True):
        """
        Args:
            ai_tutor_logger: bixy_AiTutor Logger instance
            add_prefix: Whether to add prefix to messages
        """
        super().__init__()
        self.ai_tutor_logger = ai_tutor_logger
        self.add_prefix = add_prefix
        # Capture all log levels
        self.setLevel(logging.DEBUG)

    def emit(self, record: logging.LogRecord):
        """
        Forward log record to bixy_AiTutor logger.
        """
        try:
            message = record.getMessage()

            # Map log levels
            level = record.levelno
            if level >= logging.ERROR:
                self.ai_tutor_logger.error(message)
            elif level >= logging.WARNING:
                self.ai_tutor_logger.warning(message)
            elif level >= logging.INFO:
                self.ai_tutor_logger.info(message)
            else:
                self.ai_tutor_logger.debug(message)

        except Exception:
            self.handleError(record)


def get_lightrag_forwarding_config() -> Dict[str, Any]:
    """
    Get LightRAG forwarding configuration.

    Returns:
        Dict[str, Any]: Configuration dictionary
    """
    try:
        from src.services.config import load_config_with_main
        from ..config import get_global_log_level

        config = load_config_with_main("solve_config.yaml", PROJECT_ROOT)
        logging_config = config.get("logging", {})

        # Use the unified global log level
        level = get_global_log_level()

        return {
            "enabled": True,
            "min_level": level,
            "logger_names": logging_config.get(
                "rag_logger_names", {"knowledge_init": "RAG-Init", "rag_tool": "RAG"}
            ),
            "add_prefix": logging_config.get("add_prefix", True),
        }
    except Exception:
        # Return defaults if config loading fails
        return {
            "enabled": True,
            "min_level": "DEBUG",
            "logger_names": {"knowledge_init": "RAG-Init", "rag_tool": "RAG"},
            "add_prefix": True,
        }


@contextmanager
def LightRAGLogContext(logger_name: Optional[str] = None, scene: Optional[str] = None):
    """
    Context manager for LightRAG log forwarding.

    Automatically sets up and tears down log forwarding.

    Args:
        logger_name: Explicit logger name (overrides scene-based lookup)
        scene: Scene name ('knowledge_init' or 'rag_tool') for logger name lookup

    Usage:
        with LightRAGLogContext("RAGTool"):
            # RAG operations
            rag = RAGAnything(...)
    """
    from ..logger import get_logger

    # Get configuration
    config = get_lightrag_forwarding_config()

    # Check if forwarding is enabled
    if not config.get("enabled", True):
        yield
        return

    # Determine logger name
    if logger_name is None:
        if scene:
            logger_names = config.get("logger_names", {})
            logger_name = logger_names.get(scene, "Main")
        else:
            logger_name = "Main"

    # Get bixy_AiTutor logger
    ai_tutor_logger = get_logger(logger_name)

    # Get forwarding settings
    add_prefix = config.get("add_prefix", True)
    min_level_str = config.get("min_level", "INFO")
    min_level = getattr(logging, min_level_str.upper(), logging.INFO)

    # Get LightRAG logger
    lightrag_logger = logging.getLogger("lightrag")

    # Store original handlers and level
    original_handlers = lightrag_logger.handlers[:]
    original_level = lightrag_logger.level

    # Temporarily remove console handlers
    console_handlers_to_remove = []
    for handler in original_handlers:
        if isinstance(handler, logging.StreamHandler):
            console_handlers_to_remove.append(handler)

    for handler in console_handlers_to_remove:
        lightrag_logger.removeHandler(handler)

    # Set level to DEBUG to ensure we capture all
    if lightrag_logger.level > logging.DEBUG:
        lightrag_logger.setLevel(logging.DEBUG)

    # Create and add forwarder
    forwarder = LightRAGLogForwarder(ai_tutor_logger, add_prefix=add_prefix)
    forwarder.setLevel(min_level)
    lightrag_logger.addHandler(forwarder)

    try:
        yield
    finally:
        # Clean up
        if forwarder in lightrag_logger.handlers:
            lightrag_logger.removeHandler(forwarder)
            forwarder.close()

        # Restore original state
        lightrag_logger.setLevel(original_level)
        for handler in original_handlers:
            if handler not in lightrag_logger.handlers:
                lightrag_logger.addHandler(handler)
