"""
YouTube & NPTEL Video Search Service
=====================================
Provides integrated video search for:
  - YouTube (general) via YouTube Data API v3
  - NPTEL (IIT lecture videos) scoped to the official NPTEL channel

Usage:
    from src.services.video.youtube_service import search_youtube, search_nptel

    # General YouTube search
    results = await search_youtube("photosynthesis class 10")

    # NPTEL-only search (IIT professors)
    results = await search_nptel("thermodynamics lecture")

Environment Variables:
    YOUTUBE_API_KEY — Google Cloud API key with YouTube Data API v3 enabled.
                      Get one at: https://console.cloud.google.com/
                      Free tier: 10,000 units/day (~100 searches/day)

Returns:
    List of VideoResult objects with embed URLs ready for frontend display.
"""

import os
import re
import logging
import urllib.parse
from dataclasses import dataclass, field
from typing import List, Optional, Sequence, Tuple

import httpx

from src.utils.tls_env import httpx_verify_arg

from .youtube_cache import (
    get_cached_youtube_results,
    set_cached_youtube_results,
)

logger = logging.getLogger(__name__)

# ─── Constants ────────────────────────────────────────────────────────────────

YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"
TAVILY_SEARCH_URL = "https://api.tavily.com/search"

# Tavily (web search) — used when YouTube Data API quota is exhausted or returns no usable videos.
TAVILY_API_KEY_ENV = "TAVILY_API_KEY"

_YT_PAGE_URL_ID_RE = re.compile(
    r"(?:youtube\.com/watch\?[^#\s]*[&?]v=|youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})\b",
    re.IGNORECASE,
)

# Education category improves recall for NCERT/classroom-style searches.
YOUTUBE_CATEGORY_EDUCATION = "27"

# Aligns with YouTube ``search.list`` ``videoDuration=medium`` (~4–20 minutes).
HOME_LECTURE_MIN_DURATION_SEC = 240
# Second pass only if we still lack enough topic-matched lectures.
HOME_LECTURE_RELAX_DURATION_SEC = 180

_HOME_TOPIC_STOPWORDS = frozenset(
    {
        "the",
        "and",
        "for",
        "are",
        "but",
        "not",
        "you",
        "all",
        "can",
        "her",
        "was",
        "one",
        "our",
        "out",
        "day",
        "get",
        "has",
        "him",
        "his",
        "how",
        "its",
        "new",
        "now",
        "see",
        "two",
        "way",
        "who",
        "let",
        "put",
        "say",
        "she",
        "too",
        "use",
        "chapter",
        "part",
        "introduction",
        "overview",
        "class",
        "science",
        "ncert",
        "cbse",
        "board",
        "exam",
        "full",
        "complete",
        "topic",
        "video",
        "lecture",
        "notes",
        "solution",
        "question",
        "questions",
        "की",
        "के",
        "को",
        "से",
        "पर",
        "में",
        "का",
        "कि",
        "है",
        "और",
        "पाठ",
        "अध्याय",
        "इस",
        "यह",
    }
)

# Official NPTEL YouTube channel ID (IIT/IISc lectures)
NPTEL_CHANNEL_ID = "UCc0RUBiEtAvKQjCE7FUMpQ"

# Trusted education channels for Home page suggestions (whitelist filter).
# Channel IDs verified against public YouTube Data API responses; adjust if rebrands occur.
TRUSTED_EDU_CHANNEL_IDS: frozenset = frozenset(
    {
        "UC4a-Gbdw__vbd2mbxjc9yCQ",  # Khan Academy
        "UCpjh3F5v8bq3NtHFB18aGbQ",  # Vedantu
        "UCphU2bAGmw304CFAzy0Enuw",  # Physics Wallah Foundation (official)
        "UCUnJyemd6s6VlEhAFws6hYg",  # Unacademy
        "UCd79f9XfVbHh-oNUyF5YsKg",  # NCERT Official (@ncertofficial)
    }
)

# Order used for quota-friendly per-channel fallback (globally-ranked results are often off-whitelist).
TRUSTED_EDU_CHANNEL_IDS_ORDERED: Tuple[str, ...] = (
    "UC4a-Gbdw__vbd2mbxjc9yCQ",  # Khan Academy
    "UCpjh3F5v8bq3NtHFB18aGbQ",  # Vedantu
    "UCphU2bAGmw304CFAzy0Enuw",  # Physics Wallah Foundation
    "UCd79f9XfVbHh-oNUyF5YsKg",  # NCERT Official
    "UCUnJyemd6s6VlEhAFws6hYg",  # Unacademy
)

# ─── Data Types ───────────────────────────────────────────────────────────────


@dataclass
class VideoResult:
    """A single video search result with metadata for frontend rendering."""

    video_id: str
    title: str
    description: str
    channel_title: str
    thumbnail_url: str
    embed_url: str
    watch_url: str
    source: str = "youtube"        # "youtube" | "nptel"
    duration: Optional[str] = None
    language: Optional[str] = None
    tags: List[str] = field(default_factory=list)

    @classmethod
    def from_search_item(cls, item: dict, source: str = "youtube") -> "VideoResult":
        """Build a VideoResult from a YouTube API search response item."""
        vid_id = item.get("id", {}).get("videoId", "")
        snippet = item.get("snippet", {})
        thumbnails = snippet.get("thumbnails", {})
        thumb = (
            thumbnails.get("high", {}).get("url")
            or thumbnails.get("medium", {}).get("url")
            or thumbnails.get("default", {}).get("url")
            or ""
        )
        return cls(
            video_id=vid_id,
            title=snippet.get("title", "Untitled"),
            description=snippet.get("description", ""),
            channel_title=snippet.get("channelTitle", ""),
            thumbnail_url=thumb,
            embed_url=f"https://www.youtube.com/embed/{vid_id}",
            watch_url=f"https://www.youtube.com/watch?v={vid_id}",
            source=source,
        )

    def to_dict(self) -> dict:
        return {
            "video_id": self.video_id,
            "title": self.title,
            "description": self.description,
            "channel_title": self.channel_title,
            "thumbnail_url": self.thumbnail_url,
            "embed_url": self.embed_url,
            "watch_url": self.watch_url,
            "source": self.source,
            "duration": self.duration,
            "language": self.language,
            "tags": self.tags,
        }


