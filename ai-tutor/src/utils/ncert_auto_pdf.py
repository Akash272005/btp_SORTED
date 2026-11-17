"""
When NCERT RAG returns nothing, pick a likely NCERT PDF from manifest.json
and extract a text window (same strategy as chat PDF excerpts).

Resolution order (all classes / subjects in manifest are reachable):
1) Explicit text: "class 9 science chapter 5" → that PDF.
2) Curated topic→chapter hints below (we add more over time; not only class 12).
3) Word overlap across every manifest row (any class) when the query shares
   enough tokens with a filename/label/path.

Keeps answers grounded in real NCERT files served from Azure Blob storage.
"""

from __future__ import annotations

import json
import os
import re
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

# Cache for PDF text to avoid redundant downloads/parsing
_pdf_text_cache: dict[str, tuple[int, str]] = {}

# --- Azure Blob Storage Configuration (blob-only, no local fallback) ---
CLOUD_BASE_URL = os.getenv("NCERT_STORAGE_BASE_URL", "https://bixyblob355528.blob.core.windows.net/pdfs/ncert/").rstrip("/") + "/"

# (trigger substrings in user message), class key, manifest subject key, chapter number
# More specific triggers first (e.g. microbes before generic "biology" overlaps).
_TOPIC_CHAPTER_HINTS: list[tuple[tuple[str, ...], str, str, int]] = [
    (
        ("microbe", "microbial", "ferment", "welfare", "antibiotic", "biodegrad", "bacteria"),
        "class-12",
        "biology",
        10,
    ),
    (("reproduction", "menstrual", "fertil", "gamete", "embryo", "implant"), "class-12", "biology", 3),
    (("biotechnology", "recombinant", "dna", "plasmid", "pcr"), "class-12", "biology", 12),
    (("ecosystem", "population", "succession"), "class-12", "biology", 13),
    (("biodiversity", "conservation", "hotspot"), "class-12", "biology", 15),
    (("immunity", "vaccin", "disease", "pathogen", "aids", "cancer"), "class-12", "biology", 8),
    (("principle", "inheritance", "variation", "mendel", "genetics"), "class-12", "biology", 5),
    (("molecular", "basis", "gene", "expression"), "class-12", "biology", 6),
    (("evolution", "origin", "life", "darwin"), "class-12", "biology", 7),
    (("linear", "equation", "variable", "pair of"), "class-10", "maths", 3),
    (("quadratic", "polynomial"), "class-10", "maths", 4),
    (("triangle", "similar", "pythagoras"), "class-10", "maths", 6),
    (("coordinate", "geometry", "distance formula"), "class-10", "maths", 7),
    (("circle", "tangent", "arc"), "class-10", "maths", 10),
    # Class 10 science (single "science" book in manifest)
    (("light", "reflection", "refraction", "lens", "mirror", "prism"), "class-10", "science", 10),
    (("electric", "circuit", "ohm", "resistor", "current", "magnetic"), "class-10", "science", 12),
    (("acid", "base", "salt", "ph", "metal", "nonmetal"), "class-10", "science", 3),
    # Class 9 science
    (("gravitation", "gravity", "free fall", "mass", "weight"), "class-9", "science", 10),
    (("atom", "molecule", "structure of", "element", "compound"), "class-9", "science", 3),
    (("tissue", "epithelial", "meristem", "xylem", "phloem"), "class-9", "science", 6),
    # Class 8 science
    (("microorganism", "microorganisms", "cell", "organism", "conservation"), "class-8", "science", 2),
    # Class 11 (separate books: bio / chem / phy)
    (("living world", "biodiversity", "classification", "taxonomic"), "class-11", "biology", 1),
    (("cell", "theory", "cell cycle", "mitosis", "meiosis"), "class-11", "biology", 10),
    (("respiration", "photosynthesis", "plant growth", "respiratory"), "class-11", "biology", 14),
    (("stoichiometry", "mole concept", "empirical", "molecular formula"), "class-11", "chemistry", 1),
    (("equilibrium", "le chatelier", "ionic"), "class-11", "chemistry", 7),
    (("hydrocarbon", "alkane", "alkene", "benzene", "organic"), "class-11", "chemistry", 12),
    (("physical world", "measurement", "fundamental", "dimensions"), "class-11", "physics", 1),
    (("kinematic", "projectile", "relative motion"), "class-11", "physics", 4),
    (("newton", "law of motion", "momentum", "friction", "impulse"), "class-11", "physics", 5),
    (("work", "energy", "power", "collision", "potential energy"), "class-11", "physics", 6),
    # Class 6–7 science (combined book)
    (("food", "nutrition", "component", "diet"), "class-7", "science", 2),
    (("heat", "temperature", "thermometer", "conduction"), "class-7", "science", 4),
]


