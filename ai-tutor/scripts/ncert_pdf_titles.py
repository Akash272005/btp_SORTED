"""Shared helpers: extract chapter title from NCERT PDF bytes / URLs."""
from __future__ import annotations

import json
import re
import threading
import unicodedata
from io import BytesIO
from pathlib import Path
from typing import Callable

try:
    from pypdf import PdfReader
except ImportError as exc:
    raise SystemExit("pip install pypdf") from exc

try:
    import httpx
except ImportError:
    httpx = None  # type: ignore

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CACHE = ROOT / "data" / "ncert_audit" / "pdf_title_cache.json"
DEFAULT_TITLES = ROOT / "web" / "public" / "ncert" / "pdf_titles.json"

_cache_lock = threading.Lock()


def normalize_title(s: str) -> str:
    s = unicodedata.normalize("NFKD", s)
    s = s.encode("ascii", "ignore").decode("ascii")
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


_SKIP_TITLE_PATTERNS = (
    r"before you read",
    r"read and find out",
    r"reprint\s*20\d{2}",
    r"^ncert\b",
    r"^mathema\s*tics\b",
    r"^science\s+\d",
    r"^social\s+science\b",
    r"^contents\b",
    r"^prelims\b",
    r"^rationalised\b",
    r"learning objectives",
    r"you have lear",
    r"you have learnt",
    r"^ou have\b",
    r"^inancial\b",
    r"^company\b",
    r"accountancy\s*:",
    r"^\d+\s+accountancy",
    r"^iill now\b",
    r"^vf/xe\b",
)


def _dedupe_doubled_title(s: str) -> str:
    """NCERT PDFs often repeat the title twice on line 1 (e.g. Hindi section headers)."""
    s = s.strip()
    if len(s) < 6:
        return s
    half = len(s) // 2
    if half >= 3 and s[:half].strip() == s[half:].strip():
        return s[:half].strip()
    # Word-level doubled phrase: "Real Numbers Real Numbers"
    words = s.split()
    if len(words) >= 4 and len(words) % 2 == 0:
        mid = len(words) // 2
        if words[:mid] == words[mid:]:
            return " ".join(words[:mid])
    return s


def _is_junk_title_line(ln: str) -> bool:
    low = ln.lower().strip()
    if len(low) < 3:
        return True
    return any(re.search(pat, low) for pat in _SKIP_TITLE_PATTERNS)


def extract_pdf_title(pdf_bytes: bytes) -> str:
    title, _ = extract_pdf_title_scored(pdf_bytes)
    return title


def title_quality(title: str, *, from_chapter_pattern: bool = False) -> float:
    """0–1 score; low = likely body text / junk."""
    if not title or len(title.strip()) < 3:
        return 0.0
    t = title.strip()
    if _is_junk_title_line(t):
        return 0.05
    if from_chapter_pattern:
        return 0.95
    if re.search(r"^20\d{2}[-–]20\d{2}$", t):
        return 0.05
    devanagari = len(re.findall(r"[\u0900-\u097F]", t))
    words = t.split()
    if devanagari >= 4 and len(t) <= 60 and len(words) <= 8:
        return 0.88
    if len(t) > 80 and t[0].islower():
        return 0.1
    words = t.split()
    if len(words) > 12:
        return 0.2
    lower_words = sum(1 for w in words if w[:1].islower() and w.isalpha())
    if len(words) >= 5 and lower_words / len(words) > 0.6:
        return 0.15
    if t[0].islower():
        return 0.2
    if re.match(r"^\d{1,3}[a-zA-Z]", t):
        return 0.25
    if len(words) <= 8 and t[0].isupper():
        return 0.85
    return 0.5