# ─── Core Search Functions ────────────────────────────────────────────────────


async def search_youtube(
    query: str,
    max_results: int = 5,
    channel_id: Optional[str] = None,
    language: Optional[str] = None,
) -> List[VideoResult]:
    """
    Search YouTube Data API v3 for videos matching the query.

    Args:
        query:        Search query string.
        max_results:  Max number of results to return (1-50).
        channel_id:   Optional channel ID to restrict results to one channel.
        language:     Optional ISO 639-1 language code (e.g., "hi" for Hindi).

    Returns:
        List of VideoResult objects, empty list on error.
    """
    api_key = os.getenv("YOUTUBE_API_KEY")
    if not api_key:
        logger.warning(
            "YOUTUBE_API_KEY not set. Video search will be unavailable. "
            "Get a key at https://console.cloud.google.com/"
        )
        return _fallback_search(query, channel_id)

    params: dict = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": min(max(1, max_results), 50),
        "key": api_key,
        "videoEmbeddable": "true",
        "safeSearch": "strict",
    }

    if channel_id:
        params["channelId"] = channel_id

    if language:
        params["relevanceLanguage"] = language

    source = "nptel" if channel_id == NPTEL_CHANNEL_ID else "youtube"

    try:
        async with httpx.AsyncClient(timeout=15.0, verify=httpx_verify_arg()) as client:
            response = await client.get(YOUTUBE_SEARCH_URL, params=params)
            response.raise_for_status()
            data = response.json()

        items = data.get("items", [])
        results = [VideoResult.from_search_item(item, source=source) for item in items]
        logger.info(f"YouTube search [{source}]: '{query}' → {len(results)} results")
        return results

    except httpx.HTTPStatusError as e:
        logger.error(f"YouTube API HTTP error: {e.response.status_code} — {e.response.text[:200]}")
        return _fallback_search(query, channel_id)
    except Exception as e:
        logger.error(f"YouTube search failed: {e}")
        return []


async def search_nptel(
    query: str,
    max_results: int = 5,
    language: Optional[str] = None,
) -> List[VideoResult]:
    """
    Search NPTEL's official YouTube channel for IIT/IISc lecture videos.

    NPTEL (National Programme on Technology Enhanced Learning) provides
    free, high-quality engineering and science lectures in English and
    regional Indian languages.

    Args:
        query:       Search query (e.g., "thermodynamics lecture").
        max_results: Max number of NPTEL videos to return.
        language:    Prefer "hi" for Hindi-translated lectures.

    Returns:
        List of VideoResult objects sourced from the NPTEL channel.
    """
    results = await search_youtube(
        query=query,
        max_results=max_results,
        channel_id=NPTEL_CHANNEL_ID,
        language=language,
    )

    # Tag all results as NPTEL source
    for r in results:
        r.source = "nptel"
        if "noc" in r.title.lower() or "iit" in r.channel_title.lower():
            r.tags.append("IIT")
        if "hindi" in r.title.lower() or "हिन्दी" in r.title:
            r.language = "hi"
        else:
            r.language = "en"

    return results


# ─── Home: trusted-channel video suggestions ────────────────────────────────────


def _parse_iso8601_duration(iso_duration: Optional[str]) -> str:
    """Turn PT1H2M3S / PT15M / PT45S into a short H:MM:SS or M:SS label."""
    if not iso_duration or not isinstance(iso_duration, str):
        return ""
    m = re.match(
        r"^PT(?:(?P<h>\d+)H)?(?:(?P<m>\d+)M)?(?:(?P<s>\d+)S)?$",
        iso_duration.strip(),
    )
    if not m:
        return ""
    h = int(m.group("h") or 0)
    mi = int(m.group("m") or 0)
    s = int(m.group("s") or 0)
    if h > 0:
        return f"{h}:{mi:02d}:{s:02d}"
    return f"{mi}:{s:02d}" if mi > 0 else f"0:{s:02d}"


def _iso8601_duration_seconds(iso_duration: Optional[str]) -> int:
    """Return total seconds from ISO 8601 duration, or 0 if unparsable."""
    if not iso_duration or not isinstance(iso_duration, str):
        return 0
    m = re.match(
        r"^PT(?:(?P<h>\d+)H)?(?:(?P<m>\d+)M)?(?:(?P<s>\d+)S)?$",
        iso_duration.strip(),
    )
    if not m:
        return 0
    h = int(m.group("h") or 0)
    mi = int(m.group("m") or 0)
    s = int(m.group("s") or 0)
    return h * 3600 + mi * 60 + s


