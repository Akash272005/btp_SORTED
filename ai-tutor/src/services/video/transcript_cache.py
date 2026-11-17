"""Azure Blob cache for YouTube video transcripts (Video Learning)."""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from src.app_logging import get_logger

logger = get_logger("TranscriptCache")

_container_client: Optional[object] = None
_disabled_logged = False


def _truthy_env(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def cache_disabled() -> bool:
    return _truthy_env("TRANSCRIPT_CACHE_DISABLED", default=False)


def live_fetch_enabled() -> bool:
    """When false, production only serves transcripts already stored in blob."""
    return _truthy_env("TRANSCRIPT_LIVE_FETCH", default=True)


def _container_name() -> str:
    return os.getenv("TRANSCRIPT_CACHE_CONTAINER", "video-transcripts").strip() or "video-transcripts"


def _blob_name(video_id: str) -> str:
    return f"{video_id}.json"


def _blob_name_candidates(video_id: str) -> list[str]:
    """Canonical path first; legacy uploads used ``transcripts/{id}.json``."""
    return [_blob_name(video_id), f"transcripts/{video_id}.json"]


def get_transcript_container_client():
    """Return the transcript cache container client, or None if Azure is not configured."""
    global _container_client, _disabled_logged

    if cache_disabled():
        return None

    if _container_client is not None:
        return _container_client

    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "").strip()
    account_name = os.getenv("AZURE_BLOB_ACCOUNT_NAME", "").strip()
    account_key = os.getenv("AZURE_BLOB_ACCOUNT_KEY", "").strip()

    if not connection_string and not account_name:
        if not _disabled_logged:
            logger.info("Transcript cache disabled (Azure storage not configured)")
            _disabled_logged = True
        return None

    try:
        from azure.storage.blob import BlobServiceClient  # noqa: PLC0415

        if connection_string:
            service_client = BlobServiceClient.from_connection_string(connection_string)
        else:
            account_url = f"https://{account_name}.blob.core.windows.net"
            service_client = BlobServiceClient(account_url=account_url, credential=account_key)

        container_client = service_client.get_container_client(_container_name())
        try:
            if not container_client.exists():
                container_client.create_container()
        except Exception:
            pass

        _container_client = container_client
        return container_client
    except Exception as exc:
        logger.warning(f"Transcript cache container init failed: {exc}")
        return None


def _normalize_cached_payload(video_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    chunks = data.get("chunks") or []
    if not chunks:
        return None

    text = (data.get("text") or "").strip()
    if not text:
        text = " ".join(str(c.get("text", "")).strip() for c in chunks if c.get("text"))

    if not text:
        return None

    return {
        "success": True,
        "video_id": data.get("video_id") or video_id,
        "title": data.get("title") or f"YouTube: {video_id}",
        "chunks": chunks,
        "text": text,
        "source": "blob_cache",
    }


def read_cached_transcript(video_id: str) -> Optional[Dict[str, Any]]:
    """Load a cached transcript JSON blob for ``video_id``, if present."""
    container = get_transcript_container_client()
    if container is None:
        return None

    for blob_name in _blob_name_candidates(video_id):
        try:
            blob_client = container.get_blob_client(blob_name)
            if not blob_client.exists():
                continue
            raw = blob_client.download_blob().readall()
            data = json.loads(raw.decode("utf-8"))
            result = _normalize_cached_payload(video_id, data)
            if result:
                logger.info(f"Transcript cache hit for {video_id} ({blob_name})")
            return result
        except Exception as exc:
            logger.warning(f"Transcript cache read failed for {video_id} ({blob_name}): {exc}")
    return None


def write_cached_transcript(video_id: str, payload: Dict[str, Any]) -> bool:
    """Persist transcript payload to blob cache. Returns True on success."""
    container = get_transcript_container_client()
    if container is None:
        return False

    chunks = payload.get("chunks") or []
    text = (payload.get("text") or "").strip()
    if not chunks or not text:
        return False

    body = {
        "video_id": payload.get("video_id") or video_id,
        "title": payload.get("title") or f"YouTube: {video_id}",
        "chunks": chunks,
        "text": text,
        "cached_at": datetime.now(timezone.utc).isoformat(),
    }

    try:
        container.upload_blob(
            name=_blob_name(video_id),
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            overwrite=True,
            content_type="application/json",
        )
        logger.info(f"Transcript cached for {video_id}")
        return True
    except Exception as exc:
        logger.warning(f"Transcript cache write failed for {video_id}: {exc}")
        return False
