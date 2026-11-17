"""OCR services for Smart Solver (Azure-first)."""

from src.services.ocr.extract_question import extract_question_from_image_bytes

__all__ = ["extract_question_from_image_bytes"]
