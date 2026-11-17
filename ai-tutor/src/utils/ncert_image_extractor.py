import os
import base64
from pathlib import Path
from typing import List, Optional
import fitz  # PyMuPDF
from src.app_logging import get_logger

logger = get_logger("NCERTImageExtractor")


def _normalize_snippet(text: str) -> str:
    """Normalize text snippet for better matching."""
    return " ".join(text.replace("\n", " ").split())


def _find_pdf_path(pdf_file_name: str, project_root: Path) -> Optional[Path]:
    """Recursively find PDF in known search directories."""
    search_dirs = [
        project_root / "web" / "public" / "ncert",
        project_root / "ncert_source",
    ]
    for search_dir in search_dirs:
        for root, _, files in os.walk(search_dir):
            if pdf_file_name in files:
                return Path(root) / pdf_file_name
    return None


def extract_relevant_image_from_pdf(
    pdf_file_name: str, text_snippet: str, project_root: Path
) -> List[str]:
    """
    Finds pages containing `text_snippet` in the PDF, then extracts
    all meaningful image objects on those pages as browser-compatible PNGs.

    Returns a list of base64 data URIs.
    """
    if not pdf_file_name.lower().endswith(".pdf"):
        return []

    pdf_path = _find_pdf_path(pdf_file_name, project_root)
    if not pdf_path:
        logger.warning(f"PDF not found for image extraction: {pdf_file_name}")
        return []

    try:
        doc = fitz.open(pdf_path)
        
        # Build search key
        norm_snippet = _normalize_snippet(text_snippet)
        search_text = norm_snippet[:100] if len(norm_snippet) > 100 else norm_snippet

        # 1. Find matching pages (check all occurrences, and include next page for each)
        target_pages = []
        for page_num in range(len(doc)):
            page_text = _normalize_snippet(doc[page_num].get_text())
            if search_text in page_text or search_text[:40] in page_text:
                if page_num not in target_pages:
                    target_pages.append(page_num)
                # Diagrams often appear on the same or immediate next page
                if page_num + 1 < len(doc) and (page_num + 1) not in target_pages:
                    target_pages.append(page_num + 1)
                
                # If we have enough pages, or the snippet is small, we could limit
                # but for now we scan everything relevant to be "complete"

        if not target_pages:
            doc.close()
            return []

        data_uris = []
        seen_xrefs = set()

        for page_num in target_pages:
            page = doc[page_num]
            page_rect = page.rect
            
            # Find the location of the text match to prioritize nearby images
            text_instances = page.search_for(search_text)
            text_rect = text_instances[0] if text_instances else None
            
            image_list = page.get_images(full=True)
            if not image_list:
                continue

            # Get bbox info and calculate distance to text
            image_infos = page.get_image_info(xrefs=True)
            xref_to_info = {info['xref']: info for info in image_infos if 'xref' in info}

            def get_relevance_score(img_tuple):
                xref = img_tuple[0]
                info = xref_to_info.get(xref)
                if not info: return 9999
                
                bbox = info['bbox']
                
                # Heuristic 1: Avoid headers/footers/QR codes (top 12% or bottom 8% of page)
                if bbox[1] < page_rect.height * 0.12 or bbox[3] > page_rect.height * 0.92:
                    # NCERT QR codes are usually at the very top
                    return 8000 + bbox[1] 

                # Heuristic 2: Distance to matching text
                if text_rect:
                    # Calculate center-to-center distance
                    img_center = ((bbox[0]+bbox[2])/2, (bbox[1]+bbox[3])/2)
                    text_center = ((text_rect[0]+text_rect[2])/2, (text_rect[1]+text_rect[3])/2)
                    dist = ((img_center[0]-text_center[0])**2 + (img_center[1]-text_center[1])**2)**0.5
                    return dist
                
                return bbox[1] # Fallback to top-to-bottom
            
            # Sort by relevance score (lowest is best/closest)
            image_list.sort(key=get_relevance_score)

            for img in image_list:
                xref = img[0]
                if xref in seen_xrefs:
                    continue
                
                info = xref_to_info.get(xref)
                if info:
                    bbox = info['bbox']
                    # Strict QR code filter: Square-ish images at the very top
                    aspect = (bbox[2]-bbox[0]) / (bbox[3]-bbox[1]) if (bbox[3]-bbox[1]) > 0 else 0
                    if 0.8 < aspect < 1.2 and bbox[1] < page_rect.height * 0.15:
                        continue # Likely a QR code
                
                seen_xrefs.add(xref)

                try:
                    # Extract as Pixmap
                    pix = fitz.Pixmap(doc, xref)
                    
                    # Aggressive shrinking for stability
                    while pix.width > 600 or pix.height > 600:
                        pix.shrink(2)
                    
                    # Filter by dimensions (skip tiny icons/dividers)
                    if pix.width < 60 or pix.height < 60:
                        continue
                    
                    # Skip full-page background scans or large overlays
                    if pix.width > 1200 or pix.height > 1600:
                        continue

                    # Force 3-channel RGB (ensures browser compatibility)
                    if pix.n != 3:
                        pix = fitz.Pixmap(fitz.csRGB, pix)
                    
                    # Convert to PNG
                    img_bytes = pix.tobytes("png")
                    b64 = base64.b64encode(img_bytes).decode("utf-8")
                    
                    # Safety cap on string length per image (~150KB)
                    # Also skip "junk" images that are too small to be real diagrams (< 3KB)
                    if len(b64) > 200000 or len(b64) < 3000:
                        continue

                    data_uris.append(f"data:image/png;base64,{b64}")
                    logger.info(f"Extracted image {xref} from p{page_num}: {pix.width}x{pix.height}, {len(b64)} chars (Relevance score: {get_relevance_score(img)})")
                    
                    pix = None
                    if len(data_uris) >= 15: 
                        break

                except Exception as e:
                    logger.debug(f"Failed to extract xref {xref}: {e}")
                    continue
            
            if len(data_uris) >= 15:
                break

        doc.close()
        return data_uris

    except Exception as e:
        logger.error(f"Error in image extraction: {e}", exc_info=True)
        return []


# Maintain other helper functions if they are used elsewhere
def extract_all_images_from_pdf(pdf_file_name: str, project_root: Path) -> List[str]:
    """Legacy/Utility function to get all images from a PDF."""
    pdf_path = _find_pdf_path(pdf_file_name, project_root)
    if not pdf_path: return []
    try:
        doc = fitz.open(pdf_path)
        all_uris = []
        for i in range(len(doc)):
            # We don't have a snippet here, so we just use a dummy one
            all_uris.extend(extract_relevant_image_from_pdf(pdf_file_name, "DUMMY", project_root))
        doc.close()
        return all_uris
    except: return []