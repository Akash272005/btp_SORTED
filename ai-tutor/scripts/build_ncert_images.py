#!/usr/bin/env python3
"""
Build NCERT Images — Filter & Clean
====================================

Extracts images directly from NCERT PDFs in web/public/ncert/, using the layout
metadata and proper captions from data/extracted_images/ to identify meaningful
images and clean their captions. Curated images are copied to assets/ncert_images/.

Usage:
    # Full run (all classes/subjects/chapters):
    python scripts/build_ncert_images.py

    # Specific class:
    python scripts/build_ncert_images.py --class class-10

    # Specific class + subject:
    python scripts/build_ncert_images.py --class class-10 --subject science

    # Dry run (report only, no file writes):
    python scripts/build_ncert_images.py --dry-run

    # Verbose logging:
    python scripts/build_ncert_images.py --verbose
"""

import argparse
import hashlib
import io
import json
import os
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

# Try importing fitz (PyMuPDF)
try:
    import fitz
except ImportError:
    print("❌ PyMuPDF (fitz) is required to run this script. Please run 'pip install pymupdf' or 'conda install -c conda-forge pymupdf'")
    sys.exit(1)

# Fix Windows console encoding (cp1252 can't handle emoji)
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# ─── Configuration ───────────────────────────────────────────────────────────

# Minimum image dimensions to keep (tightened for higher trust)
MIN_WIDTH = 100
MIN_HEIGHT = 100

# Minimum file size in bytes (< 5KB = too small to be a real diagram)
MIN_FILE_SIZE_BYTES = 2000

# Extreme aspect ratio thresholds
MAX_ASPECT_RATIO = 4.0   # width/height > 4 → too wide (equation strips)
MIN_ASPECT_RATIO = 0.25  # width/height < 0.25 → too tall/thin

# QR code detection: nearly square + very small
QR_MAX_DIMENSION = 200
QR_ASPECT_RANGE = (0.85, 1.18)

# Repeated decoration: if same (width, height) appears on > this fraction of
# pages in a chapter, it's probably a decoration
REPEAT_PAGE_FRACTION = 0.35

# Image color variance threshold for gradient/solid fill detection
# (requires PIL — gracefully skipped if unavailable)
COLOR_VARIANCE_THRESHOLD = 800

# Caption quality: Only keep images with genuine figure/table labels.
# Set to False to keep all images regardless of caption label.
REQUIRE_FIGURE_CAPTION = True

# Regex patterns that mark a caption as a genuine textbook figure/table.
# An image is trusted if its raw caption (before cleaning) matches any of these.
# We search ANYWHERE in the caption (not just the start) to handle Hindi layout
# where the figure label may appear mid-line (e.g. "देखें चित्र 4.3 : ...").
_FIGURE_CAPTION_RE = re.compile(
    r'(?i)'
    r'(fig(?:ure)?|table|diagram|chart|graph|map|photo|photograph|'
    r'illustration|plate|\u091a\u093f\u0924\u094d\u0930|\u0938\u093e\u0930\u0923\u0940|\u0906\u0930\u0947\u0916|\u0906\u0915\u0943\u0924\u093f|\u0917\u094d\u0930\u093e\u092b|\u092e\u093e\u0928\u091a\u093f\u0924\u094d\u0930|'
    r'\u0924\u093e\u0932\u093f\u0915\u093e|\u0906\u0932\u0947\u0916)'
    r'[\s.\-\u2013]*'
    r'(\d+[\s]*[\.:\u2013\-]?[\s]*\d*[a-z]?)'
)

# Caption cleaning
MAX_CAPTION_LENGTH = 250
GARBLED_CHAR_THRESHOLD = 0.40  # > 40% non-standard chars → garbled

# ─── Project paths ───────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).resolve().parent.parent
EXTRACTED_IMAGES_DIR = PROJECT_ROOT / "data" / "extracted_images"
NCERT_PDF_DIR = PROJECT_ROOT / "web" / "public" / "ncert"
NCERT_IMAGES_DIR = PROJECT_ROOT / "assets" / "ncert_images"


# ─── Caption Cleaning ───────────────────────────────────────────────────────

