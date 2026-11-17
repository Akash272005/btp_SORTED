"""Simple in-memory cache with optional Redis backend."""

import json
import os
import time
from typing import Any

_memory: dict[str, tuple[float, Any]] = {}
_DEFAULT_TTL = int(os.getenv("LMS_CACHE_TTL", "300"))


def _redis_client():
    try:
        import redis

        url = os.getenv("REDIS_URL")
        if url:
            return redis.from_url(url, decode_responses=True)
    except Exception:
        pass
    return None


def cache_get(key: str) -> Any | None:
    r = _redis_client()
    if r:
        raw = r.get(f"lms:{key}")
        return json.loads(raw) if raw else None
    entry = _memory.get(key)
    if not entry:
        return None
    expires, value = entry
    if time.time() > expires:
        del _memory[key]
        return None
    return value


def cache_set(key: str, value: Any, ttl: int = _DEFAULT_TTL) -> None:
    r = _redis_client()
    if r:
        r.setex(f"lms:{key}", ttl, json.dumps(value, default=str))
        return
    _memory[key] = (time.time() + ttl, value)


def cache_delete(key: str) -> None:
    r = _redis_client()
    if r:
        r.delete(f"lms:{key}")
        return
    _memory.pop(key, None)