def extract_pdf_title_scored(pdf_bytes: bytes) -> tuple[str, float]:
    """Return (title, quality_score)."""
    reader = PdfReader(BytesIO(pdf_bytes))
    if not reader.pages:
        return "", 0.0
    text = (reader.pages[0].extract_text() or "").strip()
    if not text:
        return "", 0.0

    for pat in (
        r"(?:chapter|अध्याय|पाठ)\s*\d+\s*[:\-–\.]\s*(.+?)(?:\n|$)",
        r"(?:chapter|अध्याय|पाठ)\s*\d+\s+(.+?)(?:\n|$)",
    ):
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            title = _dedupe_doubled_title(m.group(1).strip())
            if title and not _is_junk_title_line(title):
                return title[:120], title_quality(title, from_chapter_pattern=True)

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    for ln in lines[:10]:
        if _is_junk_title_line(ln):
            continue
        letters = re.sub(r"[^A-Za-z]", "", ln)
        if len(letters) >= 8 and letters.isupper():
            half = len(ln) // 2
            if half > 10 and ln[:half].strip().upper() == ln[half:].strip().upper():
                title = _dedupe_doubled_title(ln[:half].strip().title())
            else:
                title = _dedupe_doubled_title(ln.strip().title())
            return title[:120], title_quality(title)
    for ln in lines[:8]:
        if _is_junk_title_line(ln):
            continue
        title = _dedupe_doubled_title(ln)[:120]
        q = title_quality(title)
        if q >= 0.5:
            return title, q
    return "", 0.0


def similarity(a: str, b: str) -> float:
    a, b = normalize_title(a), normalize_title(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    if a in b or b in a:
        return 0.9
    aw, bw = set(a.split()), set(b.split())
    if not aw or not bw:
        return 0.0
    return len(aw & bw) / max(len(aw), len(bw))


def load_title_cache(path: Path = DEFAULT_CACHE) -> dict[str, str]:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save_title_cache(cache: dict[str, str], path: Path = DEFAULT_CACHE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


def load_published_titles(path: Path = DEFAULT_TITLES) -> dict[str, str]:
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save_published_titles(cache: dict[str, str], path: Path = DEFAULT_TITLES) -> None:
    path.write_text(
        json.dumps(cache, indent=2, ensure_ascii=False, sort_keys=True),
        encoding="utf-8",
    )


def _download_pdf(url: str, client: httpx.Client) -> bytes:
    resp = client.get(url)
    resp.raise_for_status()
    return resp.content


def fetch_titles_batch(
    urls: list[str],
    cache: dict[str, str],
    *,
    workers: int = 16,
    on_progress: Callable[[int, int, str], None] | None = None,
    save_every: int = 25,
    cache_path: Path = DEFAULT_CACHE,
) -> dict[str, str]:
    """Download PDFs and extract first-page titles. Updates cache in place."""
    if not urls:
        return cache

    if httpx is None:
        raise RuntimeError("httpx is required for batch PDF fetch (pip install httpx)")

    pending = [u for u in urls if u not in cache]
    total = len(pending)
    if total == 0:
        return cache

    done = 0
    limits = httpx.Limits(max_connections=workers, max_keepalive_connections=workers)
    timeout = httpx.Timeout(60.0, connect=20.0)

    with httpx.Client(
        headers={"User-Agent": "bixy-ncert-title-fetch/2.0"},
        limits=limits,
        timeout=timeout,
        follow_redirects=True,
    ) as client:
        from concurrent.futures import ThreadPoolExecutor, as_completed

        def work(url: str) -> tuple[str, str]:
            try:
                title = extract_pdf_title(_download_pdf(url, client))
            except Exception:
                title = ""
            return url, title

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futs = {pool.submit(work, u): u for u in pending}
            for fut in as_completed(futs):
                url, title = fut.result()
                with _cache_lock:
                    cache[url] = title
                    done += 1
                    if on_progress:
                        on_progress(done, total, url)
                    if done % save_every == 0:
                        save_title_cache(cache, cache_path)

    save_title_cache(cache, cache_path)
    return cache