def clean_caption(caption: str, chapter_name: str = "", page: int = 0) -> str:
    """
    Clean a caption from images.

    Fixes:
      1. De-duplicate repeated figure/table labels
      2. Join wrapped lines with spaces instead of dashes (unless separating labels)
      3. Detect garbled font-encoded text
      4. Truncate paragraph-length captions
      5. Prefix with chapter context
      6. Normalize whitespace
    """
    if not caption or not caption.strip():
        return f"[{chapter_name}] Page {page} illustration" if chapter_name else f"Page {page} illustration"

    # Split into lines and clean whitespace for each line
    lines = [line.strip() for line in caption.split("\n") if line.strip()]
    if not lines:
        return f"[{chapter_name}] Page {page} illustration" if chapter_name else f"Page {page} illustration"

    # 1. De-duplicate: remove lines that exactly repeat the first line.
    # NCERT PDFs often have "Figure 6.1\nFigure 6.1\nFigure 6.1\nFigure 6.1\nFigure 6.1 actual text"
    # The LAST occurrence usually has the real description, so we collect unique lines in order,
    # but treat any line equal (stripped) to the first line as a duplicate.
    first_line_stripped = lines[0]
    unique_lines: list[str] = []
    last_description_line: str = ""
    for line in lines:
        if line == first_line_stripped:
            continue  # skip pure repetitions of the header label
        if not unique_lines or line != unique_lines[-1]:
            unique_lines.append(line)

    # Check if the original first line (the repeated figure label) has an extended version
    # e.g. "Figure 6.1 (a) Structure of neuron..." — that would NOT equal first_line_stripped
    # but starts with it. That line won't have been filtered above and will be in unique_lines.
    # If unique_lines is empty, the only content was repetitions of the header — use the header alone.
    if not unique_lines:
        # Only header repeated with no extra description
        deduped_lines = [first_line_stripped]
    else:
        deduped_lines = [first_line_stripped] + unique_lines

    if not deduped_lines:
        return f"[{chapter_name}] Page {page} illustration" if chapter_name else f"Page {page} illustration"

    # 2. Separate Figure label from description
    first_line = deduped_lines[0]
    rest_lines = deduped_lines[1:]

    is_fig_label = re.match(r'^(fig(ure)?|table|चित्र|सारणी)\s+[\d.]+', first_line, re.IGNORECASE)

    if is_fig_label and rest_lines:
        # The first rest_line often starts with the figure label + real description,
        # e.g. "Figure 6.1 (a) Structure of neuron, (b) Neuromuscular junction"
        # In that case, use it directly as the full caption.
        first_rest = rest_lines[0]
        if first_rest.lower().startswith(first_line.lower()):
            # Use the extended line as the full caption (avoids double-label)
            more = rest_lines[1:]
            description = first_rest[len(first_line):].strip()
            if more:
                description = (description + " " + " ".join(more)).strip()
            cleaned = f"{first_line} — {description}" if description else first_line
        else:
            description = " ".join(rest_lines)
            description = re.sub(r'\s+', ' ', description).strip()
            cleaned = f"{first_line} — {description}"
    else:
        # Join all lines with spaces
        cleaned = " ".join(deduped_lines)
        cleaned = re.sub(r'\s+', ' ', cleaned).strip()

    # 3. Detect garbled text (custom font encoding artifacts)
    if _is_garbled(cleaned):
        return f"[{chapter_name}] Page {page} illustration" if chapter_name else f"Page {page} illustration"

    # 4. Truncate paragraph-length captions
    if len(cleaned) > MAX_CAPTION_LENGTH:
        # Try to find a natural break point (sentence end)
        sentences = re.split(r'(?<=[.!?])\s+', cleaned)
        truncated = ""
        for sent in sentences:
            if len(truncated) + len(sent) > MAX_CAPTION_LENGTH:
                break
            truncated = (truncated + " " + sent).strip() if truncated else sent
        if truncated and len(truncated) >= 20:
            cleaned = truncated
        else:
            cleaned = cleaned[:MAX_CAPTION_LENGTH].rsplit(" ", 1)[0] + "…"

    # 5. Prefix with chapter context if not already present
    if chapter_name and chapter_name.lower() not in cleaned.lower():
        cleaned = f"[{chapter_name}] {cleaned}"

    # 6. Normalize whitespace
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()

    return cleaned


