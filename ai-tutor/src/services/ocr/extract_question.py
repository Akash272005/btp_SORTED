"""
Smart Solver OCR pipeline: Azure Read → image refine / LLM vision → text cleanup.
"""

from __future__ import annotations

import base64
import os
import re
from typing import Literal

from src.services.ocr.azure_vision import (
    is_azure_vision_configured,
    is_doc_intelligence_configured,
    read_text_azure_vision,
    read_text_document_intelligence,
)
from src.services.ocr.llm_cleanup import cleanup_ocr_math_text, needs_math_cleanup
from src.services.ocr.llm_vision import (
    describe_figure_from_image,
    describe_sketch_figure_from_image,
    is_llm_vision_configured,
    read_sketch_question_from_image,
    read_text_llm_vision,
    refine_ocr_with_image,
    refine_sketch_with_image,
    references_figure,
)

MAX_IMAGE_BYTES = 8 * 1024 * 1024

Confidence = Literal["low", "medium", "high"]
OcrSource = Literal[
    "azure_vision",
    "azure_document_intelligence",
    "azure_openai_vision",
]
InputSource = Literal["upload", "draw"]

_CONF_RANK = {"low": 0, "medium": 1, "high": 2}


class OcrConfigurationError(Exception):
    """No OCR providers are configured."""


class OcrEmptyError(Exception):
    """All OCR providers returned empty text."""


def decode_base64_image(raw: str) -> bytes:
    """Decode base64 image data (with or without data-URL prefix)."""
    s = (raw or "").strip()
    if not s:
        raise ValueError("Missing image data")
    if "," in s and s.lower().startswith("data:"):
        s = s.split(",", 1)[1]
    try:
        data = base64.b64decode(s, validate=True)
    except Exception as exc:
        raise ValueError("Invalid base64 image") from exc
    if len(data) > MAX_IMAGE_BYTES:
        raise ValueError("Image too large (max 8 MB)")
    if len(data) < 16:
        raise ValueError("Image data too small")
    return data


def estimate_confidence(text: str) -> Confidence:
    t = (text or "").strip()
    if not t:
        return "low"
    if len(t) < 8:
        return "low"
    if needs_math_cleanup(t):
        return "low"
    good = sum(
        1
        for c in t
        if c.isalnum() or c in " +-=*/().,?:;[]{}²³√×÷°^"
    )
    ratio = good / max(len(t), 1)
    if ratio < 0.45:
        return "low"
    if len(t) >= 20 and ratio >= 0.65:
        return "high"
    return "medium"


def _merge_caption(caption: str | None, text: str) -> str:
    """Optional student caption merged with OCR text (Draw tab)."""
    base = (text or "").strip()
    cap = (caption or "").strip()
    if not cap:
        return base
    if not base:
        return cap
    if cap.lower() in base.lower():
        return base
    return f"{cap}\n{base}".strip()


def _any_ocr_configured() -> bool:
    return (
        is_azure_vision_configured()
        or is_doc_intelligence_configured()
        or is_llm_vision_configured()
    )


def _pick_best_text(primary: str, fallback: str) -> tuple[str, bool]:
    """Return (chosen_text, used_fallback)."""
    p = (primary or "").strip()
    f = (fallback or "").strip()
    if not f:
        return p, False
    if not p:
        return f, True
    if needs_math_cleanup(p) and not needs_math_cleanup(f):
        return f, True
    if needs_math_cleanup(p) and f:
        return f, True

    p_conf = estimate_confidence(p)
    f_conf = estimate_confidence(f)
    if _CONF_RANK[f_conf] > _CONF_RANK[p_conf]:
        return f, True
    if _CONF_RANK[f_conf] < _CONF_RANK[p_conf]:
        return p, False

    return (f, True) if len(f) > len(p) else (p, False)


async def _read_primary_ocr(
    image_bytes: bytes,
    language: str,
) -> tuple[str, OcrSource]:
    provider = os.getenv("SOLVER_OCR_PROVIDER", "azure_vision").strip().lower()

    if provider == "azure_document_intelligence" and is_doc_intelligence_configured():
        text = await read_text_document_intelligence(image_bytes)
        return text, "azure_document_intelligence"

    if is_azure_vision_configured():
        text = await read_text_azure_vision(image_bytes, language=language)
        return text, "azure_vision"

    if is_doc_intelligence_configured():
        text = await read_text_document_intelligence(image_bytes)
        return text, "azure_document_intelligence"

    return "", "azure_vision"


