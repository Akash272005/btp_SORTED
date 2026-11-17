#!/usr/bin/env python3
"""Fetch YouTube transcripts locally and upload them to Azure Blob cache.

Run from a residential connection (e.g. your Mac). Azure production then serves
cached transcripts without calling YouTube.

Usage:
  python scripts/publish_video_transcripts.py --url "https://www.youtube.com/watch?v=VIDEO_ID"
  python scripts/publish_video_transcripts.py --video-id dQw4w9WgXcQ
  python scripts/publish_video_transcripts.py --urls-file data/video_urls.txt
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / "bixy_AiTutor.env", override=False)
load_dotenv(ROOT / ".env", override=True)

from src.services.video.video_transcriber import (  # noqa: E402
    extract_video_id,
    fetch_transcript_with_timestamps,
)


def _collect_video_ids(args: argparse.Namespace) -> list[str]:
    ids: list[str] = []

    if args.video_id:
        ids.append(args.video_id.strip())

    if args.url:
        for raw in args.url:
            video_id = extract_video_id(raw.strip())
            if video_id:
                ids.append(video_id)

    if args.urls_file:
        path = Path(args.urls_file)
        if not path.is_file():
            raise SystemExit(f"URLs file not found: {path}")
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            video_id = extract_video_id(line)
            if video_id:
                ids.append(video_id)

    # Preserve order, drop duplicates
    seen: set[str] = set()
    ordered: list[str] = []
    for vid in ids:
        if vid not in seen:
            seen.add(vid)
            ordered.append(vid)
    return ordered


def main() -> int:
    parser = argparse.ArgumentParser(description="Prefetch YouTube transcripts into Azure Blob")
    parser.add_argument("--url", action="append", help="YouTube URL (repeatable)")
    parser.add_argument("--video-id", help="11-character YouTube video ID")
    parser.add_argument("--urls-file", help="Text file with one URL or video ID per line")
    parser.add_argument("--force", action="store_true", help="Re-fetch from YouTube even if blob cache exists")
    args = parser.parse_args()

    video_ids = _collect_video_ids(args)
    if not video_ids:
        parser.error("Provide --url, --video-id, or --urls-file")

    ok = 0
    failed = 0

    for video_id in video_ids:
        print(f"Fetching {video_id}...", flush=True)
        result = fetch_transcript_with_timestamps(
            f"https://www.youtube.com/watch?v={video_id}",
            skip_cache=args.force,
            force_live=True,
        )
        if not result.get("success"):
            failed += 1
            print(f"  FAIL: {result.get('error', 'unknown error')}", flush=True)
            continue

        ok += 1
        chunks = len(result.get("chunks") or [])
        print(f"  OK: cached {chunks} chunks", flush=True)

    print(f"Done. cached={ok} failed={failed}", flush=True)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
