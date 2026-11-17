"""
Image Search Service

Provides functionality to search for educational images and diagrams.
"""

import os
import requests
import json
from typing import List, Dict, Any, Optional
from urllib.parse import quote
import logging

logger = logging.getLogger(__name__)


_HINDI_LOCALE_BLOCKED_HOSTS = (
    # Stock-photo / illustration banks — almost always English-labeled.
    "alamy.com",
    "vecteezy.com",
    "shutterstock.com",
    "depositphotos.com",
    "dreamstime.com",
    "istockphoto.com",
    "gettyimages.com",
    "freepik.com",
    "123rf.com",
    "can-stock-photo.com",
    "canstockphoto.com",
    "fotosearch.com",
    "stockphotosecrets.com",
    "stock.adobe.com",
    "adobestock.com",
    "stockvault.net",
    "pixabay.com",
    "unsplash.com",
)


def exclude_related_visual_image_candidate(
    url: str,
    *,
    context_link: str = "",
    title: str = "",
    snippet: str = "",
    width: Optional[int] = None,
    height: Optional[int] = None,
    visual_locale: str = "en",
) -> bool:
    """
    Drop URLs that almost always render as full textbook/PDF pages or junk hosts,
    instead of a single clean diagram.

    For ``visual_locale == "hi"`` we additionally drop English-only stock photo banks
    that nearly always carry Latin-only labels (alamy/vecteezy/shutterstock/…).
    """
    if not url or not url.strip():
        return True

    combined = f"{url}\n{context_link}\n{title}\n{snippet}".lower()

    if visual_locale == "hi" and any(host in combined for host in _HINDI_LOCALE_BLOCKED_HOSTS):
        return True

    bad_fragments = (
        ".pdf",
        "/pdf/",
        "pdf#page",
        "#page=",
        "drive.google.com/file",
        "drive.google.com/open",
        "docs.google.com/document",
        "docs.google.com/gview",
        "scribd.com",
        "slideshare.net",
        "issuu.com",
        "acrobat.adobe.com",
        "chrome-extension://",
        # Mirrors that overwhelmingly serve photographed/scanned NCERT pages
        "blogspot.com",
        "blogspot.in",
        # Blogger-hosted textbook scans often use this host; avoid blocking all googleusercontent.
        "blogger.googleusercontent.com",
        "pinimg.com",
        "pinterest.com",
        "instagram.com",
        "facebook.com",
        "fbcdn.net",
    )
    if any(x in combined for x in bad_fragments):
        return True

    try:
        iw = int(width) if width is not None else None
        ih = int(height) if height is not None else None
    except (TypeError, ValueError):
        iw = ih = None

    if iw and ih and iw > 0 and ih > 0:
        big = max(iw, ih)
        small = min(iw, ih)
        # Portrait textbook scans: both dimensions large, or extreme aspect ratio (column/page photo).
        if big >= 1350 and small >= 880:
            return True
        ar = big / small if small else 0.0
        if ar >= 2.35:
            return True

    return False

class ImageSearchResult:
    def __init__(self, url: str, title: str, description: str = "", source_url: str = ""):
        self.url = url
        self.title = title
        self.description = description
        self.source_url = source_url