def _video_result_from_video_resource(item: dict, source: str = "youtube") -> VideoResult:
    """Build VideoResult from a YouTube Data API v3 `videos` resource item."""
    vid_id = item.get("id", "") or ""
    snippet = item.get("snippet", {}) or {}
    thumbs = snippet.get("thumbnails", {}) or {}
    thumb = (
        thumbs.get("high", {}).get("url")
        or thumbs.get("medium", {}).get("url")
        or thumbs.get("default", {}).get("url")
        or ""
    )
    cd = item.get("contentDetails", {}) or {}
    duration_raw = cd.get("duration")
    return VideoResult(
        video_id=vid_id,
        title=snippet.get("title", "Untitled"),
        description=snippet.get("description", "") or "",
        channel_title=snippet.get("channelTitle", "") or "",
        thumbnail_url=thumb,
        embed_url=f"https://www.youtube.com/embed/{vid_id}" if vid_id else "",
        watch_url=f"https://www.youtube.com/watch?v={vid_id}" if vid_id else "",
        source=source,
        duration=_parse_iso8601_duration(duration_raw),
    )


def _dedupe_video_resources(items: List[dict]) -> List[dict]:
    by_id: dict = {}
    for it in items:
        vid = it.get("id")
        if vid and vid not in by_id:
            by_id[vid] = it
    return list(by_id.values())


def _manual_youtube_search_result(query: str) -> VideoResult:
    """Link to YouTube search for this topic — never a hardcoded unrelated watch URL."""
    raw = " ".join((query or "").split()).strip()
    if len(raw) > 500:
        raw = raw[:500].rsplit(" ", 1)[0]
    enc = urllib.parse.quote_plus(raw)
    label = raw if len(raw) <= 80 else raw[:77] + "…"
    return VideoResult(
        video_id="",
        title=f"Search YouTube: {label}",
        description="",
        channel_title="YouTube",
        thumbnail_url="",
        embed_url="",
        watch_url=f"https://www.youtube.com/results?search_query={enc}",
        source="youtube",
        duration=None,
    )


def _home_topic_enriched_queries(raw: str, language: Optional[str]) -> List[str]:
    """Topic-first query strings (avoid generic SEO like “CBSE topper” that pollutes results)."""
    base = " ".join((raw or "").split()).strip()
    if not base:
        return []
    if len(base) > 240:
        base = base[:240].rsplit(" ", 1)[0]
    if (language or "").lower().startswith("hi"):
        return [
            f"{base} पूरा अध्याय विस्तृत व्याख्या लेक्चर NCERT",
            f"{base} विस्तृत कक्षा व्याख्या अध्याय",
        ]
    return [
        f"{base} full chapter lecture detailed explanation NCERT class",
        f"{base} complete chapter detailed lecture class",
    ]


def build_home_suggested_prompts(query: str, language: Optional[str]) -> List[str]:
    """Short follow-up strings for chat input chips (no extra LLM call)."""
    q = " ".join((query or "").split()).strip()
    if len(q) > 100:
        q = q[:100].rsplit(" ", 1)[0]
    if not q:
        return []
    if (language or "").lower().startswith("hi"):
        return [
            f"{q} के अभ्यास प्रश्न दीजिए",
            f"{q} को सरल भाषा में समझाइए",
            f"{q} से जुड़े महत्वपूर्ण सूत्र",
            f"{q} पर एक संक्षिप्त नोट्स",
        ]
    return [
        f"Practice questions on {q}",
        f"Explain {q} with a real-life example",
        f"Important formulas related to {q}",
        f"Short revision notes on {q}",
    ]


_LEADING_SYMBOLS_AND_EMOJI = re.compile(
    r"^[\s\ufe0f\u200d\u2600-\u27bf\U0001f300-\U0001fadf\U00002700-\U000027bf]+",
    re.UNICODE,
)


def _sanitize_youtube_home_query(q: str) -> str:
    """Strip clutter (leading emoji/decoration) so search matches real chapter titles."""
    s = " ".join((q or "").split()).strip()
    if len(s) > 360:
        s = s[:360].rsplit(" ", 1)[0]
    prev = None
    while prev != s:
        prev = s
        s = _LEADING_SYMBOLS_AND_EMOJI.sub("", s).strip()
    return s


def _strip_enumeration_prefix(topic: str) -> str:
    """Turn ``1. What is Money`` into ``What is Money`` for cleaner web/Tavily queries."""
    s = " ".join((topic or "").split()).strip()
    return re.sub(r"^\s*\d+[\).\s]+\s*", "", s).strip() or s


def _tavily_api_key() -> str:
    return (os.getenv(TAVILY_API_KEY_ENV) or os.getenv("SEARCH_API_KEY") or "").strip()


def _is_youtube_quota_error(exc: httpx.HTTPStatusError) -> bool:
    if exc.response.status_code != 403:
        return False
    body = (exc.response.text or "").lower()
    return "quota" in body


def _youtube_watch_ids_from_url(url: str) -> List[str]:
    """Extract 11-char video id from a YouTube watch/embed URL; exclude Shorts paths."""
    u = (url or "").strip()
    if not u or "youtube.com/shorts/" in u.lower():
        return []
    m = _YT_PAGE_URL_ID_RE.search(u.replace("&amp;", "&"))
    return [m.group(1)] if m else []


def _tavily_normalize_video_title(raw: str) -> str:
    t = " ".join((raw or "").split()).strip() or "YouTube video"
    low = t.lower()
    if low.endswith(" - youtube"):
        t = t[: -len(" - youtube")].strip()
    elif low.endswith(" | youtube"):
        t = t[: -len(" | youtube")].strip()
    return t


def _is_hindi_ui_locale(language: Optional[str]) -> bool:
    return (language or "").lower().startswith("hi")


