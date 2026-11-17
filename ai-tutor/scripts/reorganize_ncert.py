#!/usr/bin/env python3
"""
Reorganize NCERT PDFs from english/hindi folders to their true subject folders based on the source_url path.
"""

import csv
import shutil
import re
from pathlib import Path

def main():
    project_root = Path(__file__).resolve().parent.parent
    ncert_root = project_root / "ncert_source"
    tracker_path = ncert_root / "ncert_download_tracker.csv"

    if not tracker_path.exists():
        print(f"Tracker not found: {tracker_path}")
        return

    with open(tracker_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    moved_count = 0
    missing_count = 0
    for row in rows:
        clazz = row.get("class", "").strip()
        subject_medium = row.get("subject", "").strip() # This contains "hindi" or "english" which is wrong.
        source_url = row.get("source_url", "").strip()
        filename = row.get("pdf_filename", "").strip()
        
        if not clazz or not filename or not source_url:
            continue
            
        # Parse the true subject from source_url
        # Example: Class_12/Biology/Hindi/lhbo108.pdf
        # We want "Biology" -> "biology"
        # Or maybe it's something else?
        
        # We can extract the second part after Class_XX/
        match = re.search(r"Class_\d+?/([^/]+)/", source_url, re.IGNORECASE)
        true_subject = ""
        if match:
            true_subject = match.group(1).lower().replace(" ", "-").replace("_", "-")
        else:
            # Fallback for unparseable source_url
            continue

        # The current location is in ncert_root / clazz / subject_medium / filename
        current_path = ncert_root / clazz / subject_medium / filename
        if current_path.exists():
            dest_dir = ncert_root / clazz / true_subject
            dest_dir.mkdir(parents=True, exist_ok=True)
            dest_path = dest_dir / filename
            
            if current_path != dest_path:
                shutil.move(str(current_path), str(dest_path))
                print(f"Moved {current_path.relative_to(ncert_root)} -> {dest_path.relative_to(ncert_root)}")
                moved_count += 1
                
                # Update the CSV row's subject
                row["subject"] = true_subject
        else:
            # Maybe it's already in the right place or doesn't exist
            if (ncert_root / clazz / true_subject / filename).exists():
                row["subject"] = true_subject # Fix CSV anyway
            else:
                missing_count += 1

    # Write back the CSV
    with open(tracker_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print(f"Total moved: {moved_count}, Missing: {missing_count}")
    
    # Let's clean up empty english/hindi directories if any
    for d in ncert_root.glob("class-*/*"):
        if d.is_dir() and not any(d.iterdir()):
            d.rmdir()
            print(f"Removed empty directory: {d.relative_to(ncert_root)}")


if __name__ == "__main__":
    main()
