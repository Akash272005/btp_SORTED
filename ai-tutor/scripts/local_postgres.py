"""Embedded PostgreSQL for local development (macOS/Linux, no Homebrew/Docker)."""

from __future__ import annotations

import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PGDATA = ROOT / "data" / "postgres" / "pgdata"
MARKER = PGDATA / ".bixy_bootstrap_done"
DB_USER = "AiTutor"
DB_PASS = "aitutor123"
DB_NAME = "AiTutor"

_server = None


def _ensure_pgserver_package() -> None:
    try:
        import pgserver  # noqa: F401
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pgserver"])


def socket_database_url(host_dir: Path | None = None) -> str:
    host = host_dir or PGDATA
    return f"postgresql+psycopg2://{DB_USER}:{DB_PASS}@/{DB_NAME}?host={host}"


def _bootstrap_roles(server) -> None:
    if MARKER.exists():
        return
    server.psql(
        f"DO $$ BEGIN CREATE ROLE \"{DB_USER}\" LOGIN PASSWORD '{DB_PASS}'; "
        f"EXCEPTION WHEN duplicate_object THEN NULL; END $$;\n"
    )
    try:
        server.psql(f'CREATE DATABASE "{DB_NAME}" OWNER "{DB_USER}";\n')
    except subprocess.CalledProcessError:
        pass
    MARKER.write_text("ok\n", encoding="utf-8")


def _patch_env_file(database_url: str) -> None:
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    text = env_path.read_text(encoding="utf-8")
    line = f"DATABASE_URL={database_url}"
    if re.search(r"^DATABASE_URL=.*$", text, flags=re.MULTILINE):
        text = re.sub(r"^DATABASE_URL=.*$", line, text, count=1, flags=re.MULTILINE)
    else:
        text = f"{text.rstrip()}\n{line}\n"
    env_path.write_text(text, encoding="utf-8")


def ensure_local_postgres(*, update_env_file: bool = False):
    """Start embedded PostgreSQL and set DATABASE_URL for this process."""
    global _server
    if _server is not None:
        return _server

    database_url = os.getenv("DATABASE_URL", "").strip()
    use_embedded = (
        not database_url
        or "localhost:5432" in database_url
        or str(PGDATA) in database_url
    )
    if not use_embedded:
        return None

    _ensure_pgserver_package()
    import pgserver

    PGDATA.parent.mkdir(parents=True, exist_ok=True)
    _server = pgserver.get_server(PGDATA, cleanup_mode="stop")
    _bootstrap_roles(_server)
    database_url = socket_database_url(PGDATA)
    os.environ["DATABASE_URL"] = database_url
    if update_env_file:
        _patch_env_file(database_url)
    return _server
