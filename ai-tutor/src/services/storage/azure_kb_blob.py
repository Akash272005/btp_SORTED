# -*- coding: utf-8 -*-
"""
Azure Blob helpers for knowledge base file mirrors (upload + delete-by-prefix).

Upload layout matches uploads: ``{kb_name}/{YYYY/MM/DD}/{filename}``.
Deletes all blobs whose names start with ``{kb_name}/`` when a KB is removed.
"""

from datetime import datetime
import os
from pathlib import Path
from typing import Optional

from azure.storage.blob import BlobServiceClient

from src.app_logging import get_logger

logger = get_logger("AzureKBBlob")

_blob_container_client: Optional[object] = None
_blob_disabled_logged = False


def get_kb_blob_container_client():
    """
    Lazily construct the configured container client, or None if Azure is not configured.
    """
    global _blob_container_client, _blob_disabled_logged

    if _blob_container_client is not None:
        return _blob_container_client

    account_name = os.getenv("AZURE_BLOB_ACCOUNT_NAME")
    account_key = os.getenv("AZURE_BLOB_ACCOUNT_KEY")
    container_name = os.getenv("AZURE_BLOB_CONTAINER", "pdfs")
    connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")

    if not connection_string and not account_name:
        if not _blob_disabled_logged:
            logger.info("Azure Blob disabled (missing AZURE_BLOB_ACCOUNT_NAME or connection string)")
            _blob_disabled_logged = True
        return None

    try:
        if connection_string:
            service_client = BlobServiceClient.from_connection_string(connection_string)
        else:
            account_url = f"https://{account_name}.blob.core.windows.net"
            service_client = BlobServiceClient(account_url=account_url, credential=account_key)

        container_client = service_client.get_container_client(container_name)
        try:
            if not container_client.exists():
                container_client.create_container()
        except Exception:
            pass

        _blob_container_client = container_client
        return container_client
    except Exception as e:
        logger.warning(f"Azure Blob client init failed: {e}")
        return None


def upload_file_to_blob(local_path: Path, kb_name: str, filename: str) -> str | None:
    """Upload a local file to Azure Blob; return blob URL if successful."""
    container_client = get_kb_blob_container_client()
    if container_client is None:
        return None

    try:
        timestamp_path = datetime.utcnow().strftime("%Y/%m/%d")
        blob_name = f"{kb_name}/{timestamp_path}/{filename}"
        with open(local_path, "rb") as data:
            container_client.upload_blob(name=blob_name, data=data, overwrite=True)
        return f"{container_client.url}/{blob_name}"
    except Exception as e:
        logger.warning(f"Blob upload failed for '{filename}': {e}")
        return None


def delete_all_blobs_for_kb(kb_name: str) -> int:
    """
    Delete every blob whose path starts with ``{kb_name}/`` (same prefix as uploads).

    Returns the number of blobs deleted. If Azure is not configured, returns 0.
    Best-effort: logs warnings and continues on per-blob failures.
    """
    container_client = get_kb_blob_container_client()
    if container_client is None:
        return 0

    safe = (kb_name or "").strip().strip("/")
    if not safe:
        return 0

    prefix = f"{safe}/"
    deleted = 0
    try:
        for blob in container_client.list_blobs(name_starts_with=prefix):
            try:
                container_client.delete_blob(blob.name)
                deleted += 1
            except Exception as e:
                logger.warning(f"Failed to delete blob '{blob.name}': {e}")
        if deleted:
            logger.info(f"Removed {deleted} Azure blob(s) under prefix '{prefix}'")
    except Exception as e:
        logger.warning(f"Azure blob list/delete failed for KB '{kb_name}': {e}")

    return deleted
