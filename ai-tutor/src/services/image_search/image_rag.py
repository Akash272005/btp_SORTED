"""
Image RAG Service
=================

Searches local extracted NCERT images by matching captions against user queries.
Images are stored under data/extracted_images/<class>/<subject>/<chapter>/images.json.

Primary image source for the agentic chat pipeline. Falls back to web search (Tavily)
when local results are insufficient.

Trigger reload: 2026-06-23T12:06:00
"""

import json
import math
import os
import re
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import Any

import logging

logger = logging.getLogger(__name__)

# Project root: bixy_AiTutor/
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent
_NCERT_IMAGES_DIR = _PROJECT_ROOT / "assets" / "ncert_images"
_EXTRACTED_IMAGES_DIR = _PROJECT_ROOT / "data" / "extracted_images"

# Prefer curated ncert_images/ when it exists, fall back to extracted_images/
_ACTIVE_IMAGES_DIR = _NCERT_IMAGES_DIR if _NCERT_IMAGES_DIR.exists() else _EXTRACTED_IMAGES_DIR

# Minimum image dimensions to filter out tiny icons/decorations
_MIN_WIDTH = 80
_MIN_HEIGHT = 80

# ─── In-memory image index cache ─────────────────────────────────────────────
# Key: kb_name or "all", Value: list of image metadata dicts
_image_index_cache: dict[str, list[dict[str, Any]]] = {}

# Lazily loaded chapter names database
_chapter_names_cache: dict[str, Any] | None = None

def _get_chapter_name(class_dir: str, subject: str, chapter_code: str) -> str | None:
    """Helper to query chapter_names.json for rationalized NCERT titles."""
    global _chapter_names_cache
    if _chapter_names_cache is None:
        try:
            path = _PROJECT_ROOT / "web" / "public" / "ncert" / "chapter_names.json"
            if path.exists():
                with open(path, "r", encoding="utf-8") as f:
                    _chapter_names_cache = json.load(f)
            else:
                _chapter_names_cache = {}
        except Exception as e:
            logger.warning(f"Failed to load chapter_names.json: {e}")
            _chapter_names_cache = {}

    cls_key = class_dir.lower().strip()
    sub_key = subject.lower().strip()
    ch_key = chapter_code.lower().strip()
    return _chapter_names_cache.get(cls_key, {}).get(sub_key, {}).get(ch_key)


# ─── Stopwords for simple keyword matching ───────────────────────────────────
_ENGLISH_STOPWORDS = frozenset({
    "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "shall", "can", "need", "dare", "ought",
    "to", "of", "in", "for", "on", "with", "at", "by", "from", "as",
    "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "again", "further", "then",
    "once", "here", "there", "when", "where", "why", "how", "all", "both",
    "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "just",
    "because", "but", "and", "or", "if", "while", "about", "what", "which",
    "who", "whom", "this", "that", "these", "those", "am", "it", "its",
    "i", "me", "my", "we", "our", "you", "your", "he", "him", "his",
    "she", "her", "they", "them", "their", "up", "down",
})

_HINDI_STOPWORDS = frozenset({
    "का", "के", "की", "है", "हैं", "था", "थी", "थे", "में", "से", "को",
    "पर", "ने", "और", "या", "एक", "यह", "वह", "जो", "तो", "भी", "कि",
    "इस", "उस", "हो", "कर", "हम", "आप", "मैं", "तुम", "वे", "ये",
    "नहीं", "अपने", "अपनी", "अपना", "कोई", "कुछ", "सब", "लिए", "साथ",
    "बाद", "पहले", "जैसे", "जब", "तक", "क्या", "कैसे", "कहाँ", "वाला",
    "वाली", "वाले", "ही", "तक", "दो",
})


def _tokenize(text: str) -> list[str]:
    """Tokenize text into lowercase words, removing punctuation."""
    text = text.lower()
    # Split on non-alphanumeric (preserving Devanagari)
    tokens = re.findall(r'[\w\u0900-\u097F]+', text, re.UNICODE)
    return [t for t in tokens if t and len(t) > 1
            and t not in _ENGLISH_STOPWORDS
            and t not in _HINDI_STOPWORDS]