def _is_garbled(text: str) -> bool:
    """
    Check if text is garbled (custom font encoding → garbage characters).

    Heuristic: if > 40% of characters are control characters, unusual symbols,
    or combinations that don't form valid Hindi/English words.
    """
    if not text:
        return True

    total = len(text)
    if total < 3:
        return True

    weird_count = 0
    for ch in text:
        cat = unicodedata.category(ch)
        # Control characters, private use, surrogates
        if cat.startswith(('C', 'Z')) and ch not in (' ', '\n', '\t'):
            weird_count += 1
        # Check for common garbled patterns: backticks, ampersands in wrong context
        elif ch in ('`', '~', '{', '}', '\\') and not any(
            text[max(0, i - 1):i + 2].isalnum()
            for i in range(len(text)) if i < len(text) and text[i] == ch
        ):
            weird_count += 0.5

    # Also check for the specific NCERT Hindi font encoding pattern:
    # sequences like "o`Qfrdk", "lkuk&lkuk", "gkFk tksfM+---"
    garbled_patterns = [
        r'[a-z]{1,3}[`\+\&\?]+[a-z]',  # Mixed punctuation in word
        r'[A-Z][a-z]*\?+[a-z]',          # Question marks mid-word
        r'---$',                           # Triple dash at end
        r'\+\+',                           # Double plus
        r'&[a-z]',                         # Ampersand in word
    ]
    pattern_hits = sum(1 for p in garbled_patterns if re.search(p, text))
    if pattern_hits >= 2:
        return True

    return (weird_count / total) > GARBLED_CHAR_THRESHOLD


# ─── Image Filtering ────────────────────────────────────────────────────────

def _try_compute_bytes_variance(image_bytes: bytes) -> float | None:
    """Compute color variance of an image from bytes. Returns None if PIL unavailable."""
    try:
        from PIL import Image
        import numpy as np

        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        arr = np.array(img, dtype=np.float64)
        return float(np.var(arr))
    except ImportError:
        return None
    except Exception:
        return None


def _compute_bytes_hash(image_bytes: bytes) -> str:
    """Compute SHA-256 hash of bytes for deduplication."""
    return hashlib.sha256(image_bytes).hexdigest()


