import os
import re
import logging
from typing import Optional, Dict, Any, List

import requests

from src.services.video.transcript_cache import (
    cache_disabled,
    live_fetch_enabled,
    read_cached_transcript,
    write_cached_transcript,
)

logger = logging.getLogger(__name__)


def _youtube_https_proxy() -> str:
    """Optional HTTPS proxy for YouTube transcript fetches (required on cloud/datacenter IPs)."""
    proxy_url = os.environ.get("YOUTUBE_TRANSCRIPT_HTTPS_PROXY", "").strip()
    # Most residential/datacenter proxies speak HTTP CONNECT; https:// scheme breaks yt-dlp/requests.
    if proxy_url.startswith("https://"):
        proxy_url = "http://" + proxy_url[len("https://") :]
    return proxy_url


def _requests_proxies() -> Optional[Dict[str, str]]:
    proxy_url = _youtube_https_proxy()
    if not proxy_url:
        return None
    return {"http": proxy_url, "https": proxy_url}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_video_id(url: str) -> Optional[str]:
    """Extract YouTube video ID from URL."""
    youtube_regex = (
        r"(https?://)?(www\.)?"
        r"(youtube|youtu|youtube-nocookie)\.(com|be)/"
        r"(watch\?v=|embed/|v/|.+\?v=)?([^&=%\?]{11})"
    )
    m = re.search(youtube_regex, url)
    if m:
        return m.group(6)
    if len(url) == 11 and re.match(r'^[0-9A-Za-z_-]{11}$', url):
        return url
    return None


def is_english_text(text: str) -> bool:
    """Return True when text contains mostly ASCII/English characters."""
    if not text:
        return True
    english_chars = sum(1 for c in text if c.isascii() and (c.isalpha() or c.isspace()))
    total_chars = len([c for c in text if c.isalpha() or c.isspace()])
    if total_chars == 0:
        return True
    return (english_chars / total_chars) > 0.8


def get_video_title(video_id: str) -> str:
    """Get video title via YouTube oEmbed (no API key required)."""
    try:
        oembed_url = (
            f"https://www.youtube.com/oembed"
            f"?url=https://www.youtube.com/watch?v={video_id}&format=json"
        )
        resp = requests.get(oembed_url, timeout=5, proxies=_requests_proxies())
        if resp.status_code == 200:
            return resp.json().get("title", f"YouTube: {video_id}")
    except Exception:
        pass
    return f"YouTube: {video_id}"


# ---------------------------------------------------------------------------
# yt-dlp subtitle helpers
# ---------------------------------------------------------------------------

def _pick_subtitle_url(sub_dict: dict) -> Optional[tuple]:
    """Return (url, ext) for the best English subtitle track in a yt-dlp sub dict."""
    preferred_langs = ["en", "en-US", "en-GB"]

    def _best_format(formats: list) -> Optional[tuple]:
        for ext in ("json3", "vtt", "srv3", "srv2", "srv1"):
            for fmt in formats:
                if fmt.get("ext") == ext and fmt.get("url"):
                    return fmt["url"], ext
        return None

    # Exact preferred langs first
    for lang in preferred_langs:
        if lang in sub_dict:
            result = _best_format(sub_dict[lang])
            if result:
                return result

    # Any en* variant
    for lang_code, formats in sub_dict.items():
        if lang_code.startswith("en"):
            result = _best_format(formats)
            if result:
                return result

    return None


def _parse_json3(data: dict) -> List[Dict[str, Any]]:
    """Parse yt-dlp json3 subtitle format into chunks [{text, start, duration}]."""
    chunks = []
    for event in data.get("events", []):
        segs = event.get("segs", [])
        if not segs:
            continue
        text = "".join(s.get("utf8", "") for s in segs).replace("\n", " ").strip()
        if not text:
            continue
        start = event.get("tStartMs", 0) / 1000.0
        duration = event.get("dDurationMs", 2000) / 1000.0
        chunks.append({"text": text, "start": start, "duration": duration})
    return chunks


def _parse_vtt(vtt_text: str) -> List[Dict[str, Any]]:
    """Parse WebVTT subtitle text into chunks [{text, start, duration}]."""
    chunks = []
    lines = vtt_text.splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # Timestamp line: 00:00:01.000 --> 00:00:03.000
        if "-->" in line:
            parts = line.split("-->")
            try:
                start = _vtt_time_to_seconds(parts[0].strip())
                end = _vtt_time_to_seconds(parts[1].strip().split()[0])
                duration = max(0.0, end - start)
            except Exception:
                i += 1
                continue
            # Collect text lines until blank line
            i += 1
            text_parts = []
            while i < len(lines) and lines[i].strip():
                raw = re.sub(r"<[^>]+>", "", lines[i].strip())
                if raw:
                    text_parts.append(raw)
                i += 1
            text = " ".join(text_parts)
            if text:
                chunks.append({"text": text, "start": start, "duration": duration})
        else:
            i += 1
    return chunks


