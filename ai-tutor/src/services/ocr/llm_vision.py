"""
Azure OpenAI vision fallback for Smart Solver when Azure Read returns little text.
"""

from __future__ import annotations

import base64
import re

from src.app_logging import get_logger
from src.services.llm import factory
from src.services.llm.config import get_llm_config

logger = get_logger("LLMVisionOCR")

_VISION_PROMPT = (
    "Extract the homework or exam QUESTION from this photo exactly as written. "
    "IGNORE notebook brand names/logos (e.g. CLASSMATE), page headers, "
    "watermarks, ruled-line numbers, and decorative text that is not part of the question. "
    "Preserve math accurately: use Unicode superscripts (² ³) or ^ where needed, "
    "fractions as a/b, and keep equation steps on clear lines. "
    "Include question numbers and options (A/B/C/D) only if they belong to the question. "
    "Output plain text only — no commentary.\n"
    "Language hint: {language}"
)

_REFINE_PROMPT = (
    "The attached image shows a student's notebook or textbook page. "
    "Noisy OCR text from the image:\n"
    "---\n{raw}\n---\n"
    "Output ONLY the actual question text. "
    "REMOVE notebook brand names/logos (e.g. RANKA), headers, watermarks, and any "
    "non-question text visible at the top or margins of the page. "
    "Use Unicode ² ³, fractions like y²/100 and (y/10)². "
    "If the question refers to a figure/diagram, add a section after the question:\n"
    "Figure description: <describe labels, shapes, angles, and relationships visible>\n"
    "Do NOT ask the user to upload anything. Do NOT solve the question. Plain text only.\n"
    "Language: {language}"
)

_FIGURE_DESC_PROMPT = (
    "The attached image shows an exam question that includes a diagram or figure.\n"
    "Question text already extracted:\n"
    "---\n{question}\n---\n"
    "Describe ONLY the diagram/figure so someone who cannot see the image can solve "
    "the question. Include point labels (A, B, O, P, etc.), shapes, tangents, chords, "
    "radii, given angle values, parallel/perpendicular marks, and any measurements shown.\n"
    "Output plain text starting with 'Figure description:' — do not solve the question.\n"
    "Language: {language}"
)

_FIGURE_REFERENCE_RE = re.compile(
    r"\b(?:figure|diagram|illustration|graph|sketch|drawing|picture)\b|"
    r"\bas\s+shown\b|"
    r"\bgiven\s+fig",
    re.IGNORECASE,
)

_SKETCH_VISION_PROMPT = (
    "This image is a hand-drawn math or science question on a digital whiteboard "
    "(pen strokes on a white background — NOT a printed textbook photo).\n"
    "Extract the COMPLETE question a student wants solved:\n"
    "1. All written words or instructions (e.g. 'Solve for x?')\n"
    "2. Every number, variable, and math symbol visible\n"
    "3. Any diagram: shapes (triangles, circles, graphs, axes), side lengths written on "
    "the diagram, angle marks (including right-angle squares), point labels, and "
    "given measurements\n\n"
    "Output plain text only — do NOT solve the question.\n"
    "Format:\n"
    "<question text combining instructions and math>\n\n"
    "Figure description: <describe the diagram with all labels, lengths, and relationships>\n"
    "If there is no diagram or shape, omit the Figure description section.\n"
    "Language: {language}"
)

_SKETCH_FIGURE_DESC_PROMPT = (
    "This image is a hand-drawn math/science sketch on a whiteboard.\n"
    "Question text already extracted:\n"
    "---\n{question}\n---\n"
    "Describe EVERY visual element needed to solve the question: shapes, lines, "
    "triangles, circles, graphs, coordinates, right-angle marks, parallel/perpendicular "
    "marks, and ALL numeric labels or variables written on the diagram.\n"
    "Output plain text starting with 'Figure description:' — do not solve the question.\n"
    "Language: {language}"
)


def references_figure(text: str) -> bool:
    """True when OCR text suggests the question depends on a diagram."""
    return bool(_FIGURE_REFERENCE_RE.search(text or ""))