class ImageFilter:
    """Applies filtering heuristics to decide which images to keep."""

    def __init__(self, verbose: bool = False):
        self.verbose = verbose
        self.seen_hashes: set[str] = set()
        self.stats: dict[str, int] = Counter()
        self._pil_available: bool | None = None

    @property
    def pil_available(self) -> bool:
        if self._pil_available is None:
            try:
                from PIL import Image  # noqa: F401
                self._pil_available = True
            except ImportError:
                self._pil_available = False
                if self.verbose:
                    print("  ⚠️  PIL not available — skipping gradient/solid fill detection")
        return self._pil_available

    def should_keep(
        self,
        entry: dict[str, Any],
        image_bytes: bytes,
        chapter_page_sizes: dict[str, list[int]],
        class_name: str = "",
    ) -> tuple[bool, str]:
        """
        Determine if an image should be kept.

        Returns:
            (keep, reason) — keep=True if image passes all filters,
            reason explains why it was rejected.
        """
        w = entry.get("width_px", 0)
        h = entry.get("height_px", 0)

        # Filter 0: Caption trust — require genuine Figure/Table label for classes >= 6,
        # or genuine description for classes 1-5 (primary).
        is_primary = False
        if class_name:
            match = re.match(r'^class-(\d+)$', class_name.lower())
            if match:
                class_num = int(match.group(1))
                if 1 <= class_num <= 5:
                    is_primary = True

        raw_caption = entry.get("caption", "") or ""
        cleaned = re.sub(r'\s+', ' ', raw_caption).strip()

        if REQUIRE_FIGURE_CAPTION and not is_primary:
            if not raw_caption or not _FIGURE_CAPTION_RE.search(raw_caption):
                self.stats["no_figure_label"] += 1
                return False, f"no figure/table label in caption: '{raw_caption[:60]}'"
        elif is_primary:
            # 1. Reject empty/whitespace-only
            if not cleaned:
                self.stats["no_figure_label"] += 1
                return False, "empty caption"

            # 2. Reject pure numbers, page numbers, or symbols
            clean_alnum = re.sub(r'[\s.,\-\u2013()ü!!?|।\s]', '', cleaned)
            if not clean_alnum or clean_alnum.isdigit():
                self.stats["no_figure_label"] += 1
                return False, f"caption is just page number/digit/symbols: '{cleaned}'"

            lower_cleaned = cleaned.lower()

            # 3. Reject teacher notes / activity instructions / command verbs
            teacher_and_inst_words = [
                # Hindi teacher/classroom hints
                "बच्‍चों", "बच्चों", "बच्‍चे", "बच्चे", "कहें", "कहिए", "पूछें", "पूछिए", "पूछकर", 
                "चर्चा करें", "चर्चा कीजिए", "चर्चा", "शिक्षक", "अध्यापक", "शिक्षिका", "सुझाव", 
                "संकेत", "कराएँ", "करवाएँ", "अवसर दें", "अवसर प्रदान", "प्रोत्साहित", "अभिनय",
                # Hindi worksheet command verbs / instructions
                "लगाइए", "बनााइए", "बनाइए", "लिखिए", "पढ़िए", "भरिए", "बताइए", "दिखाइए", "करें", 
                "करो", "कीजिए", "रेखा खींचकर", "मिलान करें", "मिलान कीजिए", "रंग भरिए", "रंग भरो", 
                "घेरा लगाओ", "घेरा लगाइए", "सही का चिह्न", "पता लगाएँ", "पता लगाओ", "स्वयं करें",
                # English teacher/classroom notes
                "teacher", "children", "students", "ask them", "discuss", "activity", "note", 
                "hint", "suggest", "classroom",
                # English worksheet commands / instructions
                "match the", "tick the", "draw a", "write the", "fill in", "color the", "colour the", 
                "circle the", "find the", "show the", "complete the"
            ]
            for word in teacher_and_inst_words:
                if word in lower_cleaned:
                    self.stats["no_figure_label"] += 1
                    return False, f"caption is teacher note or instruction (matched '{word}'): '{cleaned[:60]}'"

            # 4. Reject section headers (strict or prefix matching)
            header_words = [
                "आओ गाएँ", "आओ खेलें", "सोचें और बताएँ", "सोचें और करो", "परियोोजना कार््य", 
                "परियोजना कार्य", "गतिविधि", "आओ करें", "अभ्यास", "उत्तर", "सोचें", "आओ गुनगुनाएँ", 
                "आओ गुनगुनाएं", "परियोजना", "आओ पढ़ें",
                "let's sing", "let's play", "think and write", "think and say", "project work", 
                "let's do", "exercise", "answer", "think", "find out", "do it yourself", "let's read"
            ]
            for word in header_words:
                if lower_cleaned == word or lower_cleaned.startswith(word + " ") or lower_cleaned.startswith(word + "—") or lower_cleaned.startswith(word + "-"):
                    self.stats["no_figure_label"] += 1
                    return False, f"caption is a section header (matched '{word}'): '{cleaned[:60]}'"

            # 5. Reject extremely short captions (less than 10 characters) unless they match figure regex
            if len(clean_alnum) < 10 and not _FIGURE_CAPTION_RE.search(raw_caption):
                self.stats["no_figure_label"] += 1
                return False, f"caption too short: '{cleaned}'"

        # Filter 1: Minimum size
        if w < MIN_WIDTH or h < MIN_HEIGHT:
            self.stats["too_small"] += 1
            return False, f"too small ({w}×{h})"

        # Filter 2: QR code detection (small + square)
        if w <= QR_MAX_DIMENSION and h <= QR_MAX_DIMENSION:
            aspect = w / h if h > 0 else 0
            if QR_ASPECT_RANGE[0] <= aspect <= QR_ASPECT_RANGE[1]:
                self.stats["qr_code"] += 1
                return False, f"likely QR code ({w}×{h}, aspect={aspect:.2f})"

        # Filter 3: Extreme aspect ratio
        aspect = w / h if h > 0 else 0
        if aspect > MAX_ASPECT_RATIO:
            self.stats["extreme_aspect"] += 1
            return False, f"extreme aspect ratio ({w}×{h}, ratio={aspect:.1f})"
        if aspect < MIN_ASPECT_RATIO:
            self.stats["extreme_aspect"] += 1
            return False, f"extreme aspect ratio ({w}×{h}, ratio={aspect:.2f})"

        # Filter 4: File size too small
        file_size = len(image_bytes)
        if file_size < MIN_FILE_SIZE_BYTES:
            self.stats["file_too_small"] += 1
            return False, f"file too small ({file_size} bytes)"

        # Filter 5: Duplicate detection (file hash)
        file_hash = _compute_bytes_hash(image_bytes)
        if file_hash in self.seen_hashes:
            self.stats["duplicate"] += 1
            return False, "duplicate image (same hash)"
        self.seen_hashes.add(file_hash)

        # Filter 6: Repeated decoration (same size on many pages)
        size_key = f"{w}x{h}"
        chapter = entry.get("chapter", "")
        page_key = f"{chapter}:{size_key}"
        if page_key in chapter_page_sizes:
            pages_with_this_size = chapter_page_sizes[page_key]
            total_pages = chapter_page_sizes.get(f"{chapter}:__total_pages__", [0])
            total = total_pages[0] if total_pages else 1
            if total > 0 and len(pages_with_this_size) / total > REPEAT_PAGE_FRACTION:
                if w <= 400 and h <= 400:  # Only filter small repeated images
                    self.stats["repeated_decoration"] += 1
                    return False, f"repeated decoration ({size_key} on {len(pages_with_this_size)}/{total} pages)"

        # Filter 7: Gradient/solid fill detection (via PIL)
        if self.pil_available:
            variance = _try_compute_bytes_variance(image_bytes)
            if variance is not None and variance < COLOR_VARIANCE_THRESHOLD:
                self.stats["gradient_fill"] += 1
                return False, f"gradient/solid fill (variance={variance:.0f})"

        self.stats["kept"] += 1
        return True, "passed all filters"

    def print_summary(self):
        """Print filtering statistics."""
        total = sum(self.stats.values())
        kept = self.stats.get("kept", 0)
        print(f"\n{'='*60}")
        print(f"📊 FILTERING SUMMARY")
        print(f"{'='*60}")
        print(f"  Total images processed: {total}")
        print(f"  ✅ Kept:               {kept} ({100*kept/total:.1f}%)" if total else "")
        print(f"  ❌ Rejected:           {total - kept}")
        print()
        reject_reasons = {k: v for k, v in self.stats.items() if k != "kept"}
        reason_labels = {
            "no_figure_label": "No Figure/Table Label",
            "too_small": "Too Small",
            "qr_code": "QR Code",
            "extreme_aspect": "Extreme Aspect Ratio",
            "file_too_small": "File Too Small",
            "duplicate": "Duplicate",
            "repeated_decoration": "Repeated Decoration",
            "gradient_fill": "Gradient/Solid Fill",
        }
        for reason, count in sorted(reject_reasons.items(), key=lambda x: -x[1]):
            label = reason_labels.get(reason, reason.replace("_", " ").title())
            print(f"    • {label}: {count}")
        print(f"{'='*60}\n")