def search_wikimedia_images(query: str, limit: int = 5) -> List[ImageSearchResult]:
    """
    Search Wikimedia Commons for images related to the query.
    Good for educational diagrams and illustrations.
    """
    try:
        print(f"   🔎 [Wikimedia] Searching for '{query}'...")
        # Wikimedia Commons API
        base_url = "https://commons.wikimedia.org/w/api.php"
        params = {
            "action": "query",
            "format": "json",
            "list": "search",
            "srsearch": f"{query} diagram illustration chart -pdf -djvu -tiff",
            "srnamespace": "6",  # File namespace
            "srlimit": limit * 3,  # Get more to filter
            "srinfo": "",
            "srprop": "title|snippet"
        }
        
        response = requests.get(base_url, params=params, timeout=10, headers={
            'User-Agent': 'bixy_AiTutor/1.0 (educational AI assistant)'
        })
        response.raise_for_status()
        data = response.json()
        
        results = []
        search_results_count = 0
        if "query" in data and "search" in data["query"]:
            search_results_count = len(data["query"]["search"])
            for item in data["query"]["search"]:
                title = item["title"]
                # Only process if it's an image file
                if any(title.lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".svg", ".gif"]):
                    # Get image info
                    info_params = {
                        "action": "query",
                        "format": "json",
                        "titles": title,
                        "prop": "imageinfo",
                        "iiprop": "url|extmetadata",
                        "iiurlwidth": 800
                    }
                    info_response = requests.get(base_url, params=info_params, timeout=10, headers={
                        'User-Agent': 'bixy_AiTutor/1.0 (educational AI assistant)'
                    })
                    if info_response.status_code == 200:
                        info_data = info_response.json()
                        pages = info_data.get("query", {}).get("pages", {})
                        for page_id, page_data in pages.items():
                            if "imageinfo" in page_data and page_data["imageinfo"]:
                                image_info = page_data["imageinfo"][0]
                                url = image_info.get("url", "")
                                description = image_info.get("extmetadata", {}).get("ImageDescription", {}).get("value", "")
                                source_url = f"https://commons.wikimedia.org/wiki/{quote(title)}"
                                
                                if url and is_diagram_like(url, description):
                                    results.append(ImageSearchResult(
                                        url=url,
                                        title=title.replace("File:", "").replace("_", " "),
                                        description=description[:200] if description else "",
                                        source_url=source_url
                                    ))
        
        print(f"      ✅ Wikimedia: {len(results)} images found (from {search_results_count} results)")
        return results[:limit]
    except Exception as e:
        print(f"      ❌ Wikimedia error: {e}")
        logger.error(f"Error searching Wikimedia: {e}")
        return []