def _latin_topic_hint(phrase: str) -> str:
    """STEM-style Latin tokens mixed into Hindi queries (YouTube titles are rarely Devanagari)."""
    chunks = re.findall(r"[A-Za-z][A-Za-z0-9+\-]{1,31}", phrase or "")
    junk = frozenset(
        {"http", "https", "www", "com", "youtu", "youtube", "ncert", "cbse", "exam"}
    )
    seen: set[str] = set()
    out: List[str] = []
    for c in chunks:
        low = c.lower()
        if low in junk or low in seen:
            continue
        seen.add(low)
        out.append(c)
    return " ".join(out[:14])


def _latin_stem_tokens(phrase: str) -> set[str]:
    """Lowercased Latin tokens (len≥3) for matching English YouTube titles in Hindi sessions."""
    junk = frozenset(
        {
            "http",
            "https",
            "www",
            "com",
            "youtu",
            "youtube",
            "ncert",
            "cbse",
            "exam",
            "class",
            "chapter",
            "lecture",
            "video",
            "full",
            "hindi",
            "english",
            "medium",
        }
    )
    out: set[str] = set()
    for m in re.findall(r"[A-Za-z][A-Za-z0-9\-]{2,}", phrase or ""):
        low = m.lower()
        if low not in junk:
            out.add(low)
    return out


def _devanagari_topic_tokens(phrase: str) -> set[str]:
    toks = re.split(r"\s+", (phrase or "").strip())
    out: set[str] = set()
    for raw in toks:
        w = raw.strip(".,;:!?\"'()[]")
        if len(w) >= 3 and any("\u0900" <= c <= "\u097f" for c in w):
            out.add(w)
    return out


def _topic_indicates_chemistry(text: str) -> bool:
    low = (text or "").lower()
    if re.search(r"\b[df]\s*[-]?\s*block\b", low):
        return True
    if any(
        k in low
        for k in (
            "lanthanoid",
            "actinoid",
            "transition element",
            "electronic configuration",
            "oxidation state",
            "coordination compound",
            "class 12 chemistry",
            "class 11 chemistry",
        )
    ):
        return True
    lat = _latin_stem_tokens(text)
    chem = frozenset(
        {
            "oxidation",
            "lanthan",
            "actin",
            "transition",
            "orbital",
            "electron",
            "periodic",
            "ligand",
            "coordination",
            "covalent",
            "ionic",
            "electronic",
            "inorganic",
        }
    )
    return bool(lat & chem)


_GEO_SST_MISMATCH_NEEDLES: Tuple[str, ...] = (
    "human geography",
    "nature and scope",
    "geography class",
    "bhugol",
    "federalism",
    "social science",
    "sst class",
    "civics",
    "political science",
    "history chapter",
    "learning places",
    "places on the earth",
)


def _chem_topic_wrong_subject(title_l: str, blob_l: str, base_topic: str) -> bool:
    """When the chat topic is clearly chemistry, drop obvious Geography/SST/History hits."""
    if not _topic_indicates_chemistry(base_topic):
        return False
    hay = f"{title_l} {blob_l}"
    return any(n in hay for n in _GEO_SST_MISMATCH_NEEDLES)


def _hi_video_matches_topic(
    blob_l: str,
    blob_raw: str,
    latin_stems: set[str],
    hi_tokens: set[str],
    topic_tokens: set,
) -> bool:
    """Hindi UI: require overlap with Latin stems from topic and/or Devanagari tokens — never naked NCERT."""
    if latin_stems and _token_overlap_count(latin_stems, blob_l) >= 1:
        return True
    ascii_substantive = {
        t.lower()
        for t in topic_tokens
        if len(t) > 2
        and t.isascii()
        and t.lower() not in _HOME_TOPIC_STOPWORDS
    }
    if ascii_substantive and _token_overlap_count(ascii_substantive, blob_l) >= 1:
        return True
    br_low = blob_raw.lower()
    for h in hi_tokens:
        if len(h) >= 3 and (h in blob_raw or h.lower() in br_low):
            return True
    return False


def _youtube_relevance_language_home(locale: Optional[str]) -> Optional[str]:
    """
    Hindi sessions: omit relevanceLanguage for search.list. Educational uploads usually
    have English/Hinglish titles even when narration is Hindi; relevanceLanguage=hi
    hides most relevant hits.
    """
    if _is_hindi_ui_locale(locale):
        return None
    return locale