def _vtt_time_to_seconds(t: str) -> float:
    """Convert VTT timestamp (HH:MM:SS.mmm or MM:SS.mmm) to seconds."""
    t = t.split(".")[0] + "." + (t.split(".")[1] if "." in t else "000")
    parts = t.replace(",", ".").split(":")
    if len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + float(parts[2])
    return int(parts[0]) * 60 + float(parts[1])


# ---------------------------------------------------------------------------
# Primary: yt-dlp transcript fetch
# ---------------------------------------------------------------------------

def _fetch_via_ytdlp(video_id: str) -> Optional[Dict[str, Any]]:
    """Fetch transcript using yt-dlp (primary method — bypasses YouTube IP blocks).

    Returns a result dict on success, or None so callers can fall back.
    """
    try:
        import yt_dlp  # noqa: PLC0415
    except ImportError:
        logger.warning("yt-dlp not installed; skipping to fallback")
        return None

    yt_url = f"https://www.youtube.com/watch?v={video_id}"
    ydl_opts = {
        "writesubtitles": True,
        "writeautomaticsub": True,
        "subtitleslangs": ["en", "en-US", "en-GB"],
        "subtitlesformat": "json3/vtt/best",
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
    }
    proxy_url = _youtube_https_proxy()
    if proxy_url:
        logger.info("yt-dlp: using HTTPS proxy for transcript fetch")
        ydl_opts["proxy"] = proxy_url

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(yt_url, download=False)
    except Exception as e:
        logger.warning(f"yt-dlp extract_info failed for {video_id}: {e}")
        return None

    if not info:
        return None

    title = info.get("title", f"YouTube: {video_id}")

    # Try manual subtitles, then auto-generated captions
    subtitle_url, subtitle_ext = None, None
    for sub_source in [info.get("subtitles") or {}, info.get("automatic_captions") or {}]:
        result = _pick_subtitle_url(sub_source)
        if result:
            subtitle_url, subtitle_ext = result
            break

    if not subtitle_url:
        logger.info(f"yt-dlp: no English subtitles found for {video_id}")
        return None

    try:
        resp = requests.get(subtitle_url, timeout=15, proxies=_requests_proxies())
        resp.raise_for_status()
    except Exception as e:
        logger.warning(f"yt-dlp: failed to download subtitle file for {video_id}: {e}")
        return None

    chunks: List[Dict[str, Any]] = []
    if subtitle_ext == "json3":
        try:
            chunks = _parse_json3(resp.json())
        except Exception as e:
            logger.warning(f"yt-dlp: json3 parse error for {video_id}: {e}")
            return None
    else:
        chunks = _parse_vtt(resp.text)

    if not chunks:
        logger.info(f"yt-dlp: empty transcript after parsing for {video_id}")
        return None

    full_text = " ".join(c["text"] for c in chunks)
    logger.info(f"yt-dlp: successfully fetched transcript for {video_id} ({len(chunks)} chunks)")
    return {
        "success": True,
        "video_id": video_id,
        "title": title,
        "chunks": chunks,
        "text": full_text,
    }


# ---------------------------------------------------------------------------
# Fallback: youtube-transcript-api (with optional proxy)
# ---------------------------------------------------------------------------

def _build_transcript_api():
    """Build YouTubeTranscriptApi, routing through proxy when configured."""
    from youtube_transcript_api import YouTubeTranscriptApi  # noqa: PLC0415
    from youtube_transcript_api.proxies import GenericProxyConfig  # noqa: PLC0415

    proxy_url = _youtube_https_proxy()
    if proxy_url:
        logger.info("youtube-transcript-api: using HTTPS proxy")
        proxy_config = GenericProxyConfig(http_url=proxy_url, https_url=proxy_url)
        return YouTubeTranscriptApi(proxy_config=proxy_config)
    return YouTubeTranscriptApi()


def _is_ip_blocked_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return any(kw in msg for kw in ("ipblocked", "requestblocked", "ip has been blocked", "cloud provider"))


def _select_english_transcript(transcripts: list):
    """Pick the best English transcript from a list returned by youtube-transcript-api."""
    for t in transcripts:
        if t.language_code in ("en", "en-US", "en-GB"):
            return t
    for t in transcripts:
        if t.language_code.startswith("en"):
            return t
    for t in transcripts:
        if "en" in t.language_code.lower() and t.is_generated:
            return t
    return transcripts[0] if transcripts else None