def search_google_images(
    query: str,
    limit: int = 5,
    *,
    answer_locale: str = "en",
) -> List[ImageSearchResult]:
    """
    Search Google Images using Custom Search JSON API (Programmable Search Engine).

    Requires GOOGLE_API_KEY and GOOGLE_CSE_ID. Caller should pass a fully shaped query.
    ``answer_locale`` sets ``imgType`` (lineart for both locales) and for Hindi adds ``lr=lang_hi``,
    ``gl=in``, ``hl=hi``, plus negative site hints to reduce blog mirrors / Pinterest clutter.
    """
    try:
        print(f"   🔎 [Google] Searching for '{query}'...")
        api_key = os.getenv("GOOGLE_API_KEY")
        cse_id = os.getenv("GOOGLE_CSE_ID")

        if not api_key or not cse_id:
            print("      ⚠️ Google API key or CSE ID not configured")
            logger.warning("Google API key or CSE ID not configured")
            return []

        base_url = "https://www.googleapis.com/customsearch/v1"
        q_eff = query.strip()
        params: Dict[str, Any] = {
            "key": api_key,
            "cx": cse_id,
            "q": q_eff,
            "searchType": "image",
            "num": min(10, max(limit * 3, 8)),
            "safe": "active",
            "imgSize": "large",
        }
        # Prefer India / Hindi pages & UI hints when the tutor answered in Hindi.
        if answer_locale == "hi":
            params["lr"] = "lang_hi"
            params["gl"] = "in"
            params["hl"] = "hi"
            # "clipart" skews toward pasted textbook scans on blogs; lineart favors simpler diagrams.
            params["imgType"] = "lineart"
            # Reduce blog mirrors / social scrapbook hosts that mostly host page photos.
            params["q"] = (
                f"{q_eff} -site:blogspot.com -site:blogspot.in "
                "-site:pinterest.com -site:pinimg.com"
            )
        else:
            params["imgType"] = "lineart"
        
        response = requests.get(base_url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        
        results = []
        if "items" in data:
            for item in data["items"][:limit]:
                link = item.get("link") or ""
                img_meta = item.get("image") or {}
                ctx = img_meta.get("contextLink") or ""
                tw = img_meta.get("width")
                th = img_meta.get("height")
                try:
                    iw = int(tw) if tw is not None else None
                    ih = int(th) if th is not None else None
                except (TypeError, ValueError):
                    iw = ih = None
                if exclude_related_visual_image_candidate(
                    link,
                    context_link=ctx,
                    title=item.get("title") or "",
                    snippet=item.get("snippet") or "",
                    width=iw,
                    height=ih,
                ):
                    continue
                if is_diagram_like(
                    link, item.get("snippet", ""), answer_locale=answer_locale
                ):
                    results.append(ImageSearchResult(
                        url=link,
                        title=item.get("title", ""),
                        description=item.get("snippet", "")[:200],
                        source_url=ctx,
                    ))
        
        print(f"      ✅ Google: {len(results)} images found")
        return results
    except Exception as e:
        print(f"      ❌ Google error: {e}")
        logger.error(f"Error searching Google Images: {e}")
        return []

_HI_DIAGRAM_HINTS = ("आरेख", "चित्र", "संरेखण", "आलेख", "ग्राफ", "मानचित्र", "लेखाचित्र")


def is_diagram_like(url: str, description: str = "", *, answer_locale: str = "en") -> bool:
    """
    Filter to keep only diagram-like images.
    Hindi snippets rarely contain English words like \"diagram\"; accept Devanagari hints.
    """
    url_lower = url.lower()
    desc_lower = description.lower()
    if answer_locale == "hi" and description and any(h in description for h in _HI_DIAGRAM_HINTS):
        return True

    # Exclude photos, people, etc.
    exclude_terms = ["photo", "photograph", "person", "people", "face", "portrait", "animal", "nature", "landscape"]
    for term in exclude_terms:
        if term in desc_lower:
            return False
    
    # Include diagram terms
    include_terms = ["diagram", "chart", "graph", "illustration", "figure", "schematic", "map", "table", "plot"]
    for term in include_terms:
        if term in desc_lower or term in url_lower:
            return True
    
    # Check file extensions that are likely diagrams
    diagram_extensions = [".svg", ".png", ".jpg", ".jpeg"]
    for ext in diagram_extensions:
        if url_lower.endswith(ext):
            return True
    
    return False

def search_images(query: str, limit: int = 3) -> List[ImageSearchResult]:
    """
    Search for educational images using available providers.
    """
    print(f"\n{'='*80}")
    print(f"🖼️  IMAGE SEARCH FOR: '{query}'")
    print(f"{'='*80}")
    
    results = []
    
    # Try Wikimedia first (free, good for educational content)
    wikimedia_results = search_wikimedia_images(query, limit)
    results.extend(wikimedia_results)
    
    # If not enough, try Google (requires API key)
    if len(results) < limit:
        google_results = search_google_images(query, limit - len(results))
        results.extend(google_results)
    
    final_results = results[:limit]
    print(f"\n✅ FINAL RESULT: {len(final_results)} images found for '{query}'")
    if final_results:
        for i, result in enumerate(final_results, 1):
            print(f"   {i}. {result.title}")
            print(f"      URL: {result.url}")
    print(f"{'='*80}\n")
    
    return final_results

def generate_image_queries(explanation: str, llm_call) -> List[str]:
    """
    Use LLM to generate specific image search queries from the explanation.
    llm_call is a callable that takes prompt and max_tokens.
    """
    print(f"\n🔄 GENERATING IMAGE SEARCH QUERIES...")
    prompt = f"""
Analyze the following educational explanation and generate 2-3 specific, meaningful image search queries that would find relevant educational diagrams, charts, or illustrations.

Explanation:
{explanation[:500]}

Requirements:
- Each query should be specific to key visual concepts in the explanation
- Focus on diagrams, charts, illustrations, not photos
- Use terms like "diagram", "chart", "illustration", "figure" when appropriate
- Keep queries concise (5-10 words each)
- Make them suitable for educational content search

Return only the queries as a JSON array of strings, no other text.
Example: ["physics force diagram", "energy transfer chart", "motion illustration"]
"""
    
    try:
        response = llm_call(prompt, max_tokens=200)
        # Parse JSON
        queries = json.loads(response.strip())
        if isinstance(queries, list) and all(isinstance(q, str) for q in queries):
            print(f"✅ Generated queries: {queries}")
            return queries[:3]  # Max 3
        else:
            print(f"⚠️ Invalid query format received")
            return []
    except Exception as e:
        print(f"❌ Error generating image queries: {e}")
        logger.error(f"Error generating image queries: {e}")
        return []

__all__ = [
    "search_images",
    "generate_image_queries",
    "ImageSearchResult",
    "exclude_related_visual_image_candidate",
]