async def _tavily_discover_topic_youtube_videos(
    client: httpx.AsyncClient,
    topic_phrase: str,
    language: Optional[str],
    topic_tokens: set,
    max_results: int,
) -> List[VideoResult]:
    """
    Tavily-backed discovery (youtube.com only). Uses Tavily relevance scores plus
    syllabus token overlap — no YouTube quota (only Tavily billing/limits apply).
    """
    key = _tavily_api_key()
    if not key or max_results <= 0:
        return []

    overlap_gate = _overlap_gate_tokens(topic_tokens)
    if not overlap_gate:
        overlap_gate = {w for w in topic_tokens if len(w) > 2}

    base = _strip_enumeration_prefix(topic_phrase.strip())[:260]
    if len(base) < 2:
        return []

    chem_anchor = ""
    if _topic_indicates_chemistry(base):
        chem_anchor = (
            " Chemistry class 12 d-block f-block elements periodic table NCERT lecture"
        )

    if _is_hindi_ui_locale(language):
        hint = _latin_topic_hint(base)
        queries = [
            f"{base}{chem_anchor} NCERT lecture explained youtube",
            f"{base}{chem_anchor} CBSE chapter lecture detailed explanation",
            f"{base} पूरा अध्याय व्याख्या लेक्चर{chem_anchor}",
            f"{base} विस्तृत अध्याय समझाइए{chem_anchor}",
        ]
        if len(hint) >= 6:
            queries.append(f"{hint}{chem_anchor} NCERT class lecture CBSE youtube")
            queries.append(f"{hint}{chem_anchor} chapter lecture youtube explanation")
    else:
        queries = [
            f"{base} full chapter lecture detailed explanation NCERT class",
            f"{base} complete chapter lecture explained CBSE class",
        ]

    scored: dict[str, Tuple[float, VideoResult]] = {}

    for qi, q_raw in enumerate(queries):
        if len(scored) >= max_results * 6:
            break
        payload = {
            "api_key": key,
            "query": q_raw[:380],
            "search_depth": "advanced",
            "topic": "general",
            "max_results": min(15, 20),
            "include_answer": False,
            "include_raw_content": False,
            "include_images": False,
            "include_domains": ["youtube.com"],
        }
        try:
            resp = await client.post(TAVILY_SEARCH_URL, json=payload, timeout=48.0)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("Tavily YouTube discovery failed for query %r: %s", q_raw[:90], exc)
            continue

        for rank, item in enumerate(data.get("results") or []):
            url = (item.get("url") or "").strip()
            title_raw = (item.get("title") or "").strip() or "YouTube video"
            content = (item.get("content") or "")[:650]
            tav_score = float(item.get("score") if item.get("score") is not None else 0.0)

            title_disp = _tavily_normalize_video_title(title_raw)
            title_l = title_disp.lower()
            if _non_curriculum_clickbait_title(title_l):
                continue

            blob_l = f"{title_l} {content.lower()}"
            blob_raw = f"{title_disp} {content}"
            if _is_hindi_ui_locale(language):
                latin_stems = _latin_stem_tokens(base)
                hi_toks = _devanagari_topic_tokens(base)
                if not _hi_video_matches_topic(
                    blob_l, blob_raw, latin_stems, hi_toks, topic_tokens
                ):
                    continue
                if _chem_topic_wrong_subject(title_l, blob_l, base):
                    continue
                overlap_g = _token_overlap_count(latin_stems, blob_l)
                overlap_all = _token_overlap_count(topic_tokens, blob_l)
            elif overlap_gate:
                overlap_g = _token_overlap_count(overlap_gate, blob_l)
                if overlap_g < 1:
                    continue
                overlap_all = _token_overlap_count(topic_tokens, blob_l)
            else:
                overlap_g = 0
                overlap_all = _token_overlap_count(topic_tokens, blob_l)

            vids = _youtube_watch_ids_from_url(url)
            rank_prior = max(0, 420 - qi * 40 - rank * 12)
            for vid in vids:
                if len(vid) != 11:
                    continue
                composite = (
                    tav_score * 12_000.0
                    + overlap_g * 950.0
                    + overlap_all * 140.0
                    + rank_prior
                )
                vr = VideoResult(
                    video_id=vid,
                    title=title_disp[:220] or "YouTube video",
                    description=(content or "")[:500],
                    channel_title="YouTube",
                    thumbnail_url=f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg",
                    embed_url=f"https://www.youtube.com/embed/{vid}",
                    watch_url=f"https://www.youtube.com/watch?v={vid}",
                    source="youtube",
                    duration=None,
                )
                prev = scored.get(vid)
                if prev is None or composite > prev[0]:
                    scored[vid] = (composite, vr)

    ordered = sorted(scored.values(), key=lambda tup: tup[0], reverse=True)
    return [pair[1] for pair in ordered[:max_results]]


async def _youtube_search_ids(
    client: httpx.AsyncClient,
    api_key: str,
    query: str,
    max_results: int,
    language: Optional[str],
    channel_id: Optional[str] = None,
    video_category_id: Optional[str] = None,
    video_duration: Optional[str] = None,
) -> List[str]:
    params: dict = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": min(max(1, max_results), 50),
        "key": api_key,
        "videoEmbeddable": "true",
        "safeSearch": "strict",
    }
    if channel_id:
        params["channelId"] = channel_id
    if video_category_id:
        params["videoCategoryId"] = video_category_id
    if video_duration:
        params["videoDuration"] = video_duration
    if language:
        params["relevanceLanguage"] = language
    response = await client.get(YOUTUBE_SEARCH_URL, params=params)
    response.raise_for_status()
    data = response.json()
    ids: List[str] = []
    for item in data.get("items", []):
        vid = item.get("id", {}).get("videoId")
        if vid:
            ids.append(vid)
    return ids


async def _youtube_videos_list_details(
    client: httpx.AsyncClient,
    api_key: str,
    video_ids: Sequence[str],
) -> List[dict]:
    if not video_ids:
        return []
    # videos.list allows up to 50 ids per request
    chunk = list(dict.fromkeys(video_ids))[:50]
    params = {
        "part": "snippet,contentDetails,statistics",
        "id": ",".join(chunk),
        "key": api_key,
    }
    response = await client.get(YOUTUBE_VIDEOS_URL, params=params)
    response.raise_for_status()
    return response.json().get("items", [])


def _core_topic_tokens(topic_tokens: set) -> set:
    return {w for w in topic_tokens if len(w) > 2 and w not in _HOME_TOPIC_STOPWORDS}


def _overlap_gate_tokens(topic_tokens: set) -> set:
    core = _core_topic_tokens(topic_tokens)
    if core:
        return core
    return {w for w in topic_tokens if len(w) > 3}


def _snippet_blob_lower(it: dict) -> str:
    sn = it.get("snippet") or {}
    title = (sn.get("title") or "").lower()
    desc = (sn.get("description") or "")[:420].lower()
    return f"{title} {desc}"