def _compute_tf(tokens: list[str]) -> dict[str, float]:
    """Compute term frequency (normalized)."""
    counts = Counter(tokens)
    total = len(tokens)
    if total == 0:
        return {}
    return {t: c / total for t, c in counts.items()}


def _cosine_similarity(tf_query: dict[str, float], tf_doc: dict[str, float]) -> float:
    """Simple cosine similarity between two TF vectors."""
    common = set(tf_query.keys()) & set(tf_doc.keys())
    if not common:
        return 0.0

    dot = sum(tf_query[t] * tf_doc[t] for t in common)
    mag_q = math.sqrt(sum(v ** 2 for v in tf_query.values()))
    mag_d = math.sqrt(sum(v ** 2 for v in tf_doc.values()))

    if mag_q == 0 or mag_d == 0:
        return 0.0
    return dot / (mag_q * mag_d)


def _parse_kb_name(kb_name: str) -> tuple[str | None, str | None]:
    """
    Parse kb_name like 'ncert-class-10-science' or 'class_10_science' into (class_dir, subject_dir).

    Returns (None, None) for non-NCERT or unparseable names.
    Examples:
        'ncert-class-10-science'  → ('class-10', 'science')
        'class_10_science'        → ('class-10', 'science')
        'ncert-class-8'           → ('class-8', None)  # all subjects
        'custom-kb'               → (None, None)
    """
    if not kb_name:
        return None, None

    # Normalize to lowercase and replace underscores/spaces with hyphens
    normalized = kb_name.lower().replace("_", "-").replace(" ", "-")

    if normalized.startswith("ncert-"):
        normalized = normalized[len("ncert-"):]

    # Match 'class-N' or 'class-N-subject'
    m = re.match(r'^(class-\d+)(?:-(.+))?$', normalized)
    if not m:
        return None, None

    class_dir = m.group(1)   # e.g. 'class-10'
    subject = m.group(2)      # e.g. 'science' or None
    return class_dir, subject


def _load_images_from_dir(base_dir: Path) -> list[dict[str, Any]]:
    """Load all images.json files recursively under a directory."""
    images: list[dict[str, Any]] = []

    if not base_dir.exists():
        return images

    for json_path in base_dir.rglob("images.json"):
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if not isinstance(data, list):
                continue

            chapter_dir = json_path.parent
            
            # Attempt to retrieve class and subject from parent parts
            parts = json_path.parts
            class_name = None
            subject_name = None
            if len(parts) >= 4:
                class_name = parts[-4]  # e.g., 'class-8'
                subject_name = parts[-3]  # e.g., 'science'
                
            for entry in data:
                # Skip tiny images (icons, decorations)
                w = entry.get("width_px", 0)
                h = entry.get("height_px", 0)
                if w < _MIN_WIDTH or h < _MIN_HEIGHT:
                    continue

                caption = entry.get("caption", "")
                chapter_code = chapter_dir.name.lower()
                
                # Dynamically resolve correct chapter name using chapter_names.json
                resolved_chapter = None
                if class_name and subject_name:
                    resolved_chapter = _get_chapter_name(class_name, subject_name, chapter_code)
                
                chapter = resolved_chapter or entry.get("chapter", chapter_dir.name)
                
                # Replace the outdated bracketed prefix in the caption dynamically
                if resolved_chapter:
                    caption = re.sub(r'^\[[^\]]+\]', f'[{resolved_chapter}]', caption)

                # Build the API-serveable URL
                # Determine which source directory we're loading from
                # and map to the correct API mount point.
                original_url = entry.get("image_url", "")
                if original_url.startswith("/assets/ncert_images/"):
                    api_url = "/api/ncert-images/" + original_url[len("/assets/ncert_images/"):]
                elif original_url.startswith("/data/ncert_images/"):
                    api_url = "/api/ncert-images/" + original_url[len("/data/ncert_images/"):]
                elif original_url.startswith("/data/extracted_images/"):
                    api_url = "/api/extracted-images/" + original_url[len("/data/extracted_images/"):]
                else:
                    # Construct from file path — detect which base dir we're under
                    try:
                        rel = chapter_dir.relative_to(_NCERT_IMAGES_DIR) / entry.get("image_filename", "")
                        api_url = f"/api/ncert-images/{rel.as_posix()}"
                    except ValueError:
                        rel = chapter_dir.relative_to(_EXTRACTED_IMAGES_DIR) / entry.get("image_filename", "")
                        api_url = f"/api/extracted-images/{rel.as_posix()}"

                # Pre-tokenize caption for faster search
                caption_tokens = _tokenize(caption)

                images.append({
                    "image_url": api_url,
                    "caption": caption,
                    "caption_tokens": caption_tokens,
                    "caption_tf": _compute_tf(caption_tokens),
                    "chapter": chapter,
                    "chapter_code": chapter_dir.name.lower(),
                    "page": entry.get("page", 0),
                    "width_px": w,
                    "height_px": h,
                    "pdf_url": entry.get("pdf_url", ""),
                    "image_filename": entry.get("image_filename", ""),
                })

        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to load images from {json_path}: {e}")
            continue

    return images


