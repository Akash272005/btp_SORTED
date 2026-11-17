#!/usr/bin/env python3
"""Start embedded PostgreSQL for local development (no Homebrew/Docker required)."""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.local_postgres import DB_PASS, ensure_local_postgres, socket_database_url
from scripts.local_postgres import PGDATA


def main() -> int:
    server = ensure_local_postgres(update_env_file=True)
    if server is None:
        print("DATABASE_URL already points to an external PostgreSQL instance; no local server started.")
        return 0
    database_url = socket_database_url(PGDATA)
    print(f"PostgreSQL ready (pid={server.get_pid()})")
    print("DATABASE_URL updated for local socket auth")
    print(f"Connect: {database_url.replace(DB_PASS, '****')}")
    print("Keep this terminal open, or run: python scripts/start_web.py (starts Postgres automatically)")
    try:
        import time

        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        print("\nPostgreSQL stopped.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