def _token_overlap_count(tokens: set, blob: str) -> int:
    return sum(1 for w in tokens if len(w) > 2 and w in blob)


def _home_lecture_sort_key(
    it: dict,
    overlap_gate: set,
    topic_tokens: set,
) -> Tuple[int, int, int, int, int]:
    """
    Sort key: syllabus overlap first, then whitelist, then length, then views — never
    “trusted but irrelevant” ahead of on-topic results.
    """
    sn = it.get("snippet") or {}
    ch = sn.get("channelId", "") or ""
    blob = _snippet_blob_lower(it)
    overlap_g = _token_overlap_count(overlap_gate, blob)
    overlap_all = _token_overlap_count(topic_tokens, blob)
    trusted = 1 if ch in TRUSTED_EDU_CHANNEL_IDS else 0
    stats = it.get("statistics", {}) or {}
    try:
        views = int(stats.get("viewCount", "0") or 0)
    except (TypeError, ValueError):
        views = 0
    cd = it.get("contentDetails", {}) or {}
    secs = _iso8601_duration_seconds(cd.get("duration"))
    return (overlap_g, overlap_all, trusted, secs, views)


def _non_curriculum_clickbait_title(title_lower: str) -> bool:
    needles = (
        "#short",
        "#shorts",
        " shorts",
        "youtube shorts",
        "whatsapp status",
        "movie song",
        "full movie",
        "trailer",
        "tik tok",
        "giveaway",
        "free fire",
        " topper",
        "toppers ",
        "air 1",
        "national topper",
        "celebrating",
        "celebrations",
        "500/500",
        "full marks",
        " marks ",
        "#reels",
        "memes",
        "funny moment",
        " prank",
        "roast",
        "reaction video",
        "highlights",
        "vote for",
        " contest",
    )
    return any(n in title_lower for n in needles)


def _finalize_lectures_from_resources(
    items: List[dict],
    topic_tokens: set,
    exclude_ids: set,
    slots: int,
    language: Optional[str] = None,
    topic_phrase: str = "",
) -> List[VideoResult]:
    """
    Keep only lecture-length (>=4 min first, else >=3 min) videos that match the
    topic tokens in title/description, and block obvious clickbait/Shorts culture.
    """
    if slots <= 0 or not items:
        return []

    overlap_gate = _overlap_gate_tokens(topic_tokens)
    ranked = sorted(
        _dedupe_video_resources(items),
        key=lambda it: _home_lecture_sort_key(it, overlap_gate, topic_tokens),
        reverse=True,
    )

    hi = _is_hindi_ui_locale(language)
    require_token_overlap = bool(overlap_gate) and not hi

    out: List[VideoResult] = []
    picked: set = set(exclude_ids)
    for floor in (HOME_LECTURE_MIN_DURATION_SEC, HOME_LECTURE_RELAX_DURATION_SEC):
        for it in ranked:
            if len(out) >= slots:
                return out
            vid = it.get("id")
            if not vid or vid in picked:
                continue
            cd = it.get("contentDetails", {}) or {}
            secs = _iso8601_duration_seconds(cd.get("duration"))
            if secs < floor:
                continue

            blob = _snippet_blob_lower(it)
            sn = it.get("snippet", {}) or {}
            title_l = (sn.get("title") or "").lower()
            if _non_curriculum_clickbait_title(title_l):
                continue

            phrase = (topic_phrase or "").strip()
            if not phrase:
                phrase = " ".join(t for t in sorted(topic_tokens) if len(t) > 2)[:280]
            title_raw_hi = f"{sn.get('title') or ''} {(sn.get('description') or '')[:420]}"
            if hi:
                latin_stems = _latin_stem_tokens(phrase)
                hi_toks = _devanagari_topic_tokens(phrase)
                if not _hi_video_matches_topic(
                    blob, title_raw_hi, latin_stems, hi_toks, topic_tokens
                ):
                    continue
                if _chem_topic_wrong_subject(title_l, blob, phrase):
                    continue
            elif require_token_overlap and _token_overlap_count(overlap_gate, blob) < 1:
                continue

            vr = _video_result_from_video_resource(it, source="youtube")
            out.append(vr)
            picked.add(vid)
    return out



async def _home_education_discovery_fill(
    client: httpx.AsyncClient,
    api_key: str,
    sanitized_topic: str,
    language: Optional[str],
    topic_tokens: set,
    exclude_ids: set,
    slots: int,
    search_ids_impl=None,
    videos_list_impl=None,
) -> List[VideoResult]:
    """Broader syllabus search beyond whitelist; still gated by overlap + lecture length."""
    if slots <= 0:
        return []

    search_fn = search_ids_impl or _youtube_search_ids
    detail_fn = videos_list_impl or _youtube_videos_list_details
    rel_lang = _youtube_relevance_language_home(language)

    lang_pref = (language or "en").lower()
    bundles: List[Tuple[str, Optional[str], str]] = [
        (
            f"{sanitized_topic} full chapter lecture detailed explanation class",
            YOUTUBE_CATEGORY_EDUCATION,
            "medium",
        ),
        (
            f"{sanitized_topic} chapter lecture detailed explanation",
            YOUTUBE_CATEGORY_EDUCATION,
            "long",
        ),
        (sanitized_topic, YOUTUBE_CATEGORY_EDUCATION, "medium"),
        (f"{sanitized_topic} textbook chapter lecture", None, "long"),
    ]
    if lang_pref.startswith("hi"):
        bundles.insert(
            0,
            (
                f"{sanitized_topic[:240]} विस्तृत लेक्चर अध्याय व्याख्या",
                YOUTUBE_CATEGORY_EDUCATION,
                "medium",
            ),
        )

    gathered: List[str] = []
    exclude_flat = set(exclude_ids)
    for q_text, cat, vd in bundles:
        if len(gathered) >= 36:
            break
        qt = q_text.strip()[:320]
        if len(qt) < 4:
            continue
        ids = await search_fn(
            client,
            api_key,
            qt,
            max_results=15,
            language=rel_lang,
            channel_id=None,
            video_category_id=cat,
            video_duration=vd,
        )
        for vid in ids:
            if vid and vid not in exclude_flat and vid not in gathered:
                gathered.append(vid)

    if not gathered:
        return []

    detail = await detail_fn(client, api_key, gathered[:45])
    return _finalize_lectures_from_resources(
        detail,
        topic_tokens,
        exclude_ids,
        slots,
        language=language,
        topic_phrase=sanitized_topic,
    )