# ─── Chapter-level analysis ─────────────────────────────────────────────────

def _analyze_chapter_page_sizes(entries: list[dict]) -> dict[str, list[int]]:
    """
    Pre-analyze image sizes per chapter/page for repeated decoration detection.

    Returns a dict mapping "{chapter}:{WxH}" → list of page numbers where that size appears.
    Also stores "{chapter}:__total_pages__" → [max_page_number].
    """
    result: dict[str, list] = defaultdict(list)
    chapter_max_page: dict[str, int] = {}

    for entry in entries:
        chapter = entry.get("chapter", "")
        page = entry.get("page", 0)
        w = entry.get("width_px", 0)
        h = entry.get("height_px", 0)
        size_key = f"{w}x{h}"
        page_key = f"{chapter}:{size_key}"

        if page not in result[page_key]:
            result[page_key].append(page)

        if chapter not in chapter_max_page or page > chapter_max_page[chapter]:
            chapter_max_page[chapter] = page

    # Store total page counts
    for chapter, max_page in chapter_max_page.items():
        result[f"{chapter}:__total_pages__"] = [max_page]

    return dict(result)


# ─── Chapter name from PDF ───────────────────────────────────────────────────

# Cache: pdf_path_str → chapter_name
_pdf_title_cache: dict[str, str] = {}

