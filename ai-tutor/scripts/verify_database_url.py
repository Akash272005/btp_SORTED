#!/usr/bin/env python3
"""Test DATABASE_URL from .env or env/azure-production.env."""

from __future__ import annotations

import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / "env" / "azure-production.env", override=False)
load_dotenv(ROOT / ".env", override=True)

url = __import__("os").getenv("DATABASE_URL", "").strip()
if not url:
    print("DATABASE_URL is not set.", file=sys.stderr)
    sys.exit(1)

if "YOUR_PASSWORD" in url or "REPLACE" in url.upper():
    print("DATABASE_URL still has placeholders. Create Azure Postgres first.", file=sys.stderr)
    sys.exit(1)

safe = re.sub(r":([^:@/]+)@", ":****@", url)
print(f"Testing: {safe[:140]}...")

try:
    engine = create_engine(url, pool_pre_ping=True)
    with engine.connect() as conn:
        version = conn.execute(text("SELECT version()")).scalar()
        db = conn.execute(text("SELECT current_database()")).scalar()
    print("OK — connected")
    print(f"database: {db}")
    print(f"version: {version.split(',')[0] if version else version}")
except Exception as exc:
    print(f"FAILED — {type(exc).__name__}: {exc}", file=sys.stderr)
    sys.exit(1)