def is_valid_ocr_output(text: str) -> bool:
    """Reject chatty LLM replies that are not extracted question text."""
    t = (text or "").strip()
    if len(t) < 6:
        return False
    lower = t.lower()
    bad_phrases = (
        "please upload",
        "upload the photo",
        "upload a photo",
        "share the photo",
        "send the image",
        "i'll transcribe",
        "i will transcribe",
        "i can transcribe",
        "let me know",
        "happy to help",
    )
    if any(phrase in lower for phrase in bad_phrases):
        return False
    return True


def is_llm_vision_configured() -> bool:
    try:
        config = get_llm_config()
        return bool(config.api_key and config.base_url)
    except Exception:
        return False


def _guess_image_mime(image_bytes: bytes) -> str:
    if image_bytes[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if image_bytes[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if len(image_bytes) >= 12 and image_bytes[:4] == b"RIFF" and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    if image_bytes[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    return "image/jpeg"


def _image_data_url(image_bytes: bytes) -> str:
    mime = _guess_image_mime(image_bytes)
    b64 = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{mime};base64,{b64}"


async def _complete_with_image(
    image_bytes: bytes,
    text_prompt: str,
    system_prompt: str,
    max_tokens: int = 4096,
) -> str:
    if not is_llm_vision_configured():
        return ""

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": text_prompt},
                {
                    "type": "image_url",
                    "image_url": {"url": _image_data_url(image_bytes)},
                },
            ],
        }
    ]

    config = get_llm_config()
    text = await factory.complete(
        prompt="",
        system_prompt=system_prompt,
        model=config.model,
        api_key=config.api_key,
        base_url=config.base_url,
        api_version=getattr(config, "api_version", None),
        binding=getattr(config, "binding", None),
        messages=messages,
        max_tokens=max_tokens,
        temperature=0.1,
    )
    return (text or "").strip()


async def read_text_llm_vision(image_bytes: bytes, language: str = "en") -> str:
    """Extract text from a single image using the configured vision-capable LLM."""
    if not is_llm_vision_configured():
        return ""

    lang = (language or "en").strip().lower()[:2] or "en"
    try:
        result = await _complete_with_image(
            image_bytes,
            _VISION_PROMPT.format(language=lang),
            (
                "You are an OCR engine. Extract exam question text from images. "
                "Output plain text only. Never ask the user to upload a photo."
            ),
        )
        if result and is_valid_ocr_output(result):
            logger.info("LLM vision OCR extracted %d characters", len(result))
            return result
        if result:
            logger.warning("LLM vision OCR returned invalid/conversational text")
        return ""
    except Exception as exc:
        logger.warning("LLM vision OCR failed: %s", exc)
        return ""


async def read_sketch_question_from_image(
    image_bytes: bytes,
    language: str = "en",
) -> str:
    """Extract hand-drawn whiteboard questions (text + diagram) via vision LLM."""
    if not is_llm_vision_configured():
        return ""

    lang = (language or "en").strip().lower()[:2] or "en"
    try:
        result = await _complete_with_image(
            image_bytes,
            _SKETCH_VISION_PROMPT.format(language=lang),
            (
                "You read hand-drawn student math sketches from a whiteboard. "
                "Include all diagram labels and measurements. "
                "Output plain text only. Never ask the user to upload a photo."
            ),
            max_tokens=4096,
        )
        if result and is_valid_ocr_output(result):
            logger.info("LLM sketch OCR extracted %d characters", len(result))
            return result
        if result:
            logger.warning("LLM sketch OCR returned invalid/conversational text")
        return ""
    except Exception as exc:
        logger.warning("LLM sketch OCR failed: %s", exc)
        return ""