async def _improve_math_ocr(
    image_bytes: bytes,
    text: str,
    language: str,
) -> tuple[str, bool]:
    """
    Try image+text refine, then vision-only, then text cleanup.
    Returns (improved_text, used_llm_vision).
    """
    if not is_llm_vision_configured():
        return text, False

    current = (text or "").strip()
    used_llm = False

    if not current or needs_math_cleanup(current):
        refined = await refine_ocr_with_image(image_bytes, current, language=language)
        if refined.strip():
            current = refined.strip()
            used_llm = True

    if (not current or needs_math_cleanup(current)) and not used_llm:
        vision_text = await read_text_llm_vision(image_bytes, language=language)
        current, picked_llm = _pick_best_text(current, vision_text)
        used_llm = used_llm or picked_llm

    if current and needs_math_cleanup(current):
        cleaned = await cleanup_ocr_math_text(current, language=language)
        if cleaned.strip() and not needs_math_cleanup(cleaned):
            current = cleaned.strip()
        elif not used_llm:
            refined = await refine_ocr_with_image(image_bytes, current, language=language)
            if refined.strip():
                current = refined.strip()
                used_llm = True

    elif current and estimate_confidence(current) != "high":
        cleaned = await cleanup_ocr_math_text(current, language=language)
        if cleaned.strip():
            current = cleaned.strip()

    return current, used_llm


def _has_figure_description(text: str) -> bool:
    return "figure description:" in (text or "").lower()


async def _extract_from_sketch(
    image_bytes: bytes,
    language: str,
    caption: str | None,
) -> tuple[str, OcrSource]:
    """Hand-drawn whiteboard path: vision-first with diagram context."""
    source: OcrSource = "azure_openai_vision"
    text = ""

    if is_llm_vision_configured():
        text = await read_sketch_question_from_image(image_bytes, language=language)
        if not text.strip():
            azure_text, _ = await _read_primary_ocr(image_bytes, language=language)
            text = await refine_sketch_with_image(
                image_bytes, azure_text, language=language
            )
            if not text.strip() and azure_text.strip():
                text = azure_text.strip()
        elif not _has_figure_description(text):
            fig = await describe_sketch_figure_from_image(
                image_bytes, text, language=language
            )
            if fig.strip():
                text = f"{text.strip()}\n\n{fig.strip()}"
    else:
        text, azure_source = await _read_primary_ocr(image_bytes, language=language)
        source = azure_source

    text = _merge_caption(caption, text)
    return text, source


async def extract_question_from_image_bytes(
    image_bytes: bytes,
    language: str = "en",
    caption: str | None = None,
    input_source: InputSource | None = None,
) -> dict[str, str]:
    """
    Run the Smart Solver OCR pipeline on raw image bytes.

    Returns:
        dict with question_text, confidence, source
    """
    if not _any_ocr_configured():
        raise OcrConfigurationError(
            "OCR not configured. Set AZURE_VISION_ENDPOINT + AZURE_VISION_KEY "
            "or ensure LLM vision credentials are available."
        )

    if input_source == "draw":
        # Hand-drawn sketches use vision-first prompts (diagrams, labels, geometry).
        text, source = await _extract_from_sketch(
            image_bytes, language=language, caption=caption
        )
        text = re.sub(r"\n{3,}", "\n\n", text).strip()
        if not text:
            raise OcrEmptyError("Could not read text from image")
        return {
            "question_text": text,
            "confidence": estimate_confidence(text),
            "source": source,
        }

    text, source = await _read_primary_ocr(image_bytes, language=language)

    if not text.strip() and is_llm_vision_configured():
        text = await read_text_llm_vision(image_bytes, language=language)
        if text.strip():
            source = "azure_openai_vision"
    elif is_llm_vision_configured() and (
        needs_math_cleanup(text) or estimate_confidence(text) != "high"
    ):
        improved, used_llm = await _improve_math_ocr(image_bytes, text, language)
        if improved.strip():
            text = improved
            if used_llm:
                source = "azure_openai_vision"

    text = _merge_caption(caption, text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    if (
        text
        and references_figure(text)
        and is_llm_vision_configured()
        and "figure description:" not in text.lower()
    ):
        figure_desc = await describe_figure_from_image(
            image_bytes, text, language=language
        )
        if figure_desc.strip():
            text = f"{text}\n\n{figure_desc.strip()}"
            if source == "azure_vision":
                source = "azure_openai_vision"

    if not text:
        raise OcrEmptyError("Could not read text from image")

    return {
        "question_text": text,
        "confidence": estimate_confidence(text),
        "source": source,
    }
