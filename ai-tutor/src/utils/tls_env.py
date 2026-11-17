# -*- coding: utf-8 -*-
"""TLS-related environment sanitization.

If ``SSL_CERT_FILE`` / ``REQUESTS_CA_BUNDLE`` / etc. point to a path that does not
exist (e.g. a macOS path copied into ``.env`` on Windows), OpenSSL raises
``[Errno 2] No such file or directory`` for every HTTPS request. Clearing those
vars helps; ``reconcile_ssl_env_after_dotenv_load()`` also sets certifi's bundle
when nothing valid remains (common after ``load_dotenv`` re-applies a bad path).
"""

from __future__ import annotations

import os
from pathlib import Path

_CA_BUNDLE_ENV_KEYS = (
    "SSL_CERT_FILE",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
    "HTTPX_CA_BUNDLE",
)


def sanitize_invalid_ssl_cert_env() -> list[str]:
    """
    Remove CA-bundle env vars whose paths are missing or not files.

    Returns:
        Human-readable list of what was cleared (for logging).
    """
    cleared: list[str] = []
    for key in _CA_BUNDLE_ENV_KEYS:
        raw = os.environ.get(key)
        if not raw or not str(raw).strip():
            continue
        path = Path(str(raw).strip())
        if not path.is_file():
            os.environ.pop(key, None)
            cleared.append(f"{key}={raw!r}")
    return cleared


def _any_valid_ca_bundle_env() -> bool:
    """True if at least one CA-related env var points to an existing file."""
    for key in _CA_BUNDLE_ENV_KEYS:
        raw = os.environ.get(key)
        if not raw or not str(raw).strip():
            continue
        if Path(str(raw).strip()).is_file():
            return True
    return False


def ensure_trusted_ca_bundle_env() -> None:
    """
    If no CA bundle env var points to a real file, set ``SSL_CERT_FILE`` to certifi's bundle.

    Helps macOS/pyenv installs where the default OpenSSL store is empty and avoids
    ``[Errno 2]`` when ``load_dotenv`` re-applies a broken ``SSL_CERT_FILE`` from ``.env``.
    """
    if _any_valid_ca_bundle_env():
        return
    try:
        import certifi

        ca = certifi.where()
        if Path(ca).is_file():
            os.environ["SSL_CERT_FILE"] = ca
    except ImportError:
        pass


def reconcile_ssl_env_after_dotenv_load() -> list[str]:
    """
    Call after ``load_dotenv(...)`` so invalid CA paths from ``.env`` are removed and a
    usable bundle is selected (typically certifi).
    """
    cleared = sanitize_invalid_ssl_cert_env()
    ensure_trusted_ca_bundle_env()
    return cleared


def httpx_verify_arg() -> bool | str:
    """
    ``verify`` value for ``httpx.AsyncClient``, aligned with ``DISABLE_SSL_VERIFY``.

    When verification is enabled, prefers certifi's CA path when available so HTTPS
    does not depend on a broken ``SSL_CERT_FILE`` from the environment.
    """
    disable = os.getenv("DISABLE_SSL_VERIFY", "false").strip().lower() in ("true", "1", "yes")
    if disable:
        return False
    try:
        import certifi

        ca = certifi.where()
        if Path(ca).is_file():
            return ca
    except ImportError:
        pass
    return True