async def refine_sketch_with_image(
    image_bytes: bytes,
    noisy_text: str,
    language: str = "en",
) -> str:
    """Refine partial/noisy OCR for a hand-drawn sketch using the image."""
    if not is_llm_vision_configured():
        return ""

    lang = (language or "en").strip().lower()[:2] or "en"
    raw = (noisy_text or "").strip() or "(little or no text detected)"
    prompt = (
        "The attached image is a hand-drawn math/science sketch on a whiteboard.\n"
        "Partial or noisy text detected:\n"
        f"---\n{raw}\n---\n"
        "Using the image, output the COMPLETE question: all written text, numbers, "
        "variables, AND a Figure description section covering any diagram with all "
        "labeled side lengths, angles, and shapes.\n"
        "Do NOT solve the question. Plain text only.\n"
        f"Language: {lang}"
    )
    try:
        result = await _complete_with_image(
            image_bytes,
            prompt,
            (
                "You fix incomplete OCR of hand-drawn math sketches. "
                "Output plain text only. Never ask the user to upload a photo."
            ),
            max_tokens=4096,
        )
        if result and is_valid_ocr_output(result):
            logger.info("LLM sketch refine: %d -> %d characters", len(raw), len(result))
            return result
        return ""
    except Exception as exc:
        logger.warning("LLM sketch refine failed: %s", exc)
        return ""


async def refine_ocr_with_image(
    image_bytes: bytes,
    noisy_text: str,
    language: str = "en",
) -> str:
    """Use vision + noisy OCR together — best for garbled math textbook photos."""
    if not is_llm_vision_configured():
        return ""

    lang = (language or "en").strip().lower()[:2] or "en"
    raw = (noisy_text or "").strip() or "(OCR returned little or no text)"
    try:
        result = await _complete_with_image(
            image_bytes,
            _REFINE_PROMPT.format(language=lang, raw=raw),
            (
                "You are an OCR engine. Fix noisy textbook math OCR using the image. "
                "Output plain text only. Never ask the user to upload a photo."
            ),
        )
        if result and is_valid_ocr_output(result):
            logger.info("LLM image refine: %d -> %d characters", len(raw), len(result))
            return result
        if result:
            logger.warning("LLM image refine returned invalid/conversational text")
        return ""
    except Exception as exc:
        logger.warning("LLM image refine failed: %s", exc)
        return ""


async def describe_sketch_figure_from_image(
    image_bytes: bytes,
    question_text: str,
    language: str = "en",
) -> str:
    """Describe a hand-drawn diagram even when question text does not say 'figure'."""
    if not is_llm_vision_configured():
        return ""

    question = (question_text or "").strip()
    if not question:
        return ""

    lang = (language or "en").strip().lower()[:2] or "en"
    try:
        result = await _complete_with_image(
            image_bytes,
            _SKETCH_FIGURE_DESC_PROMPT.format(question=question, language=lang),
            (
                "You describe hand-drawn math diagrams from whiteboard sketches. "
                "Output plain text only. Never ask the user to upload a photo."
            ),
            max_tokens=2048,
        )
        if not result or not is_valid_ocr_output(result):
            return ""
        desc = result.strip()
        if desc.lower().startswith("figure description:"):
            return desc
        return f"Figure description: {desc}"
    except Exception as exc:
        logger.warning("LLM sketch figure description failed: %s", exc)
        return ""


async def describe_figure_from_image(
    image_bytes: bytes,
    question_text: str,
    language: str = "en",
) -> str:
    """Describe a diagram/figure when the question text references one."""
    if not is_llm_vision_configured():
        return ""

    question = (question_text or "").strip()
    if not question or not references_figure(question):
        return ""

    lang = (language or "en").strip().lower()[:2] or "en"
    try:
        result = await _complete_with_image(
            image_bytes,
            _FIGURE_DESC_PROMPT.format(question=question, language=lang),
            (
                "You describe exam diagrams from photos. "
                "Output plain text only. Never ask the user to upload a photo."
            ),
            max_tokens=2048,
        )
        if not result or not is_valid_ocr_output(result):
            return ""
        desc = result.strip()
        if desc.lower().startswith("figure description:"):
            return desc
        return f"Figure description: {desc}"
    except Exception as exc:
        logger.warning("LLM figure description failed: %s", exc)
        return ""
