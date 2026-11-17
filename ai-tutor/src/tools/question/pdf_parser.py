#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Parse PDF files using MinerU and save results to reference_papers directory
"""

import argparse
from datetime import datetime
from pathlib import Path
import shutil
import subprocess
import sys


def check_mineru_installed():
    """Check if MinerU is installed"""
    try:
        # Security: Using partial path is intentional here - we need to find
        # the command in user's PATH. These are trusted CLI tools, not user input.
        result = subprocess.run(
            ["magic-pdf", "--version"],  # nosec B607
            check=False,
            capture_output=True,
            text=True,
            shell=False,
        )
        if result.returncode == 0:
            return "magic-pdf"
    except FileNotFoundError:
        pass

    try:
        # Security: Same as above - intentionally using PATH lookup for CLI tool.
        result = subprocess.run(
            ["mineru", "--version"],  # nosec B607
            check=False,
            capture_output=True,
            text=True,
            shell=False,
        )
        if result.returncode == 0:
            return "mineru"
    except FileNotFoundError:
        pass

    return None


def _write_parsed_markdown(pdf_path: Path, output_dir: Path, text_content: str) -> bool:
    """Write extracted text into the MinerU-compatible auto/ folder layout."""
    import json

    auto_dir = output_dir / "auto"
    auto_dir.mkdir(parents=True, exist_ok=True)
    md_file = auto_dir / f"{pdf_path.stem}.md"
    header = f"# {pdf_path.stem}\n\n"
    with open(md_file, "w", encoding="utf-8") as f:
        f.write(header + text_content.strip() + "\n")

    content_list_file = auto_dir / f"{pdf_path.stem}_content_list.json"
    with open(content_list_file, "w", encoding="utf-8") as f:
        json.dump([], f)

    print(f"✓ Extracted {len(text_content)} characters to {md_file}")
    return True


def fallback_parse_pdf_with_pymupdf(pdf_path: Path, output_dir: Path) -> bool:
    """PyMuPDF text extraction — better than pypdf for many exam PDFs."""
    print("⚠️  Falling back to PyMuPDF parser...")
    try:
        import fitz  # PyMuPDF

        doc = fitz.open(str(pdf_path))
        parts: list[str] = []
        for i, page in enumerate(doc):
            page_text = (page.get_text() or "").strip()
            if page_text:
                parts.append(f"## Page {i + 1}\n\n{page_text}")
        doc.close()

        if not parts:
            print("✗ PyMuPDF extracted no text (PDF may be image-only/scanned)")
            return False

        return _write_parsed_markdown(pdf_path, output_dir, "\n\n".join(parts))
    except ImportError:
        print("✗ PyMuPDF (fitz) not installed")
        return False
    except Exception as e:
        print(f"✗ PyMuPDF fallback failed: {e}")
        return False


def fallback_parse_pdf_with_pypdf(pdf_path: Path, output_dir: Path) -> bool:
    """Lightweight fallback using pypdf when MinerU and PyMuPDF are unavailable."""
    print("⚠️  Falling back to lightweight PyPDF parser...")
    try:
        import pypdf

        reader = pypdf.PdfReader(str(pdf_path))
        parts: list[str] = []
        for i, page in enumerate(reader.pages):
            page_text = (page.extract_text() or "").strip()
            if page_text:
                parts.append(f"## Page {i + 1}\n\n{page_text}")

        if not parts:
            print("✗ PyPDF extracted no text")
            return False

        return _write_parsed_markdown(pdf_path, output_dir, "\n\n".join(parts))
    except Exception as e:
        print(f"✗ PyPDF fallback failed: {e}")
        return False


def fallback_parse_pdf_with_ocr(pdf_path: Path, output_dir: Path, max_pages: int = 30) -> bool:
    """OCR scanned/image-only PDFs when normal text extraction returns nothing."""
    from src.tools.question.pdf_ocr import extract_text_via_ocr

    print("⚠️  No text layer detected — starting OCR for scanned PDF...")
    text = extract_text_via_ocr(pdf_path, max_pages=max_pages)
    if not text or len(text.strip()) < 80:
        print(
            "✗ OCR could not extract enough text. "
            "Install Tesseract (`brew install tesseract`) and/or configure "
            "Google Vision (GOOGLE_APPLICATION_CREDENTIALS) or use a text-based PDF."
        )
        return False
    return _write_parsed_markdown(pdf_path, output_dir, text)


def fallback_parse_pdf(
    pdf_path: Path, output_dir: Path, *, ocr_max_pages: int = 30
) -> bool:
    """Try text extraction, then OCR for scanned PDFs."""
    if fallback_parse_pdf_with_pymupdf(pdf_path, output_dir):
        return True
    if fallback_parse_pdf_with_pypdf(pdf_path, output_dir):
        return True
    return fallback_parse_pdf_with_ocr(pdf_path, output_dir, max_pages=ocr_max_pages)


def parse_pdf_for_exam(
    pdf_path: str,
    output_base_dir: str | None = None,
    *,
    min_chars: int = 400,
    prefer_fast: bool = True,
    ocr_max_pages: int = 12,
) -> bool:
    """
    Parse an exam PDF for mimic mode.

    When prefer_fast is True (default), try PyMuPDF then OCR fallbacks and skip
    MinerU — saves ~1–2 minutes on scanned papers where MinerU often fails anyway.
    ocr_max_pages caps template OCR (pattern-only; default 12 pages).
    """
    pdf_path_obj = Path(pdf_path).resolve()
    if not pdf_path_obj.exists():
        print(f"✗ Error: PDF file does not exist: {pdf_path_obj}")
        return False

    project_root = Path(__file__).parent.parent.parent.parent
    output_base = Path(output_base_dir) if output_base_dir else project_root / "reference_papers"
    output_base.mkdir(parents=True, exist_ok=True)

    pdf_name = pdf_path_obj.stem
    output_dir = output_base / pdf_name

    if output_dir.exists():
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = output_base / f"{pdf_name}_backup_{timestamp}"
        print(f"⚠️ Directory already exists, backing up to: {backup_dir.name}")
        shutil.move(str(output_dir), str(backup_dir))

    print(f"📄 PDF file: {pdf_path_obj}")
    print(f"📁 Output directory: {output_dir}")

    if prefer_fast:
        print("→ Trying fast PyMuPDF extraction first...")
        if fallback_parse_pdf_with_pymupdf(pdf_path_obj, output_dir):
            auto_dir = output_dir / "auto"
            md_files = list(auto_dir.glob("*.md")) if auto_dir.exists() else []
            char_count = 0
            if md_files:
                char_count = len(md_files[0].read_text(encoding="utf-8").strip())
            if char_count >= min_chars:
                print(f"✓ Fast parse succeeded ({char_count} chars), skipping MinerU")
                return True
            print(
                f"⚠️ Fast parse returned only {char_count} chars; "
                "trying OCR fallbacks (skipping MinerU)..."
            )
            if output_dir.exists():
                shutil.rmtree(output_dir)

        print(
            f"→ Mimic fast path: OCR/text fallbacks only (max {ocr_max_pages} pages, no MinerU)"
        )
        return fallback_parse_pdf(pdf_path_obj, output_dir, ocr_max_pages=ocr_max_pages)

    return parse_pdf_with_mineru(str(pdf_path_obj), str(output_base))


def parse_pdf_with_mineru(pdf_path: str, output_base_dir: str = None):
    """
    Parse PDF file using MinerU

    Args:
        pdf_path: Path to PDF file
        output_base_dir: Base path for output directory, defaults to reference_papers

    Returns:
        bool: Whether parsing was successful
    """
    pdf_path = Path(pdf_path).resolve()
    if not pdf_path.exists():
        print(f"✗ Error: PDF file does not exist: {pdf_path}")
        return False

    if not pdf_path.suffix.lower() == ".pdf":
        print(f"✗ Error: File is not PDF format: {pdf_path}")
        return False

    # Project root is 3 levels up from src/tools/question/
    project_root = Path(__file__).parent.parent.parent.parent
    if output_base_dir is None:
        output_base_dir = project_root / "reference_papers"
    else:
        output_base_dir = Path(output_base_dir)

    output_base_dir.mkdir(parents=True, exist_ok=True)

    pdf_name = pdf_path.stem
    output_dir = output_base_dir / pdf_name

    if output_dir.exists():
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_dir = output_base_dir / f"{pdf_name}_backup_{timestamp}"
        print(f"⚠️ Directory already exists, backing up to: {backup_dir.name}")
        shutil.move(str(output_dir), str(backup_dir))

    print(f"📄 PDF file: {pdf_path}")
    print(f"📁 Output directory: {output_dir}")

    mineru_cmd = check_mineru_installed()
    if not mineru_cmd:
        print("✗ Warning: MinerU installation not detected. Using PDF text fallback.")
        return fallback_parse_pdf(pdf_path, output_dir)

    print(f"✓ Detected MinerU command: {mineru_cmd}")


    print("→ Starting parsing...")

    try:
        temp_output = output_base_dir / "temp_mineru_output"
        temp_output.mkdir(parents=True, exist_ok=True)

        cmd = [mineru_cmd, "-p", str(pdf_path), "-o", str(temp_output)]

        print(f"🔧 Executing command: {' '.join(cmd)}")

        result = subprocess.run(cmd, capture_output=True, text=True, check=False, shell=False)

        if result.returncode != 0:
            print("✗ MinerU parsing failed:")
            print(f"Stdout: {result.stdout}")
            print(f"Stderr: {result.stderr}")
            if temp_output.exists():
                shutil.rmtree(temp_output)
            return fallback_parse_pdf(pdf_path, output_dir)

        print("✓ MinerU parsing completed!")

        generated_folders = list(temp_output.iterdir())

        if not generated_folders:
            print("⚠️ Warning: No generated files found in temp directory")
            if temp_output.exists():
                shutil.rmtree(temp_output)
            return fallback_parse_pdf(pdf_path, output_dir)

        source_folder = generated_folders[0] if generated_folders[0].is_dir() else temp_output

        # Create target directory and move content
        output_dir.mkdir(parents=True, exist_ok=True)

        # Move MinerU-generated content to target directory
        if source_folder.exists() and source_folder.is_dir():
            # If source_folder is the PDF-named directory, move its contents
            for item in source_folder.iterdir():
                dest_item = output_dir / item.name
                if dest_item.exists():
                    if dest_item.is_dir():
                        shutil.rmtree(dest_item)
                    else:
                        dest_item.unlink()
                shutil.move(str(item), str(dest_item))
            print(f"📦 Files saved to: {output_dir}")
        else:
            if output_dir.exists():
                shutil.rmtree(output_dir)
            shutil.move(str(source_folder), str(output_dir))
            print(f"📦 Files saved to: {output_dir}")

        if temp_output.exists():
            shutil.rmtree(temp_output)

        print("\n📋 Generated files:")
        for item in output_dir.rglob("*"):
            if item.is_file():
                rel_path = item.relative_to(output_dir)
                print(f"  - {rel_path}")

        return True

    except Exception as e:
        print(f"✗ Error occurred during parsing: {e!s}")
        import traceback

        traceback.print_exc()
        return False


def main():
    """Main function"""
    parser = argparse.ArgumentParser(
        description="Parse PDF files using MinerU and save results to reference_papers directory",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Parse a single PDF file
  python pdf_parser.py /path/to/paper.pdf

  # Parse PDF and specify output directory
  python pdf_parser.py /path/to/paper.pdf -o /custom/output/dir
        """,
    )

    parser.add_argument("pdf_path", type=str, help="Path to PDF file")

    parser.add_argument(
        "-o",
        "--output",
        type=str,
        default=None,
        help="Base path for output directory (default: reference_papers)",
    )

    args = parser.parse_args()

    success = parse_pdf_with_mineru(args.pdf_path, args.output)

    if success:
        print("\n✓ Parsing completed!")
        sys.exit(0)
    else:
        print("\n✗ Parsing failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
