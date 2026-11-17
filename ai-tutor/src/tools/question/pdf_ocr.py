"""
OCR fallbacks for scanned / image-only exam PDFs (no text layer).
Used when MinerU fails and PyMuPDF get_text() returns empty.
"""

from __future__ import annotations

import asyncio
import base64
import concurrent.futures
import shutil
from pathlib import Path

# Default cap — full exams can override via env
DEFAULT_OCR_MAX_PAGES = 30


def _tesseract_available() -> bool:
    return shutil.which("tesseract") is not None


def _render_pages(pdf_path: Path, max_pages: int, zoom: float = 2.0) -> list[tuple[int, bytes]]:
    """Render PDF pages to PNG bytes for OCR."""
    import fitz

    doc = fitz.open(str(pdf_path))
    pages: list[tuple[int, bytes]] = []
    limit = min(len(doc), max_pages)
    matrix = fitz.Matrix(zoom, zoom)
    for i in range(limit):
        pix = doc[i].get_pixmap(matrix=matrix, alpha=False)
        pages.append((i + 1, pix.tobytes("png")))
    doc.close()
    return pages


def ocr_with_pymupdf_tesseract(pdf_path: Path, max_pages: int = DEFAULT_OCR_MAX_PAGES) -> str:
    """OCR via PyMuPDF + system Tesseract (fast when tesseract is installed)."""
    if not _tesseract_available():
        print("ℹ️  Tesseract not found in PATH — skip PyMuPDF OCR (brew install tesseract)")
        return ""

    print("⚠️  Trying PyMuPDF + Tesseract OCR...")
    try:
        import fitz

        doc = fitz.open(str(pdf_path))
        parts: list[str] = []
        limit = min(len(doc), max_pages)
        for i in range(limit):
            page = doc[i]
            try:
                tp = page.get_textpage_ocr(dpi=200, full=True)
                text = (tp.extractText() or "").strip()
            except Exception as e:
                print(f"   Page {i + 1} Tesseract OCR error: {e}")
                text = ""
            if text:
                parts.append(f"## Page {i + 1}\n\n{text}")
        doc.close()
        joined = "\n\n".join(parts)
        if joined.strip():
            print(f"✓ Tesseract OCR extracted {len(joined)} characters from {len(parts)} page(s)")
        return joined
    except Exception as e:
        print(f"✗ PyMuPDF Tesseract OCR failed: {e}")
        return ""


def ocr_with_google_vision(pdf_path: Path, max_pages: int = DEFAULT_OCR_MAX_PAGES) -> str:
    """OCR each rendered page with Google Cloud Vision."""
    from src.services.image_search.script_verify import (
        _resolve_sa_json_path,
        extract_text_google_vision_bytes,
        vision_api_key,
    )

    if not _resolve_sa_json_path() and not vision_api_key():
        print("ℹ️  Google Vision credentials not configured — skip Vision OCR")
        return ""

    print("⚠️  Trying Google Cloud Vision OCR on PDF pages...")
    try:
        rendered = _render_pages(pdf_path, max_pages)
        parts: list[str] = []
        for page_num, png_bytes in rendered:
            text = extract_text_google_vision_bytes(png_bytes, timeout=60.0)
            if text.strip():
                parts.append(f"## Page {page_num}\n\n{text.strip()}")
                print(f"   Page {page_num}: {len(text)} chars")
            else:
                print(f"   Page {page_num}: no text detected")
        joined = "\n\n".join(parts)
        if joined.strip():
            print(f"✓ Vision OCR extracted {len(joined)} characters")
        return joined
    except Exception as e:
        print(f"✗ Google Vision OCR failed: {e}")
        return ""


def ocr_with_llm_vision(pdf_path: Path, max_pages: int = 12) -> str:
    """OCR pages using the configured vision-capable chat model (last resort)."""
    print(f"⚠️  Trying LLM vision OCR (up to {max_pages} pages)...")
    try:
        from src.services.llm import factory
        from src.services.llm.config import get_llm_config

        config = get_llm_config()
        rendered = _render_pages(pdf_path, max_pages, zoom=1.75)
        parts: list[str] = []

        prompt = (
            "Extract ALL visible text from this exam paper page exactly as written. "
            "Include question numbers, options (A/B/C/D), instructions, and math. "
            "Output plain text only — no commentary."
        )

        async def ocr_all_pages() -> list[str]:
            out: list[str] = []
            for page_num, png_bytes in rendered:
                b64 = base64.b64encode(png_bytes).decode("ascii")
                messages = [
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{b64}"},
                            },
                        ],
                    }
                ]
                try:
                    text = await factory.complete(
                        prompt="",
                        system_prompt="You extract exam text from images accurately.",
                        model=config.model,
                        api_key=config.api_key,
                        base_url=config.base_url,
                        api_version=getattr(config, "api_version", None),
                        binding=getattr(config, "binding", None),
                        messages=messages,
                        max_tokens=4096,
                        temperature=0.1,
                    )
                except Exception as e:
                    print(f"   Page {page_num} LLM OCR error: {e}")
                    text = ""
                text = (text or "").strip()
                if text:
                    out.append(f"## Page {page_num}\n\n{text}")
                    print(f"   Page {page_num}: {len(text)} chars (model={config.model})")
            return out

        def _run_coro(coro):
            try:
                asyncio.get_running_loop()
            except RuntimeError:
                return asyncio.run(coro)
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(asyncio.run, coro).result()

        parts = _run_coro(ocr_all_pages())
        joined = "\n\n".join(parts)
        if joined.strip():
            print(f"✓ LLM vision OCR extracted {len(joined)} characters")
        return joined
    except Exception as e:
        print(f"✗ LLM vision OCR failed: {e}")
        return ""


def extract_text_via_ocr(pdf_path: Path, max_pages: int = DEFAULT_OCR_MAX_PAGES) -> str:
    """
    Run OCR pipelines until we get usable text.
    Order: Tesseract → Google Vision → LLM vision.
    """
    pdf_path = pdf_path.resolve()
    if not pdf_path.exists():
        return ""

    llm_pages = min(max_pages, 12)
    pipelines = [
        ("Tesseract", lambda: ocr_with_pymupdf_tesseract(pdf_path, max_pages)),
        ("Google Vision", lambda: ocr_with_google_vision(pdf_path, max_pages)),
        ("LLM vision", lambda: ocr_with_llm_vision(pdf_path, llm_pages)),
    ]

    best = ""
    for _name, run in pipelines:
        text = run()
        if len(text.strip()) > len(best.strip()):
            best = text
        if len(text.strip()) >= 150:
            return text
    return best
