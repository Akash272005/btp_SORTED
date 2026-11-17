"""
Video Search Services
=====================
Provides YouTube and NPTEL video search capabilities.
"""

from .youtube_service import NPTELSearchProvider, search_nptel, search_youtube

__all__ = [
    "search_youtube",
    "search_nptel",
    "NPTELSearchProvider",
]
