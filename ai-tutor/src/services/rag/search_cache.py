# -*- coding: utf-8 -*-
"""In-memory TTL cache for RAG search results."""

from __future__ import annotations

import time
from typing import Any

_DEFAULT_TTL_SECONDS = 900  # 15 minutes

_cache: dict[tuple[Any, ...], tuple[float, dict[str, Any]]] = {}


def _cache_key(
    query: str,
    kb_name: str | None,
    mode: str,
    kwargs: dict[str, Any],
) -> tuple[Any, ...]:
    extra = tuple(sorted((k, v) for k, v in kwargs.items() if k != "provider"))
    return (kb_name or "", mode, query, extra)


def get_cached_search(
    query: str,
    kb_name: str | None,
    mode: str,
    **kwargs: Any,
) -> dict[str, Any] | None:
    if query == "__warmup__":
        return None
    key = _cache_key(query, kb_name, mode, kwargs)
    entry = _cache.get(key)
    if not entry:
        return None
    expires_at, result = entry
    if time.monotonic() > expires_at:
        _cache.pop(key, None)
        return None
    return dict(result)


def set_cached_search(
    query: str,
    kb_name: str | None,
    mode: str,
    result: dict[str, Any],
    ttl_seconds: int = _DEFAULT_TTL_SECONDS,
    **kwargs: Any,
) -> None:
    if query == "__warmup__":
        return
    key = _cache_key(query, kb_name, mode, kwargs)
    _cache[key] = (time.monotonic() + ttl_seconds, dict(result))


def clear_search_cache() -> None:
    _cache.clear()