def _get_image_index(kb_name: str) -> list[dict[str, Any]]:
    """
    Get or build the image index for a given knowledge base.
    Caches results in memory for performance.
    """
    cache_key = kb_name or "all"

    if cache_key in _image_index_cache:
        return _image_index_cache[cache_key]

    class_dir, subject = _parse_kb_name(kb_name)

    # Use the active images directory (ncert_images if available, else extracted_images)
    images_dir = _ACTIVE_IMAGES_DIR

    if class_dir and subject:
        # Specific class + subject: e.g. data/ncert_images/class-10/science/
        search_dir = images_dir / class_dir / subject
    elif class_dir:
        # Specific class, all subjects: e.g. data/ncert_images/class-10/
        search_dir = images_dir / class_dir
    else:
        # Non-NCERT or unknown → search everything (expensive but comprehensive)
        search_dir = images_dir

    images = _load_images_from_dir(search_dir)
    _image_index_cache[cache_key] = images

    logger.info(
        f"[ImageRAG] Loaded {len(images)} images for kb={kb_name} "
        f"from {search_dir}"
    )
    return images


def search_local_images(
    query: str,
    kb_name: str = "",
    top_k: int = 5,
    min_score: float = 0.05,
    chapter_code: str | None = None,
) -> list[dict[str, Any]]:
    """
    Search local extracted images by matching query against captions.

    Args:
        query: User message or AI response text to match against
        kb_name: Knowledge base name (e.g. 'ncert-class-10-science')
        top_k: Maximum number of images to return
        min_score: Minimum similarity score threshold
        chapter_code: Optional raw chapter code (e.g. 'iesc101') to boost matching chapter images

    Returns:
        List of image dicts with keys: image_url, caption, chapter, page,
        width_px, height_px, pdf_url, score, source
    """
    images = _get_image_index(kb_name)

    if not images:
        logger.info(f"[ImageRAG] No images found for kb={kb_name}")
        return []

    query_tokens = _tokenize(query)
    if not query_tokens:
        return []

    query_tf = _compute_tf(query_tokens)

    # Score each image
    scored: list[tuple[float, dict[str, Any]]] = []
    for img in images:
        if not img["caption_tokens"]:
            continue

        score = _cosine_similarity(query_tf, img["caption_tf"])

        # Bonus: exact token overlap count (boost for high overlap)
        query_set = set(query_tokens)
        caption_set = set(img["caption_tokens"])
        overlap = len(query_set & caption_set)
        if overlap > 0:
            score += 0.1 * overlap  # boost for each overlapping token

        # Boost if the image belongs to the selected chapter
        img_chap = img.get("chapter", "").lower()
        img_code = img.get("chapter_code", "").lower()
        if chapter_code and (img_code == chapter_code.lower() or img_chap == chapter_code.lower()):
            score += 2.0  # huge boost to prioritize current chapter!

        if score >= min_score:
            scored.append((score, img))

    # Sort by score descending
    scored.sort(key=lambda x: x[0], reverse=True)

    # Deduplicate by chapter+page (prefer highest scoring per page)
    seen_pages: set[str] = set()
    results: list[dict[str, Any]] = []

    for score, img in scored:
        page_key = f"{img['chapter']}:{img['page']}"
        if page_key in seen_pages:
            continue
        seen_pages.add(page_key)

        results.append({
            "image_url": img["image_url"],
            "caption": img["caption"],
            "chapter": img["chapter"],
            "page": img["page"],
            "width_px": img["width_px"],
            "height_px": img["height_px"],
            "pdf_url": img["pdf_url"],
            "score": round(score, 4),
            "source": "local",
        })

        if len(results) >= top_k:
            break

    # ── Fallback 1: If 0 results and we have chapter_code, fetch all images from that chapter ──
    if not results and chapter_code:
        logger.info(f"[ImageRAG] 0 matches found. Falling back to all images in chapter '{chapter_code}'")
        seen_pages = set()
        chapter_images = []
        for img in images:
            img_chap = img.get("chapter", "").lower()
            img_code = img.get("chapter_code", "").lower()
            if img_code == chapter_code.lower() or img_chap == chapter_code.lower():
                chapter_images.append(img)
        for img in chapter_images:
            page_key = f"{img['chapter']}:{img['page']}"
            if page_key in seen_pages:
                continue
            seen_pages.add(page_key)
            results.append({
                "image_url": img["image_url"],
                "caption": img["caption"],
                "chapter": img["chapter"],
                "page": img["page"],
                "width_px": img["width_px"],
                "height_px": img["height_px"],
                "pdf_url": img["pdf_url"],
                "score": 0.001,
                "source": "local",
            })
            if len(results) >= top_k:
                break

    # ── Fallback 2: If still 0 results, accept any images with a score > 0 (relax min_score filter) ──
    if not results:
        logger.info("[ImageRAG] 0 matches found. Relaxing min_score to 0.0 to find closest matches")
        scored_any = []
        for img in images:
            if not img["caption_tokens"]:
                continue
            score = _cosine_similarity(query_tf, img["caption_tf"])
            # Add small overlap bonus
            query_set = set(query_tokens)
            caption_set = set(img["caption_tokens"])
            overlap = len(query_set & caption_set)
            if overlap > 0:
                score += 0.1 * overlap
            if score > 0.0:
                scored_any.append((score, img))
        
        scored_any.sort(key=lambda x: x[0], reverse=True)
        seen_pages = set()
        for score, img in scored_any:
            page_key = f"{img['chapter']}:{img['page']}"
            if page_key in seen_pages:
                continue
            seen_pages.add(page_key)
            results.append({
                "image_url": img["image_url"],
                "caption": img["caption"],
                "chapter": img["chapter"],
                "page": img["page"],
                "width_px": img["width_px"],
                "height_px": img["height_px"],
                "pdf_url": img["pdf_url"],
                "score": round(score, 4),
                "source": "local",
            })
            if len(results) >= top_k:
                break

    # ── Fallback 3: If STILL 0 results (e.g. completely offline, no matching keywords, no selected chapter),
    # return the first few images from the active knowledge base so we always show something (compulsory images) ──
    if not results and images:
        logger.info("[ImageRAG] Still 0 matches found. Returning first available images as compulsory fallback")
        seen_pages = set()
        for img in images:
            page_key = f"{img['chapter']}:{img['page']}"
            if page_key in seen_pages:
                continue
            seen_pages.add(page_key)
            results.append({
                "image_url": img["image_url"],
                "caption": img["caption"],
                "chapter": img["chapter"],
                "page": img["page"],
                "width_px": img["width_px"],
                "height_px": img["height_px"],
                "pdf_url": img["pdf_url"],
                "score": 0.0001,
                "source": "local",
            })
            if len(results) >= top_k:
                break

    logger.info(
        f"[ImageRAG] Query '{query[:60]}...' → {len(results)} result(s) "
        f"from {len(images)} candidates (kb={kb_name})"
    )
    return results


def clear_cache() -> None:
    """Clear the in-memory image index cache."""
    global _chapter_names_cache
    _image_index_cache.clear()
    _chapter_names_cache = None
    logger.info("[ImageRAG] Cache cleared")