async def _try_tavily_home_videos(
    sanitized_topic: str,
    language: Optional[str],
    topic_tokens: set,
    max_results: int,
) -> List[VideoResult]:
    """Return up to ``max_results`` watch links via Tavily (no YouTube quota)."""
    if not _tavily_api_key() or max_results <= 0:
        return []
    phrase = _strip_enumeration_prefix(sanitized_topic)
    if len(phrase) < 2:
        return []
    try:
        async with httpx.AsyncClient(timeout=52.0, verify=httpx_verify_arg()) as client:
            return await _tavily_discover_topic_youtube_videos(
                client,
                phrase,
                language,
                topic_tokens,
                max_results,
            )
    except Exception as exc:
        logger.error("Tavily home video discovery failed: %s", exc)
        return []


async def search_youtube_home_trusted(
    query: str,
    max_results: int = 3,
    language: Optional[str] = None,
) -> Tuple[List[VideoResult], bool]:
    """
    Home: return ``max_results`` topic-ranked videos with real thumbnails/watch URLs.

    Prefer YouTube Data API (trusted channels + education); on quota errors or empty
    matches, fall back to Tavily web search scoped to youtube.com. Manual YouTube
    search link is last resort only.

    Successful video lists are cached 24h; bare search placeholders are not cached.
    """
    raw = " ".join((query or "").split()).strip()
    if not raw:
        return [], True

    sanitized = _sanitize_youtube_home_query(raw)
    topic_tokens = {t.lower() for t in re.split(r"\W+", sanitized) if t}

    cached = get_cached_youtube_results(sanitized, language, max_results)
    if cached is not None:
        cached_dicts, is_fallback = cached
        results = [
            VideoResult(**vd) if isinstance(vd, dict) else vd
            for vd in cached_dicts
        ]
        return results, is_fallback

    api_key = os.getenv("YOUTUBE_API_KEY")

    if not api_key:
        logger.warning("YOUTUBE_API_KEY not set; using Tavily for YouTube links if available.")
        tav = await _try_tavily_home_videos(sanitized, language, topic_tokens, max_results)
        if tav:
            set_cached_youtube_results(
                sanitized,
                language,
                max_results,
                [v.to_dict() for v in tav],
                False,
            )
            return tav, False
        return [_manual_youtube_search_result(sanitized)], True

    merged_resources: List[dict] = []
    results: List[VideoResult] = []
    yt_quota_blocked = False
    yt_rel_lang = _youtube_relevance_language_home(language)

    def pick_whitelisted_lectures() -> None:
        nonlocal results
        trusted_only = [
            it
            for it in merged_resources
            if (it.get("snippet", {}) or {}).get("channelId", "") in TRUSTED_EDU_CHANNEL_IDS
        ]
        taken = {v.video_id for v in results if v.video_id}
        slots = max(0, max_results - len(results))
        add = _finalize_lectures_from_resources(
            trusted_only,
            topic_tokens,
            taken,
            slots,
            language=language,
            topic_phrase=sanitized,
        )
        results.extend(add)

    try:
        async with httpx.AsyncClient(timeout=40.0, verify=httpx_verify_arg()) as client:
            async def guarded_search_ids(
                cli: httpx.AsyncClient,
                ak: str,
                qstr: str,
                max_results: int,
                language: Optional[str],
                channel_id=None,
                video_category_id=None,
                video_duration=None,
            ):
                nonlocal yt_quota_blocked
                if yt_quota_blocked:
                    return []
                try:
                    return await _youtube_search_ids(
                        cli,
                        ak,
                        qstr,
                        max_results,
                        language,
                        channel_id,
                        video_category_id,
                        video_duration,
                    )
                except httpx.HTTPStatusError as exc:
                    if _is_youtube_quota_error(exc):
                        if not yt_quota_blocked:
                            logger.warning(
                                "YouTube Data API quota exhausted for this session; "
                                "using Tavily-only discovery until restart."
                            )
                        yt_quota_blocked = True
                        return []
                    raise

            async def guarded_videos_list(cli: httpx.AsyncClient, ak: str, video_ids):
                nonlocal yt_quota_blocked
                if yt_quota_blocked or not video_ids:
                    return []
                try:
                    return await _youtube_videos_list_details(cli, ak, video_ids)
                except httpx.HTTPStatusError as exc:
                    if _is_youtube_quota_error(exc):
                        if not yt_quota_blocked:
                            logger.warning(
                                "YouTube videos.list quota exhausted; "
                                "using Tavily-only discovery until restart."
                            )
                        yt_quota_blocked = True
                        return []
                    raise

            search_queries = _home_topic_enriched_queries(sanitized, language)
            collected_ids: List[str] = []
            for sq in search_queries:
                if len(collected_ids) >= 28 or yt_quota_blocked:
                    break
                batch = await guarded_search_ids(
                    client,
                    api_key,
                    sq,
                    max_results=15,
                    language=yt_rel_lang,
                    channel_id=None,
                    video_category_id=None,
                    video_duration="medium",
                )
                for vid in batch:
                    if vid not in collected_ids:
                        collected_ids.append(vid)

            if collected_ids:
                merged_resources.extend(
                    await guarded_videos_list(client, api_key, collected_ids)
                )
            merged_resources = _dedupe_video_resources(merged_resources)
            pick_whitelisted_lectures()

            channel_q = (
                sanitized
                if len(sanitized) <= 260
                else sanitized[:260].rsplit(" ", 1)[0]
            )
            channel_q_focus = f"{channel_q} detailed chapter lecture"
            known_ids = {it.get("id") for it in merged_resources if it.get("id")}

            while len(results) < max_results and not yt_quota_blocked:
                prev_total = len(results)
                for ch_id in TRUSTED_EDU_CHANNEL_IDS_ORDERED:
                    if len(results) >= max_results:
                        break
                    slots_gap = max_results - len(results)
                    batch_ids = await guarded_search_ids(
                        client,
                        api_key,
                        channel_q_focus,
                        max_results=min(15, max(10, slots_gap + 8)),
                        language=yt_rel_lang,
                        channel_id=ch_id,
                        video_category_id=None,
                        video_duration="medium",
                    )
                    new_ids = [i for i in batch_ids if i not in known_ids]
                    if not new_ids:
                        continue
                    known_ids.update(new_ids)
                    detail = await guarded_videos_list(client, api_key, new_ids[:22])
                    merged_resources.extend(detail)
                    merged_resources = _dedupe_video_resources(merged_resources)
                pick_whitelisted_lectures()
                if len(results) == prev_total:
                    break

            if len(results) < max_results and not yt_quota_blocked:
                exclude_ids = {v.video_id for v in results if v.video_id}
                extra = await _home_education_discovery_fill(
                    client,
                    api_key,
                    sanitized,
                    language,
                    topic_tokens,
                    exclude_ids,
                    slots=max_results - len(results),
                    search_ids_impl=guarded_search_ids,
                    videos_list_impl=guarded_videos_list,
                )
                results.extend(extra)

            if results:
                final_results = results[:max_results]
                set_cached_youtube_results(
                    sanitized,
                    language,
                    max_results,
                    [v.to_dict() for v in final_results],
                    False,
                )
                return final_results, False

            logger.info(
                "YouTube home: no playable videos after discovery for %r.",
                sanitized[:120],
            )

    except httpx.HTTPStatusError as e:
        logger.error(
            "YouTube home search HTTP error: %s — %s",
            e.response.status_code,
            (e.response.text or "")[:200],
        )
    except Exception as e:
        logger.error("YouTube home search failed: %s", e)

    tav_results = await _try_tavily_home_videos(
        sanitized,
        language,
        topic_tokens,
        max_results,
    )
    if tav_results:
        set_cached_youtube_results(
            sanitized,
            language,
            max_results,
            [v.to_dict() for v in tav_results],
            False,
        )
        return tav_results, False

    return [_manual_youtube_search_result(sanitized)], True


