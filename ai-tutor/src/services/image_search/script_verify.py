"""
Optional OCR-based locale check for Related Visuals.

Supports either:
- Google Cloud **service account JSON** (recommended — matches keys/*.json), via
  GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_VISION_CREDENTIALS_PATH
- Or legacy **API key**: GOOGLE_VISION_API_KEY / GOOGLE_API_KEY (?key= REST param)

When RELATED_VISUALS_STRICT_SCRIPT_VERIFY is enabled, calls Vision DOCUMENT_TEXT_DETECTION
and compares Devanagari vs Latin letter counts (best-effort, not perfect).
"""

from __future__ import annotations

import base64
import logging
import os
import re
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger(__name__)

_DEV = re.compile(r"[\u0900-\u097F]")
_LATIN = re.compile(r"[A-Za-z]")
_VISION_URL = "https://vision.googleapis.com/v1/images:annotate"
_VISION_SCOPE = ("https://www.googleapis.com/auth/cloud-vision",)

# Cache Credentials objects per resolved JSON path
_sa_credentials_cache: dict[str, Any] = {}

# Set to True after the first 403/permission error so we stop spamming the API.
_vision_disabled_runtime: bool = False
_vision_disabled_reason: str = ""


def _disable_vision_runtime(reason: str) -> None:
    global _vision_disabled_runtime, _vision_disabled_reason
    if _vision_disabled_runtime:
        return
    _vision_disabled_runtime = True
    _vision_disabled_reason = reason
    logger.error(
        "[script_verify] Disabling Vision OCR for the rest of this process — %s. "
        "Fix: 1) Enable the Cloud Vision API on the GCP project "
        "(https://console.cloud.google.com/apis/library/vision.googleapis.com), "
        "2) ensure billing is enabled, 3) grant the service account `roles/cloudvision.user` "
        "(or `roles/viewer`). Until then, Related Visuals will use the metadata + URL gate only.",
        reason,
    )


def _project_root() -> Path:
    # .../src/services/image_search/script_verify.py → repo root is parents[3]
    return Path(__file__).resolve().parents[3]


def _resolve_sa_json_path() -> Path | None:
    """
    Prefer GOOGLE_APPLICATION_CREDENTIALS (standard GCP).
    Else GOOGLE_VISION_CREDENTIALS_PATH (relative paths resolved from repo root).
    """
    for env_name in ("GOOGLE_APPLICATION_CREDENTIALS", "GOOGLE_VISION_CREDENTIALS_PATH"):
        raw = os.getenv(env_name, "").strip()
        if not raw:
            continue
        p = Path(raw).expanduser()
        if not p.is_absolute():
            p = _project_root() / p
        if p.is_file():
            return p
        logger.warning("[script_verify] Service account path missing or not a file: %s", p)
    return None


def strict_script_verify_enabled() -> bool:
    v = os.getenv("RELATED_VISUALS_STRICT_SCRIPT_VERIFY", "").strip().lower()
    return v in ("1", "true", "yes", "on")


def vision_api_key() -> str:
    return (
        os.getenv("GOOGLE_VISION_API_KEY", "").strip()
        or os.getenv("GOOGLE_API_KEY", "").strip()
    )


def _service_account_credentials(sa_path: Path) -> Any:
    from google.oauth2 import service_account

    key = str(sa_path.resolve())
    if key not in _sa_credentials_cache:
        _sa_credentials_cache[key] = service_account.Credentials.from_service_account_file(
            key,
            scopes=_VISION_SCOPE,
        )
    return _sa_credentials_cache[key]


def _bearer_token_sa(sa_path: Path) -> str | None:
    try:
        creds = _service_account_credentials(sa_path)
        from google.auth.transport.requests import Request

        if not creds.valid:
            creds.refresh(Request())
        return creds.token
    except Exception as e:
        logger.warning("[script_verify] Service account auth failed: %s", e)
        return None


def letter_counts(text: str) -> tuple[int, int]:
    return len(_DEV.findall(text)), len(_LATIN.findall(text))


def ocr_text_matches_visual_locale(text: str, visual_locale: str) -> bool:
    """
    True if OCR'd letters skew toward the desired script.
    Chemical/math Latin (NaCl, H2O) often appears — thresholds are pragmatic, not absolute.
    """
    raw = (text or "").strip()
    if len(raw) < 8:
        # Too little text to judge — do not block (many diagrams are mostly shapes).
        return True

    dev, latin = letter_counts(raw)
    total_letters = dev + latin
    if total_letters < 4:
        return True

    if visual_locale == "hi":
        if latin == 0:
            return dev >= 1
        if dev == 0 and latin >= 4:
            return False
        return latin <= max(5, dev * 0.35) and dev >= 3

    if dev >= 10 and latin <= dev * 0.45:
        return False
    if dev >= 6 and latin == 0:
        return False
    return True


