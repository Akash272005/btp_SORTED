"""
Azure AI Vision Read API for Smart Solver photo/draw OCR.
"""

from __future__ import annotations

import asyncio
import os
import time
from typing import Any

import httpx

from src.app_logging import get_logger
from src.utils.tls_env import httpx_verify_arg

logger = get_logger("AzureVisionOCR")

_READ_ANALYZE_PATH = "/vision/v3.2/read/analyze"
_POLL_INTERVAL_SEC = 0.4
_POLL_TIMEOUT_SEC = 45.0


def azure_vision_endpoint() -> str:
    return os.getenv("AZURE_VISION_ENDPOINT", "").strip().rstrip("/")


def azure_vision_key() -> str:
    return os.getenv("AZURE_VISION_KEY", "").strip()


def is_azure_vision_configured() -> bool:
    return bool(azure_vision_endpoint() and azure_vision_key())


def doc_intelligence_endpoint() -> str:
    return os.getenv("AZURE_DOC_INTELLIGENCE_ENDPOINT", "").strip().rstrip("/")


def doc_intelligence_key() -> str:
    return os.getenv("AZURE_DOC_INTELLIGENCE_KEY", "").strip()


def is_doc_intelligence_configured() -> bool:
    return bool(doc_intelligence_endpoint() and doc_intelligence_key())


def _read_headers(key: str) -> dict[str, str]:
    return {
        "Ocp-Apim-Subscription-Key": key,
        "Content-Type": "application/octet-stream",
    }


def _lines_from_read_result(payload: dict[str, Any]) -> str:
    analyze = payload.get("analyzeResult") or {}
    read_results = analyze.get("readResults") or []
    lines: list[str] = []
    for page in read_results:
        for line in page.get("lines") or []:
            text = (line.get("text") or "").strip()
            if text:
                lines.append(text)
    return "\n".join(lines).strip()


async def _poll_operation(location: str, headers: dict[str, str]) -> str:
    deadline = time.monotonic() + _POLL_TIMEOUT_SEC
    verify = httpx_verify_arg()
    async with httpx.AsyncClient(timeout=30.0, verify=verify) as client:
        while time.monotonic() < deadline:
            response = await client.get(location, headers=headers)
            response.raise_for_status()
            payload = response.json()
            status = (payload.get("status") or "").lower()
            if status == "succeeded":
                return _lines_from_read_result(payload)
            if status == "failed":
                err = payload.get("error") or {}
                raise RuntimeError(err.get("message") or "Azure Read operation failed")
            await asyncio.sleep(_POLL_INTERVAL_SEC)
    raise TimeoutError("Azure Read operation timed out")


async def read_text_azure_vision(image_bytes: bytes, language: str = "en") -> str:
    """Run Azure Computer Vision Read on a single image."""
    endpoint = azure_vision_endpoint()
    key = azure_vision_key()
    if not endpoint or not key:
        return ""

    lang = (language or "en").strip().lower()[:2] or "en"
    url = f"{endpoint}{_READ_ANALYZE_PATH}"
    params = {"language": lang}
    headers = _read_headers(key)
    verify = httpx_verify_arg()

    try:
        async with httpx.AsyncClient(timeout=60.0, verify=verify) as client:
            response = await client.post(
                url,
                params=params,
                headers=headers,
                content=image_bytes,
            )
            response.raise_for_status()
            operation_location = response.headers.get("Operation-Location") or ""
            if not operation_location:
                raise RuntimeError("Azure Vision did not return Operation-Location")
            poll_headers = {"Ocp-Apim-Subscription-Key": key}
            text = await _poll_operation(operation_location, poll_headers)
            if text:
                logger.info("Azure Vision Read extracted %d characters", len(text))
            return text
    except Exception as exc:
        logger.warning("Azure Vision Read failed: %s", exc)
        return ""


async def read_text_document_intelligence(image_bytes: bytes) -> str:
    """Run Azure Document Intelligence prebuilt-read on a single image."""
    endpoint = doc_intelligence_endpoint()
    key = doc_intelligence_key()
    if not endpoint or not key:
        return ""

    url = (
        f"{endpoint}/formrecognizer/documentModels/prebuilt-read:analyze"
        "?api-version=2023-07-31"
    )
    headers = _read_headers(key)
    verify = httpx_verify_arg()

    try:
        async with httpx.AsyncClient(timeout=90.0, verify=verify) as client:
            response = await client.post(url, headers=headers, content=image_bytes)
            response.raise_for_status()
            operation_location = response.headers.get("Operation-Location") or ""
            if not operation_location:
                raise RuntimeError("Document Intelligence did not return Operation-Location")
            poll_headers = {"Ocp-Apim-Subscription-Key": key}
            text = await _poll_operation(operation_location, poll_headers)
            if text:
                logger.info("Document Intelligence Read extracted %d characters", len(text))
            return text
    except Exception as exc:
        logger.warning("Document Intelligence Read failed: %s", exc)
        return ""