def get_chapter_name_from_pdf(doc, chapter_code: str = "") -> str:
    """
    Extract the chapter/book title directly from the PDF.

    Strategy (in order):
    1. PDF metadata 'title' field — if it's a real title (not InDesign garbage)
    2. First page: find the prominent chapter heading by font size.
       NCERT PDFs have the chapter NUMBER at the biggest font (e.g. 34pt = "1")
       and the chapter TITLE at the next largest group (e.g. 30pt = "Chemical Reactions").
       We skip single-char / single-digit spans and find the largest font group
       whose text is a real title (>= 4 meaningful characters).
    3. Fallback: first non-numeric, non-artifact line of text on first page.
    4. Final fallback: chapter_code.
    """
    # 1. Try PDF metadata title — filter InDesign/pmd garbage
    try:
        meta = doc.metadata or {}
        meta_title = (meta.get("title") or "").strip()
        if meta_title and len(meta_title) > 3 and not re.search(
            r'(\.pmd|\.indd|indd\s+\d|\d{2}[-/]\d{2}[-/]\d{4}|'
            r'\d{1,2}:\d{2}:\d{2}|chapter\s+\d+\.indd|CHAP\s+\d)',
            meta_title, re.IGNORECASE
        ):
            return meta_title
    except Exception:
        pass

    # 2. Extract title from first page using font sizes
    try:
        if len(doc) > 0:
            page = doc[0]
            blocks = page.get_text("dict")["blocks"]

            # Collect (size, text) for all meaningful spans
            span_data: list[tuple[float, str]] = []
            for block in blocks:
                if block.get("type") != 0:
                    continue
                for line in block.get("lines", []):
                    for span in line.get("spans", []):
                        text = span.get("text", "").strip()
                        size = round(span.get("size", 0), 1)
                        if text and size > 8:  # ignore tiny footnote text
                            span_data.append((size, text))

            if span_data:
                # Get unique font sizes in descending order
                unique_sizes = sorted(set(s for s, _ in span_data), reverse=True)

                for font_size in unique_sizes:
                    # Collect all spans at this font size
                    group = [t for s, t in span_data if abs(s - font_size) < 0.5]
                    combined = " ".join(group).strip()

                    # Skip if it's just a chapter number (single digit) or too short
                    if re.match(r'^\d{1,2}$', combined.strip()):
                        continue
                    # Skip if it's only one letter (e.g. "C" from a drop-cap)
                    if len(combined.strip()) <= 1:
                        continue
                    # Skip "CHAPTER" label
                    if combined.strip().upper() in ("CHAPTER", "UNIT"):
                        continue
                    # Skip if it's just numbers/punctuation
                    if re.match(r'^[\d\s./:\-]+$', combined):
                        continue

                    # Clean up: strip leading chapter label
                    candidate = re.sub(r'^\s*chapter\s+\d+\s*[:\-]?\s*', '', combined,
                                       flags=re.IGNORECASE).strip()
                    # Strip trailing single uppercase letter (drop-cap artifacts like "H", "B", "I", "Y")
                    candidate = re.sub(r'\s+[A-Z]$', '', candidate).strip()
                    candidate = re.sub(r'\s+', ' ', candidate).strip()

                    if candidate and 4 <= len(candidate) <= 150:
                        return candidate


            # 3. Fallback: first real text line on first page
            first_page_text = page.get_text().strip()
            for line in first_page_text.split("\n"):
                line = line.strip()
                if line and len(line) > 4 and not line.isdigit():
                    # Skip lines that look like page numbers or InDesign artifacts
                    if not re.match(r'^[\d\s./:-]+$', line):
                        return line[:100]
    except Exception:
        pass

    # 4. Final fallback: use chapter code
    return chapter_code


# ─── Chapter code validation (exludes prelims / answers / index files) ───────

def is_valid_chapter_code(code: str) -> bool:
    """Filters out preliminary pages, preface, index, and answers PDFs."""
    code = code.lower().strip()
    if code.endswith(('ps', 'an', 'pre', 'app', 'gl', 'cov', 'index', 'answers')):
        return False
    # Must end with exactly 3 digits (e.g. 101, 102, 201)
    match = re.search(r'\d{3}$', code)
    if not match:
        return False
    # Exclude files ending with 000, 001, 002 (contents/preface)
    num = int(match.group())
    if num < 100:
        return False
    return True


def _image_bytes_to_png(image_bytes: bytes, ext: str) -> bytes:
    """
    Convert image bytes (any format: jpeg, jp2, jbig2, png…) to PNG bytes.
    This ensures all saved files are valid PNG regardless of the PDF's internal
    image format. Falls back to original bytes if PIL is unavailable or fails.
    """
    if ext.lower() in ("png",) and image_bytes[:4] == b'\x89PNG':
        return image_bytes  # Already valid PNG, skip conversion
    try:
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(image_bytes))
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="PNG", optimize=True)
        return buf.getvalue()
    except Exception:
        return image_bytes  # Best-effort fallback