def _vision_request_body(image_url: str | None, image_bytes: bytes | None) -> dict[str, Any]:
    req: dict[str, Any] = {"features": [{"type": "DOCUMENT_TEXT_DETECTION"}]}
    if image_bytes is not None:
        req["image"] = {"content": base64.b64encode(image_bytes).decode("ascii")}
    elif image_url:
        req["image"] = {"source": {"imageUri": image_url}}
    else:
        raise ValueError("need url or bytes")
    return {"requests": [req]}


def _parse_annotate_response(data: dict[str, Any]) -> str:
    responses = data.get("responses") or []
    if not responses:
        return ""
    err = responses[0].get("error")
    if err:
        logger.warning("[script_verify] Vision API error in response: %s", err)
        return ""
    ann = responses[0].get("textAnnotations") or []
    if not ann:
        return ""
    return ann[0].get("description") or ""


def _vision_annotate(body: dict[str, Any], timeout: float) -> str:
    if _vision_disabled_runtime:
        return ""

    headers = {"Content-Type": "application/json"}
    sa_path = _resolve_sa_json_path()
    api_key = vision_api_key()

    if sa_path:
        token = _bearer_token_sa(sa_path)
        if not token:
            return ""
        headers["Authorization"] = f"Bearer {token}"
        r = requests.post(_VISION_URL, json=body, headers=headers, timeout=timeout)
    elif api_key:
        r = requests.post(
            _VISION_URL,
            params={"key": api_key},
            json=body,
            headers=headers,
            timeout=timeout,
        )
    else:
        return ""

    if r.status_code in (401, 403):
        _disable_vision_runtime(f"HTTP {r.status_code} from Cloud Vision")
        return ""
    r.raise_for_status()
    return _parse_annotate_response(r.json())


def extract_text_google_vision_bytes(image_bytes: bytes, timeout: float = 45.0) -> str:
    """OCR raw image bytes via Google Cloud Vision (for PDF page renders, etc.)."""
    if not image_bytes:
        return ""
    try:
        body = _vision_request_body(None, image_bytes)
        return _vision_annotate(body, timeout).strip()
    except Exception as e:
        logger.debug("[script_verify] Vision bytes OCR failed: %s", e)
        return ""


def extract_text_google_vision(image_url: str, timeout: float = 18.0) -> str:
    """
    Returns concatenated OCR text. Empty string on failure.
    Tries public imageUri first; on failure downloads bytes (some hosts block remote fetch).
    Authenticates with service account JSON if configured, else API key.
    """
    try:
        body = _vision_request_body(image_url, None)
        text = _vision_annotate(body, timeout).strip()
        if text:
            return text
    except Exception as e:
        logger.debug("[script_verify] Vision imageUri failed: %s", e)

    try:
        ir = requests.get(
            image_url,
            timeout=min(timeout, 15.0),
            headers={"User-Agent": "bixy_AiTutor/1.0 (educational)"},
        )
        ir.raise_for_status()
        if len(ir.content) > 8 * 1024 * 1024:
            return ""
        body = _vision_request_body(None, ir.content)
        return _vision_annotate(body, timeout).strip()
    except Exception as e:
        logger.warning("[script_verify] Vision OCR failed for %s: %s", image_url[:80], e)
        return ""


def image_url_matches_visual_locale(image_url: str, visual_locale: str) -> bool:
    """
    Full check: strict flag off → True.
    SVG skipped (OCR unreliable / not always supported well).

    When Vision OCR is unavailable (no creds, or runtime-disabled after 403/401), the
    gate falls back to True so the upstream metadata + host filter is the only check.
    """
    if not strict_script_verify_enabled():
        return True

    low = (image_url or "").split("?", 1)[0].lower()
    if low.endswith(".svg"):
        return True

    if _vision_disabled_runtime:
        return True

    sa_path = _resolve_sa_json_path()
    api_key = vision_api_key()
    if not sa_path and not api_key:
        logger.warning(
            "[script_verify] RELATED_VISUALS_STRICT_SCRIPT_VERIFY is on but "
            "no credentials (set GOOGLE_APPLICATION_CREDENTIALS / GOOGLE_VISION_CREDENTIALS_PATH "
            "or GOOGLE_VISION_API_KEY / GOOGLE_API_KEY) — skipping OCR gate"
        )
        return True

    text = extract_text_google_vision(image_url)
    if _vision_disabled_runtime:
        return True
    ok = ocr_text_matches_visual_locale(text, visual_locale)
    if not ok:
        logger.info(
            "[script_verify] Rejected image by OCR locale (want=%s): %s…",
            visual_locale,
            image_url[:70],
        )
    return ok


__all__ = [
    "strict_script_verify_enabled",
    "ocr_text_matches_visual_locale",
    "image_url_matches_visual_locale",
    "extract_text_google_vision",
]