def _resolve_ncert_pdf_resource(pdf_url: str) -> tuple[str, str]:
    """Returns (blob_access_url, "") — always uses Azure Blob, no local fallback."""
    raw = (pdf_url or "").strip()
    if not raw:
        return "", ""
    # If already a full https URL, return it as-is
    if raw.startswith(("http://", "https://")):
        return raw, ""
    # Relative path — build full blob URL
    rel = raw.lstrip("/")
    cloud_url = f"{CLOUD_BASE_URL}{rel}"
    return cloud_url, ""

def _fetch_pdf_bytes(url: str, timeout: int = 120) -> bytes:
    req = Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; Bixy-AiTutor-Guide/1.0)"},
    )
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _fitz_extract_text(*, path: Path | None, stream: bytes | None, max_pages: int) -> str:
    """Read up to max_pages from a local path or in-memory PDF bytes."""
    if path is None and not stream:
        return ""
    try:
        import fitz  # PyMuPDF

        if path is not None:
            doc = fitz.open(str(path))
        else:
            doc = fitz.open(stream=stream, filetype="pdf")
        try:
            chunks: list[str] = []
            for i, page in enumerate(doc):
                if i >= max_pages:
                    break
                chunks.append(page.get_text())
            return "\n\n".join(chunks)
        finally:
            doc.close()
    except Exception:
        return ""


def _pdf_url_to_relative_public_path(pdf_url: str) -> str:
    raw = (pdf_url or "").strip()
    if not raw:
        return ""
    if "://" in raw:
        raw = unquote((urlparse(raw).path or "").strip())

    # Strip leading ncert/ if it's there to normalize
    p = raw.lstrip("/")
    return p