def extract_image_for_entry(doc, entry: dict) -> tuple[bytes, str, int, int] | None:
    """
    Extract image bytes directly from the PDF for a given images.json entry.
    First tries to extract by parsing the xref from the filename.
    Falls back to matching page and image order sequence.
    Always converts the result to PNG so saved files are always valid images.
    """
    filename = entry.get("image_filename", "")
    page_num = entry.get("page", 1)

    raw_bytes = None
    raw_ext = "png"
    raw_w = 0
    raw_h = 0

    # Try 1: Parse xref from standard filename format (e.g. page_001_img_00288.png)
    xref_match = re.search(r'img_(\d+)', filename)
    if xref_match:
        try:
            xref = int(xref_match.group(1))
            base_image = doc.extract_image(xref)
            if base_image:
                raw_bytes = base_image["image"]
                raw_ext = base_image["ext"]
                raw_w = base_image["width"]
                raw_h = base_image["height"]
        except Exception:
            pass

    # Try 2: Fallback to matching image sequence order on that page
    if raw_bytes is None:
        try:
            if 0 < page_num <= len(doc):
                page = doc[page_num - 1]
                image_list = page.get_images(full=True)
                if image_list:
                    idx_match = re.search(r'page_\d+_(\d+)', filename)
                    img_idx = int(idx_match.group(1)) - 1 if idx_match else 0
                    if 0 <= img_idx < len(image_list):
                        xref = image_list[img_idx][0]
                        base_image = doc.extract_image(xref)
                        if base_image:
                            raw_bytes = base_image["image"]
                            raw_ext = base_image["ext"]
                            raw_w = base_image["width"]
                            raw_h = base_image["height"]
        except Exception:
            pass

    if raw_bytes is None:
        return None

    # Always convert to PNG so the saved .png file is always a valid image
    png_bytes = _image_bytes_to_png(raw_bytes, raw_ext)
    return png_bytes, "png", raw_w, raw_h



# ─── Process Chapter ─────────────────────────────────────────────────────────

def process_chapter(
    json_path: Path,
    pdf_path: Path,
    class_name: str,
    subject_name: str,
    chapter_code: str,
    target_chapter_dir: Path,
    image_filter: ImageFilter,
    dry_run: bool = False,
    verbose: bool = False,
) -> tuple[int, int]:
    """
    Process a single chapter's images.json — load entries, extract corresponding
    images from the PDF, apply filtering, clean captions, and write.

    Returns (kept_count, total_count).
    """
    try:
        with open(json_path, "r", encoding="utf-8") as f:
            entries = json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        print(f"  ❌ Failed to load {json_path}: {e}")
        return 0, 0

    if not isinstance(entries, list) or len(entries) == 0:
        return 0, 0

    # Open PDF
    try:
        doc = fitz.open(str(pdf_path))
    except Exception as e:
        print(f"  ❌ Failed to open PDF {pdf_path}: {e}")
        return 0, 0

    real_ch_name = get_chapter_name_from_pdf(doc, chapter_code)
    chapter_name = real_ch_name or chapter_code

    # First, let's collect image bytes and info for repeated decoration detection
    chapter_images = []
    for entry in entries:
        image_filename = entry.get("image_filename", "")
        extracted = extract_image_for_entry(doc, entry)
        if not extracted:
            if verbose:
                print(f"    ✗ Failed to extract image bytes for {image_filename} from PDF")
            continue
            
        image_bytes, ext, width, height = extracted
        
        # Override dimensions in entry with actual extracted image dimensions just in case
        entry_copy = entry.copy()
        entry_copy["width_px"] = width
        entry_copy["height_px"] = height
        entry_copy["chapter"] = chapter_name
        
        chapter_images.append({
            "entry": entry_copy,
            "image_bytes": image_bytes,
            "ext": ext,
        })

    doc.close()

    # Pre-analyze size distributions for repeated decoration detection
    chapter_page_sizes = _analyze_chapter_page_sizes([img["entry"] for img in chapter_images])

    kept_entries: list[dict] = []

    for item in chapter_images:
        entry = item["entry"]
        image_bytes = item["image_bytes"]
        image_filename = entry["image_filename"]

        keep, reason = image_filter.should_keep(entry, image_bytes, chapter_page_sizes, class_name)

        if verbose and not keep:
            print(f"    ✗ {image_filename}: {reason}")

        if keep:
            page = entry["page"]
            original_caption = entry.get("caption", "")
            # Clean caption without chapter prefix (pdf_name is used for RAG instead)
            cleaned_caption = clean_caption(original_caption, "", page)

            image_url = f"/assets/ncert_images/{class_name}/{subject_name}/{chapter_code}/{image_filename}"

            new_entry = {
                "image_filename": image_filename,
                "image_url": image_url,
                "pdf_name": chapter_code,
                "pdf_url": f"/ncert/{class_name}/{subject_name}/{chapter_code}.pdf",
                "page": page,
                "width_px": entry["width_px"],
                "height_px": entry["height_px"],
                "caption": cleaned_caption,
                "original_caption": original_caption,
            }
            kept_entries.append(new_entry)

            if not dry_run:
                target_chapter_dir.mkdir(parents=True, exist_ok=True)
                target_path = target_chapter_dir / image_filename
                if not target_path.exists():
                    with open(target_path, "wb") as f:
                        f.write(image_bytes)

    # Write curated images.json for the chapter
    if kept_entries and not dry_run:
        target_chapter_dir.mkdir(parents=True, exist_ok=True)
        target_json = target_chapter_dir / "images.json"
        with open(target_json, "w", encoding="utf-8") as f:
            json.dump(kept_entries, f, indent=2, ensure_ascii=False)

    return len(kept_entries), len(entries)