def _fetch_via_transcript_api(video_id: str) -> Optional[Dict[str, Any]]:
    """Fetch transcript using youtube-transcript-api (fallback).

    Returns a result dict on success, or None on failure.
    """
    try:
        api = _build_transcript_api()
        transcript_list = list(api.list(video_id))
    except Exception as e:
        if _is_ip_blocked_error(e):
            logger.error(
                "youtube-transcript-api: YouTube IP block detected. "
                "Set YOUTUBE_TRANSCRIPT_HTTPS_PROXY to a residential proxy URL."
            )
        else:
            logger.warning(f"youtube-transcript-api list failed for {video_id}: {e}")
        return None

    if not transcript_list:
        return None

    target = _select_english_transcript(transcript_list)
    if not target:
        return None

    try:
        transcript_data = target.fetch()
    except Exception as e:
        logger.warning(f"youtube-transcript-api fetch failed for {video_id}: {e}")
        return None

    chunks: List[Dict[str, Any]] = []
    text_parts: List[str] = []
    for snippet in transcript_data.snippets:
        text = snippet.text.replace("\n", " ")
        text_parts.append(text)
        chunks.append({
            "text": text,
            "start": float(snippet.start),
            "duration": float(snippet.duration),
        })

    if not chunks:
        return None

    title = get_video_title(video_id)
    return {
        "success": True,
        "video_id": video_id,
        "title": title,
        "chunks": chunks,
        "text": " ".join(text_parts),
    }


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def _fetch_live(video_id: str) -> Optional[Dict[str, Any]]:
    """Fetch transcript directly from YouTube (yt-dlp, then youtube-transcript-api)."""
    result = _fetch_via_ytdlp(video_id)
    if result:
        return result

    logger.info(f"yt-dlp failed for {video_id}, trying youtube-transcript-api fallback")
    return _fetch_via_transcript_api(video_id)


def _cache_miss_error(video_id: str) -> Dict[str, Any]:
    return {
        "success": False,
        "video_id": video_id,
        "error": (
            "Transcript is not cached for this video yet. "
            "An admin can prefetch it from a home connection with: "
            "python scripts/publish_video_transcripts.py --video-id "
            f"{video_id}"
        ),
        "chunks": [],
        "text": "",
    }


def _live_fetch_error(video_id: str) -> Dict[str, Any]:
    proxy_hint = ""
    if not _youtube_https_proxy():
        proxy_hint = (
            " If this server has a cloud-provider IP, prefetch the transcript into "
            "Azure Blob (scripts/publish_video_transcripts.py) or set "
            "YOUTUBE_TRANSCRIPT_HTTPS_PROXY to a residential proxy URL."
        )
    return {
        "success": False,
        "video_id": video_id,
        "error": (
            "Could not retrieve a transcript for this video. "
            "The video may have no captions, or YouTube is blocking requests from this server."
            + proxy_hint
        ),
        "chunks": [],
        "text": "",
    }


def _fetch_best(
    video_id: str,
    *,
    skip_cache: bool = False,
    force_live: bool = False,
) -> Dict[str, Any]:
    """Resolve transcript from blob cache and/or live YouTube fetch."""
    if not skip_cache and not cache_disabled():
        cached = read_cached_transcript(video_id)
        if cached:
            return cached

    if force_live or live_fetch_enabled():
        result = _fetch_live(video_id)
        if result:
            if not cache_disabled():
                write_cached_transcript(video_id, result)
            return result

        return _live_fetch_error(video_id)

    return _cache_miss_error(video_id)


def fetch_transcript(url: str, *, skip_cache: bool = False, force_live: bool = False) -> Dict[str, Any]:
    """Fetch plain-text transcript for a YouTube video URL (used by agent tools)."""
    video_id = extract_video_id(url)
    if not video_id:
        return {
            "success": False,
            "error": f"Could not extract a valid YouTube video ID from: {url}",
            "text": "",
        }

    result = _fetch_best(video_id, skip_cache=skip_cache, force_live=force_live)
    # Normalise shape expected by agent tool callers
    if not result.get("text"):
        result["text"] = ""
    return result


def fetch_transcript_with_timestamps(
    url: str,
    *,
    skip_cache: bool = False,
    force_live: bool = False,
) -> Dict[str, Any]:
    """Fetch timestamped transcript chunks for the Video Learning page."""
    video_id = extract_video_id(url)
    if not video_id:
        return {
            "success": False,
            "error": f"Could not extract a valid YouTube video ID from: {url}",
            "chunks": [],
        }

    result = _fetch_best(video_id, skip_cache=skip_cache, force_live=force_live)
    if not result.get("chunks"):
        result["chunks"] = []
    return result
