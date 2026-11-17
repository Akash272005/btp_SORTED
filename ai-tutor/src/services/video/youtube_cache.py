"""
YouTube API Response Cache
============================
Persistent disk-based cache to avoid wasting YouTube API quota on repeated queries.
Cache expires after 24 hours (configurable).
"""

import json
import logging
import hashlib
from pathlib import Path
from datetime import datetime, timedelta
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

# Cache directory (relative to project root)
CACHE_DIR = Path(__file__).parent.parent.parent.parent / ".youtube_cache"
CACHE_EXPIRY_HOURS = 24


def _ensure_cache_dir():
    """Create cache directory if it doesn't exist."""
    CACHE_DIR.mkdir(exist_ok=True)


def _cache_key(query: str, language: Optional[str], max_results: int) -> str:
    """Generate cache key from search parameters."""
    key_str = f"{query.lower().strip()}|{language or 'en'}|{max_results}"
    return hashlib.md5(key_str.encode()).hexdigest()


def _cache_path(cache_key: str) -> Path:
    """Get file path for cache key."""
    return CACHE_DIR / f"{cache_key}.json"


def get_cached_youtube_results(
    query: str,
    language: Optional[str],
    max_results: int,
) -> Optional[Tuple[List[dict], bool]]:
    """
    Retrieve cached YouTube search results if available and not expired.
    
    Returns:
        Tuple of (results, is_fallback) or None if cache miss/expired
    """
    try:
        _ensure_cache_dir()
        key = _cache_key(query, language, max_results)
        cache_file = _cache_path(key)
        
        if not cache_file.exists():
            logger.debug(f"Cache miss for query: {query[:50]}")
            return None
        
        # Read cache file
        with open(cache_file, 'r', encoding='utf-8') as f:
            cached = json.load(f)
        
        # Check expiry
        cached_at = datetime.fromisoformat(cached.get("cached_at", ""))
        expiry = cached_at + timedelta(hours=CACHE_EXPIRY_HOURS)
        
        if datetime.now() > expiry:
            logger.info(f"Cache expired for query: {query[:50]}")
            cache_file.unlink(missing_ok=True)
            return None
        
        # Return cached results
        results = cached.get("results", [])
        is_fallback = cached.get("is_fallback", True)
        
        logger.info(
            "Cache HIT for query: %s (%d videos, cached %dh ago)",
            query[:50],
            len(results),
            (datetime.now() - cached_at).seconds // 3600,
        )
        return results, is_fallback
        
    except Exception as e:
        logger.error(f"Error reading cache: {e}")
        return None


def set_cached_youtube_results(
    query: str,
    language: Optional[str],
    max_results: int,
    results: List[dict],
    is_fallback: bool,
):
    """
    Cache YouTube search results to disk.
    """
    try:
        _ensure_cache_dir()
        key = _cache_key(query, language, max_results)
        cache_file = _cache_path(key)
        
        cache_data = {
            "query": query,
            "language": language,
            "max_results": max_results,
            "cached_at": datetime.now().isoformat(),
            "results": results,
            "is_fallback": is_fallback,
        }
        
        with open(cache_file, 'w', encoding='utf-8') as f:
            json.dump(cache_data, f, ensure_ascii=False, indent=2)
        
        logger.info("Cached %d videos for query: %s", len(results), query[:50])
        
    except Exception as e:
        logger.error(f"Error writing cache: {e}")


def clear_youtube_cache():
    """Clear all cached YouTube results."""
    try:
        if CACHE_DIR.exists():
            for cache_file in CACHE_DIR.glob("*.json"):
                cache_file.unlink()
            logger.info("Cleared YouTube cache")
    except Exception as e:
        logger.error(f"Error clearing cache: {e}")