def _build_pdf_excerpt(full_text: str, user_message: str, max_chars: int) -> str:
    """
    Prefer a window around specific query terms; otherwise head+tail.
    Avoid anchoring on common words like 'chapter' or 'class' which appear early.
    """
    if len(full_text) <= max_chars:
        return full_text
    
    msg = user_message or ""
    text_lower = full_text.lower()
    
    # Exclude common stop words that cause early anchoring
    STOP_WORDS = {"chapter", "ncert", "class", "subject", "page", "book", "exercise", "solution", "class-", "ncert-"}
    
    # 1. Try to find specific topic words
    words = sorted(
        {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9+]{3,}", msg) if w.lower() not in STOP_WORDS},
        key=len,
        reverse=True,
    )
    
    # 2. Also try quoted phrases
    phrases = []
    for m in re.findall(r"'([^']{8,})'|\"([^\"]{8,})\"", msg):
        phrase = (m[0] or m[1] or "").strip().lower()
        if len(phrase) >= 8:
            phrases.append(phrase)
            
    # Priority: Phrases > Specific Words > Fallback to all words
    search_terms = phrases + words
    if not search_terms:
        search_terms = sorted(
            {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9+]{3,}", msg)},
            key=len,
            reverse=True,
        )

    best_idx = -1
    for w in search_terms:
        if len(w) < 4 and w not in phrases:
            continue
        idx = text_lower.find(w)
        if idx != -1:
            best_idx = idx
            break
            
    if best_idx == -1:
        # Fallback: take head and tail
        half = max_chars // 2
        return (
            full_text[:half]
            + "\n\n[... document middle omitted for length ...]\n\n"
            + full_text[-half:]
        )
    
    # Found a match. Include a small prefix (10k) for document identity context.
    prefix_size = 10000
    prefix = ""
    if best_idx > max_chars:
        prefix = full_text[:prefix_size] + "\n\n[... content omitted ...]\n\n"
        # Adjust window size
        max_chars = max(20000, max_chars - len(prefix))

    start = max(0, best_idx - max_chars // 2)
    end = min(len(full_text), start + max_chars)
    start = max(0, end - max_chars)
    
    return prefix + full_text[start:end]


@lru_cache(maxsize=8)
def _manifest_dict(path_str: str, mtime_ns: int) -> dict[str, Any]:
    return json.loads(Path(path_str).read_text(encoding="utf-8"))


def _load_manifest(project_root: Path) -> dict[str, Any] | None:
    p = (project_root / "web" / "public" / "ncert" / "manifest.json").resolve()
    if not p.is_file():
        return None
    try:
        mtime = p.stat().st_mtime_ns
    except OSError:
        return None
    return _manifest_dict(str(p), mtime)


def _chapter_from_label(label: str) -> int | None:
    m = re.search(r"Ch\.?\s*(\d+)\b", label or "", re.I)
    if m:
        return int(m.group(1))
    return None


def _url_for_chapter(
    manifest: dict[str, Any],
    class_key: str,
    subject_key: str,
    chapter: int,
) -> str | None:
    subs = manifest.get(class_key)
    if not isinstance(subs, dict):
        return None
    files = subs.get(subject_key)
    if not isinstance(files, list):
        return None
    hits: list[dict[str, Any]] = []
    for e in files:
        if not isinstance(e, dict):
            continue
        ch = _chapter_from_label(e.get("label") or "")
        if ch == chapter:
            hits.append(e)
    if not hits:
        return None

    def _volume_rank(e: dict[str, Any]) -> int:
        lab = (e.get("label") or "").lower()
        if "appendix" in lab or "prelims" in lab or "contents" in lab:
            return -10
        if "book 2" in lab or "book 3" in lab:
            return -1
        return 0

    hits.sort(key=_volume_rank, reverse=True)
    eng = [e for e in hits if (e.get("medium") or "").lower() == "english"]
    pick = eng[0] if eng else hits[0]
    u = (pick.get("url") or "").strip()
    return u or None


def _parse_explicit_class_subject_chapter(message: str) -> tuple[str, str, int] | None:
    m_cls = re.search(r"class\s*-?\s*(\d+)", message, re.I)
    if not m_cls:
        return None
    class_key = f"class-{int(m_cls.group(1))}"
    m_ch = re.search(r"(?:chapter|ch\.?)\s*-?\s*(\d+)\b", message, re.I)
    if not m_ch:
        return None
    chapter = int(m_ch.group(1))
    low = message.lower()
    if "biology" in low or re.search(r"\bbio\b", low):
        return class_key, "biology", chapter
    if "chemistry" in low or re.search(r"\bchem\b", low):
        return class_key, "chemistry", chapter
    if "physics" in low:
        return class_key, "physics", chapter
    if "math" in low or "mathematics" in low:
        return class_key, "maths", chapter
    if "science" in low and re.search(r"\bscience\b", low):
        return class_key, "science", chapter
    if "social science" in low or "social-science" in low or "sst" in low:
        return class_key, "social-science", chapter
    if "english" in low:
        return class_key, "english", chapter
    if "hindi" in low:
        return class_key, "hindi", chapter
    if "history" in low:
        return class_key, "history", chapter
    if "geography" in low or re.search(r"\bgeo\b", low):
        return class_key, "geography", chapter
    if "economics" in low or re.search(r"\becon\b", low):
        return class_key, "economics", chapter
    if "accountancy" in low or "accounts" in low:
        return class_key, "accountancy", chapter
    if "business" in low:
        return class_key, "business-studies", chapter
    if "political" in low or "civics" in low:
        return class_key, "political-science", chapter
    if "psychology" in low:
        return class_key, "psychology", chapter
    if "sociology" in low:
        return class_key, "sociology", chapter
    return None


def _best_url_by_word_scores(manifest: dict[str, Any], message: str) -> str | None:
    low = message.lower()
    tokens = {w for w in re.findall(r"[a-z]{4,}", low)}
    if len(tokens) < 2:
        return None
    best_url: str | None = None
    best = 0
    for cls, subs in manifest.items():
        if not isinstance(subs, dict):
            continue
        for subj, files in subs.items():
            if not isinstance(files, list):
                continue
            for e in files:
                if not isinstance(e, dict):
                    continue
                hay = f"{cls} {subj} {e.get('label','')} {e.get('filename','')} {e.get('raw_code','')}".lower()
                score = sum(1 for t in tokens if t in hay)
                if score > best:
                    best = score
                    best_url = (e.get("url") or "").strip() or None
    min_score = 2 if len(tokens) >= 3 else 3
    if best >= min_score and best_url:
        return best_url
    return None


def _pick_pdf_url(project_root: Path, message: str) -> str | None:
    manifest = _load_manifest(project_root)
    if not manifest:
        return None
    low = message.lower()

    explicit = _parse_explicit_class_subject_chapter(message)
    if explicit:
        cls, subj, ch = explicit
        if cls in manifest and subj in (manifest.get(cls) or {}):
            u = _url_for_chapter(manifest, cls, subj, ch)
            if u:
                return u

    for triggers, cls, subj, ch in _TOPIC_CHAPTER_HINTS:
        if not any(tr in low for tr in triggers):
            continue
        subs = manifest.get(cls)
        if not isinstance(subs, dict) or subj not in subs:
            continue
        u = _url_for_chapter(manifest, cls, subj, ch)
        if u:
            return u

    return _best_url_by_word_scores(manifest, message)


_pdf_text_cache: dict[tuple[str, int, int], str] = {}


def extract_ncert_pdf_text_from_blob(
    pdf_url: str | None,
    *,
    max_chars: int = 10_000,
    max_pages: int = 30,
) -> str | None:
    """
    Download NCERT PDF from Azure Blob and return plain text (blob-only, no local files).
    Accepts full https blob URLs or manifest-style paths (/ncert/class-12/...).
    """
    raw = (pdf_url or "").strip()
    if not raw:
        return None

    cache_key = (raw, max_chars, max_pages)
    if cache_key in _pdf_text_cache:
        return _pdf_text_cache[cache_key]
    blob_url, _ = _resolve_ncert_pdf_resource(raw)
    if not blob_url:
        return None
    if blob_url in _pdf_text_cache:
        cached_max_pages, cached_text = _pdf_text_cache[blob_url]
        if cached_max_pages >= max_pages:
            full_text = cached_text
        else:
            try:
                pdf_bytes = _fetch_pdf_bytes(blob_url)
                full_text = _fitz_extract_text(path=None, stream=pdf_bytes, max_pages=max_pages)
                if full_text:
                    _pdf_text_cache[blob_url] = (max_pages, full_text)
            except Exception:
                return None
    else:
        try:
            pdf_bytes = _fetch_pdf_bytes(blob_url)
            full_text = _fitz_extract_text(path=None, stream=pdf_bytes, max_pages=max_pages)
            if full_text:
                _pdf_text_cache[blob_url] = (max_pages, full_text)
        except Exception:
            return None
    if not full_text.strip():
        return None
    if len(full_text) > max_chars:
        result = full_text[:max_chars] + "...[truncated]"
    else:
        result = full_text
    _pdf_text_cache[cache_key] = result
    return result


def extract_ncert_public_pdf_excerpt(
    project_root: Path,
    pdf_url: str,
    user_message: str,
    *,
    max_chars: int = 300_000,
    max_pages: int = 500,
) -> str:
    """
    Download NCERT PDF from Azure Blob storage (blob-only, no local fallback).
    """
    full_text = extract_ncert_pdf_text_from_blob(
        pdf_url, max_chars=max_chars * 2, max_pages=max_pages
    )
    if not full_text or not full_text.strip():
        return ""
    return _build_pdf_excerpt(full_text, user_message, max_chars)


def try_ncert_manifest_fallback_excerpt(
    project_root: Path,
    message: str,
    pdf_url: str | None = None,
) -> tuple[str, str | None]:
    """
    If RAG missed, return (context_block, pdf_url) for injection before the chat LLM.
    """
    manifest_url = pdf_url or _pick_pdf_url(project_root, message)
    if not manifest_url:
        return "", None

    # Resolve to production URL or local path
    display_url, rel_path = _resolve_ncert_pdf_resource(manifest_url)

    excerpt = extract_ncert_public_pdf_excerpt(project_root, manifest_url, message)
    if not excerpt.strip():
        # Even if we can't extract text, we still return the URL for the UI to open
        return "", display_url

    name = Path(manifest_url).name
    block = (
        "[NCERT PDF — auto-selected from your question because the vector index returned no passages "
        "(or a previously selected PDF may not match this question). "
        "Answer in detail using ONLY this excerpt plus the PDF index and any RAG lines above. "
        "If this excerpt is clearly the wrong chapter, say so briefly and suggest the correct Source PDF or Websearch.]\n"
        f"FILE: {name}\nURL: {display_url}\n---\n{excerpt}\n---"
    )
    return block, display_url
