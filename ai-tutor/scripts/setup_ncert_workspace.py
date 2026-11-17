#!/usr/bin/env python3
"""
Create a structured NCERT content workspace for bixy_AiTutor ingestion.

This script creates:
1) ncert_source/class-XX/<subject>/ directories
2) ncert_source/ncert_download_tracker.csv
3) ncert_source/KB_PLAN.md
"""

from __future__ import annotations

import csv
from pathlib import Path


CLASS_SUBJECTS = {
    1: ["english", "hindi", "maths", "evs"],
    2: ["english", "hindi", "maths", "evs"],
    3: ["english", "hindi", "maths", "evs"],
    4: ["english", "hindi", "maths", "evs"],
    5: ["english", "hindi", "maths", "evs"],
    6: ["english", "hindi", "mathematics", "science", "social-science", "sanskrit"],
    7: ["english", "hindi", "mathematics", "science", "social-science", "sanskrit"],
    8: ["english", "hindi", "mathematics", "science", "social-science", "sanskrit"],
    9: ["english", "hindi", "mathematics", "science", "social-science", "sanskrit"],
    10: ["english", "hindi", "mathematics", "science", "social-science", "sanskrit"],
    11: [
        "english",
        "hindi",
        "physics",
        "chemistry",
        "biology",
        "mathematics",
        "economics",
        "history",
        "political-science",
        "geography",
        "accountancy",
        "business-studies",
        "sociology",
    ],
    12: [
        "english",
        "hindi",
        "physics",
        "chemistry",
        "biology",
        "mathematics",
        "economics",
        "history",
        "political-science",
        "geography",
        "accountancy",
        "business-studies",
        "sociology",
    ],
}


def build_workspace(project_root: Path) -> Path:
    ncert_root = project_root / "ncert_source"
    ncert_root.mkdir(exist_ok=True)

    for class_num, subjects in CLASS_SUBJECTS.items():
        class_dir = ncert_root / f"class-{class_num:02d}"
        class_dir.mkdir(exist_ok=True)
        for subject in subjects:
            (class_dir / subject).mkdir(exist_ok=True)

    return ncert_root


def write_tracker_csv(ncert_root: Path) -> None:
    tracker_file = ncert_root / "ncert_download_tracker.csv"
    headers = [
        "class",
        "subject",
        "book_or_chapter",
        "pdf_filename",
        "source_url",
        "download_status",
        "ingest_status",
        "notes",
    ]

    with tracker_file.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for class_num, subjects in CLASS_SUBJECTS.items():
            for subject in subjects:
                writer.writerow(
                    [
                        f"class-{class_num:02d}",
                        subject,
                        "",
                        "",
                        "https://ncert.nic.in/textbook.php",
                        "pending",
                        "pending",
                        "",
                    ]
                )


def write_kb_plan(ncert_root: Path) -> None:
    plan_file = ncert_root / "KB_PLAN.md"
    plan_file.write_text(
        """# NCERT Knowledge Base Plan

Use these KB names in bixy_AiTutor:

- `ncert_c01_c05_all`
- `ncert_c06_c08_all`
- `ncert_c09_c10_all`
- `ncert_c11_c12_science`
- `ncert_c11_c12_commerce_humanities`

## Suggested Ingestion Order

1. Class 10 Mathematics + Science
2. Class 12 Physics + Chemistry + Biology + Mathematics
3. Classes 6-9 core subjects
4. Remaining classes and optional subjects

## File Naming Format

`ncert_c{class}_{subject}_{book_or_chapter}_{lang}.pdf`

Example:
`ncert_c10_science_ch01_chemical_reactions_en.pdf`
""",
        encoding="utf-8",
    )


def write_readme(ncert_root: Path) -> None:
    readme = ncert_root / "README.md"
    readme.write_text(
        """# NCERT Source Workspace

This folder stores NCERT PDFs before uploading to bixy_AiTutor knowledge bases.

## Source

Use official NCERT sources:
- https://ncert.nic.in/textbook.php
- https://epathshala.nic.in/

## Workflow

1. Download PDFs into `class-XX/<subject>/`
2. Track progress in `ncert_download_tracker.csv`
3. Upload in batches to bixy_AiTutor Knowledge Base page
4. Mark `ingest_status` as done after successful processing
""",
        encoding="utf-8",
    )


def write_kb_mapping_csv(ncert_root: Path) -> None:
    """Write subject-wise KB mapping from local folders to KB names."""
    mapping_file = ncert_root / "kb_folder_mapping.csv"
    headers = ["class", "subject", "local_folder", "suggested_kb_name", "status", "notes"]

    with mapping_file.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        for class_num, subjects in CLASS_SUBJECTS.items():
            for subject in subjects:
                class_tag = f"c{class_num:02d}"
                local_folder = f"ncert_source/class-{class_num:02d}/{subject}"
                suggested_kb = f"ncert_{class_tag}_{subject}"
                writer.writerow(
                    [
                        f"class-{class_num:02d}",
                        subject,
                        local_folder,
                        suggested_kb,
                        "pending",
                        "",
                    ]
                )


def write_upload_checklist(ncert_root: Path) -> None:
    """Write a markdown checklist for class/subject upload execution."""
    checklist_file = ncert_root / "UPLOAD_CHECKLIST.md"
    lines = [
        "# NCERT Upload Checklist",
        "",
        "Use this checklist while creating Knowledge Bases and uploading PDFs.",
        "",
        "## Recommended Sequence",
        "",
        "- [ ] Phase 1: Class 10 (Mathematics, Science)",
        "- [ ] Phase 2: Class 12 (Physics, Chemistry, Biology, Mathematics)",
        "- [ ] Phase 3: Classes 6-9 core subjects",
        "- [ ] Phase 4: Remaining classes and optional subjects",
        "",
        "## Subject-wise KB Mapping",
        "",
        "Reference: `kb_folder_mapping.csv`",
        "",
    ]

    for class_num, subjects in CLASS_SUBJECTS.items():
        lines.append(f"### Class {class_num:02d}")
        lines.append("")
        for subject in subjects:
            class_tag = f"c{class_num:02d}"
            lines.append(
                f"- [ ] `{subject}` -> KB: `ncert_{class_tag}_{subject}` from folder `ncert_source/class-{class_num:02d}/{subject}`"
            )
        lines.append("")

    checklist_file.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    project_root = Path(__file__).resolve().parent.parent
    ncert_root = build_workspace(project_root)
    write_tracker_csv(ncert_root)
    write_kb_plan(ncert_root)
    write_readme(ncert_root)
    write_kb_mapping_csv(ncert_root)
    write_upload_checklist(ncert_root)
    print(f"NCERT workspace created at: {ncert_root}")


if __name__ == "__main__":
    main()