# ─── Main Program ────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Build curated NCERT images by extracting directly from PDF"
    )
    parser.add_argument("--class", dest="class_filter", help="Filter by class (e.g. class-10)")
    parser.add_argument("--subject", help="Filter by subject (e.g. science)")
    parser.add_argument("--chapter", help="Filter by chapter code (e.g. jesc101)")
    parser.add_argument("--dry-run", action="store_true", help="Report only, don't write files")
    parser.add_argument("--verbose", "-v", action="store_true", help="Show per-image decisions")
    args = parser.parse_args()

    if not EXTRACTED_IMAGES_DIR.exists():
        print(f"❌ Extracted images directory not found: {EXTRACTED_IMAGES_DIR}")
        sys.exit(1)
    if not NCERT_PDF_DIR.exists():
        print(f"❌ Source PDF directory not found: {NCERT_PDF_DIR}")
        sys.exit(1)

    print(f"📁 Metadata Source: {EXTRACTED_IMAGES_DIR}")
    print(f"📁 PDF Source:      {NCERT_PDF_DIR}")
    print(f"📁 Target:          {NCERT_IMAGES_DIR}")
    if args.dry_run:
        print("🔍 DRY RUN — no files will be written\n")
    else:
        print()

    image_filter = ImageFilter(verbose=args.verbose)
    total_kept = 0
    total_processed = 0
    chapters_processed = 0

    # Walk through class/subject/chapter directories in EXTRACTED_IMAGES_DIR
    for class_dir in sorted(EXTRACTED_IMAGES_DIR.iterdir()):
        if not class_dir.is_dir() or not class_dir.name.startswith("class-"):
            continue
        if args.class_filter and class_dir.name != args.class_filter:
            continue

        for subject_dir in sorted(class_dir.iterdir()):
            if not subject_dir.is_dir():
                continue
            if args.subject and subject_dir.name != args.subject:
                continue

            for chapter_dir in sorted(subject_dir.iterdir()):
                if not chapter_dir.is_dir():
                    continue
                
                chapter_code = chapter_dir.name
                
                # Check if this code represents a valid textbook chapter
                if not is_valid_chapter_code(chapter_code):
                    if args.verbose:
                        print(f"  ⏭️ Skipping non-chapter directory: {class_dir.name}/{subject_dir.name}/{chapter_code}")
                    continue
                    
                if args.chapter and chapter_code != args.chapter:
                    continue

                json_path = chapter_dir / "images.json"
                if not json_path.exists():
                    continue

                pdf_path = NCERT_PDF_DIR / class_dir.name / subject_dir.name / f"{chapter_code}.pdf"
                if not pdf_path.exists():
                    if args.verbose:
                        print(f"  ⚠️ PDF file missing, skipping chapter: {pdf_path}")
                    continue

                rel_path = Path(class_dir.name) / subject_dir.name / chapter_code
                target_dir = NCERT_IMAGES_DIR / rel_path

                if args.verbose:
                    print(f"\n📂 Processing {rel_path}...")

                kept, total = process_chapter(
                    json_path, pdf_path, class_dir.name, subject_dir.name, chapter_code,
                    target_dir, image_filter, args.dry_run, args.verbose,
                )
                total_kept += kept
                total_processed += total
                chapters_processed += 1

                if not args.verbose and chapters_processed % 50 == 0:
                    print(f"  ... processed {chapters_processed} chapters ({total_kept}/{total_processed} kept so far)")

    # Print summary
    image_filter.print_summary()
    print(f"📊 Chapters processed: {chapters_processed}")
    print(f"📊 Total images: {total_processed} → {total_kept} kept ({100*total_kept/total_processed:.1f}%)" if total_processed else "")

    if args.dry_run:
        print("\n🔍 This was a dry run. Run without --dry-run to write files.")
    else:
        print(f"\n✅ Curated images saved to: {NCERT_IMAGES_DIR}")


if __name__ == "__main__":
    main()