# ─── Fallback (No API Key) ────────────────────────────────────────────────────


def _fallback_search(query: str, channel_id: Optional[str] = None) -> List[VideoResult]:
    """
    Returns a placeholder result pointing the user to search manually
    when no YouTube API key is configured.
    """
    encoded_query = query.replace(" ", "+")
    channel_suffix = f"+channel:{channel_id}" if channel_id else ""
    search_url = f"https://www.youtube.com/results?search_query={encoded_query}{channel_suffix}"

    return [
        VideoResult(
            video_id="",
            title=f"🔍 Search YouTube: {query}",
            description=(
                "YouTube API key not configured. "
                "Click to search YouTube manually. "
                "Set YOUTUBE_API_KEY in .env to enable in-app video search."
            ),
            channel_title="YouTube",
            thumbnail_url="",
            embed_url="",
            watch_url=search_url,
            source="nptel" if channel_id == NPTEL_CHANNEL_ID else "youtube",
        )
    ]


# ─── NPTEL Search Provider (plugs into existing search system) ────────────────


class NPTELSearchProvider:
    """
    Wraps NPTEL search as a simple provider compatible with the existing
    src/services/search system. Can be called from agents as a tool.
    """

    name = "nptel"
    description = "Search NPTEL IIT lecture videos (free, syllabus-aligned)"

    async def search(self, query: str, max_results: int = 5, **kwargs) -> dict:
        """
        Search NPTEL and return results in a format compatible with
        the existing WebSearchResponse structure.
        """
        results = await search_nptel(query, max_results=max_results)
        return {
            "query": query,
            "provider": "nptel",
            "results": [r.to_dict() for r in results],
            "answer": self._build_answer(results),
        }

    def _build_answer(self, results: List[VideoResult]) -> str:
        if not results:
            return "No NPTEL videos found for this topic."
        lines = ["Here are relevant NPTEL lecture videos from IIT professors:\n"]
        for i, r in enumerate(results, 1):
            lines.append(f"{i}. **{r.title}**")
            lines.append(f"   Channel: {r.channel_title}")
            lines.append(f"   Watch: {r.watch_url}\n")
        return "\n".join(lines)
