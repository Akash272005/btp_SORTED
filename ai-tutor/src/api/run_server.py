#!/usr/bin/env python
"""
Uvicorn Server Startup Script
Uses Python API instead of command line to avoid Windows path parsing issues.
"""

import os
import sys
from pathlib import Path

# Force unbuffered output
os.environ["PYTHONUNBUFFERED"] = "1"
# Set tiktoken cache directory to local folder to support offline mode
os.environ["TIKTOKEN_CACHE_DIR"] = str(Path(__file__).parent.parent.parent / ".tiktoken_cache")

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(line_buffering=True)
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(line_buffering=True)

import uvicorn

if __name__ == "__main__":
    # Get project root directory
    project_root = Path(__file__).parent.parent.parent

    # Load .env before uvicorn imports the app (LMS requires DATABASE_URL at import time)
    try:
        from dotenv import load_dotenv

        load_dotenv(project_root / "bixy_AiTutor.env", override=False)
        load_dotenv(project_root / ".env", override=True)
    except ImportError:
        pass

    # Change to project root to ensure correct module imports
    os.chdir(str(project_root))

    # Ensure project root is in Python path
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))

    # Get port from configuration
    from src.services.setup import get_backend_port

    backend_port = get_backend_port(project_root)

    # Configure reload_excludes to skip directories that shouldn't trigger reloads
    # Use absolute paths to ensure they're properly resolved
    reload_excludes = [
        str(project_root / "venv"),  # Virtual environment
        str(project_root / ".venv"),  # Virtual environment (alternative name)
        str(project_root / "data"),  # Data directory (includes knowledge_bases, user data, logs)
        str(project_root / "node_modules"),  # Node modules (if any at root)
        str(project_root / "web" / "node_modules"),  # Web node modules
        str(project_root / "web" / ".next"),  # Next.js build
        str(project_root / ".git"),  # Git directory
        str(project_root / "scripts"),  # Scripts directory - don't reload on launcher changes
    ]

    # Filter out non-existent directories to avoid warnings
    reload_excludes = [d for d in reload_excludes if Path(d).exists()]

    # Start uvicorn server with reload (configurable).
    # File watchers can be memory-heavy on low-memory machines, so allow opting out.
    reload_env = os.environ.get("BACKEND_RELOAD", "true").strip().lower()
    backend_reload = reload_env in ("1", "true", "yes", "y", "on")

    # Start uvicorn server
    uvicorn.run(
        "src.api.main:app",
        host="0.0.0.0",
        port=backend_port,
        reload=backend_reload,
        reload_excludes=reload_excludes,
        log_level="warning",
        access_log=False,
    )
