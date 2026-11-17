"""
Chat API Router
================

WebSocket endpoint for lightweight chat with session management.
REST endpoints for session operations.
"""

from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

import tempfile
import uuid

from fastapi import APIRouter, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect

_project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(_project_root))

from src.agents.chat import ChatAgent, SessionManager
from src.app_logging import get_logger
from src.services.config import load_config_with_main
from src.services.llm.config import get_llm_config
from src.services.settings.interface_settings import get_ui_language


# Initialize logger
project_root = Path(__file__).parent.parent.parent.parent
config = load_config_with_main("solve_config.yaml", project_root)
log_dir = config.get("paths", {}).get("user_log_dir") or config.get("logging", {}).get("log_dir")
logger = get_logger("ChatAPI", level="INFO", log_dir=log_dir)

router = APIRouter()

# Initialize session manager
session_manager = SessionManager()

# Max characters from a selected PDF to send to the model (after smart windowing)
_PDF_EXCERPT_MAX_CHARS = 300_000
# Safety cap on pages to read from disk per request
_PDF_MAX_PAGES = 500

# Cache for PDF text to avoid redundant downloads/parsing
_pdf_text_cache: dict[str, str] = {}


def _fetch_pdf_bytes(url: str, timeout: int = 120) -> bytes:
    """Download PDF bytes from an http(s) URL (e.g. Azure Blob manifest links)."""
    req = Request(
        url,
        headers={"User-Agent": "Mozilla/5.0 (compatible; LearningBix-ChatBackend/1.0)"},
    )
    with urlopen(req, timeout=timeout) as resp:
        return resp.read()


def _fitz_document_to_text(doc) -> str:
    try:
        chunks: list[str] = []
        for i, page in enumerate(doc):
            if i >= _PDF_MAX_PAGES:
                break
            chunks.append(page.get_text())
        return "\n\n".join(chunks)
    finally:
        doc.close()


def _build_pdf_excerpt(full_text: str, user_message: str, max_chars: int) -> str:
    """
    Prefer a window around specific query terms; otherwise head+tail.
    Avoid anchoring on extremely common words like 'chapter' or 'ncert' which appear on page 1.
    """
    if len(full_text) <= max_chars:
        return full_text
    
    msg = user_message or ""
    text_lower = full_text.lower()
    
    # Exclude common stop words that cause early anchoring at the beginning of textbooks
    STOP_WORDS = {"chapter", "ncert", "class", "subject", "page", "book", "exercise", "solution", "class-", "ncert-"}
    
    # 1. Try to find specific topic words
    words = sorted(
        {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9+]{3,}", msg) if w.lower() not in STOP_WORDS},
        key=len,
        reverse=True,
    )
    
    # 2. Also try quoted phrases (e.g. 'PAIR OF LINEAR EQUATIONS')
    phrases = []
    for m in re.findall(r"'([^']{8,})'|\"([^\"]{8,})\"", msg):
        phrase = (m[0] or m[1] or "").strip().lower()
        if len(phrase) >= 8:
            phrases.append(phrase)
    
    # Priority: Phrases > Specific Words > Fallback to all words
    search_terms = phrases + words
    if not search_terms:
        search_terms = sorted(
            {w.lower() for w in re.findall(r"[A-Za-z][A-Za-z0-9+]{3,}", msg)},
            key=len,
            reverse=True,
        )
    
    best_idx = -1
    for w in search_terms:
        if len(w) < 4 and w not in phrases:
            continue
        idx = text_lower.find(w)
        if idx != -1:
            best_idx = idx
            break
            
    if best_idx == -1:
        # Fallback: take head and tail
        half = max_chars // 2
        return (
            full_text[:half]
            + "\n\n[... document middle omitted for length ...]\n\n"
            + full_text[-half:]
        )
    
    # Found a match. Include a small prefix (10k) from the start of the book for context
    # if our window starts much later.
    prefix_size = 10000
    prefix = ""
    if best_idx > max_chars:
        prefix = full_text[:prefix_size] + "\n\n[... content omitted ...]\n\n"
        # Adjust window size to accommodate prefix
        max_chars = max(20000, max_chars - len(prefix))

    start = max(0, best_idx - max_chars // 2)
    end = min(len(full_text), start + max_chars)
    start = max(0, end - max_chars)
    
    return prefix + full_text[start:end]


def _inject_pdf_context(
    history: list[dict],
    pdf_url: str,
    user_message: str,
    *,
    label: str = "SELECTED PDF",
) -> None:
    """Fetch PDF from https URL and prepend excerpt as a system message."""
    try:
        fetch_url = str(pdf_url).strip()
        if not fetch_url:
            return
        full_text = ""
        pdf_filename = ""
        pdf_source_log = ""

        if fetch_url.startswith(("http://", "https://")):
            path_part = unquote((urlparse(fetch_url).path or "").strip())
            pdf_filename = Path(path_part).name or "document.pdf"
            pdf_source_log = fetch_url
            if fetch_url in _pdf_text_cache:
                full_text = _pdf_text_cache[fetch_url]
                logger.info(f"Loaded PDF from cache for excerpt: {pdf_filename}")
            else:
                try:
                    import fitz  # PyMuPDF

                    blob = _fetch_pdf_bytes(fetch_url)
                    doc = fitz.open(stream=blob, filetype="pdf")
                    full_text = _fitz_document_to_text(doc)
                    if full_text:
                        _pdf_text_cache[fetch_url] = full_text
                    logger.info(
                        f"Loaded PDF from blob ({len(blob)} bytes) for excerpt: {pdf_filename}"
                    )
                except Exception as e:
                    logger.warning(
                        f"Failed to fetch or parse PDF from blob URL {fetch_url}: {e}"
                    )
                    full_text = ""
        else:
            preview = fetch_url[:120] + ("..." if len(fetch_url) > 120 else "")
            logger.warning(
                "PDF excerpt skipped: expected absolute https blob URL; "
                f"local paths are not used (got: {preview})"
            )

        if full_text:
            excerpt = _build_pdf_excerpt(full_text, user_message, _PDF_EXCERPT_MAX_CHARS)
            history.insert(
                0,
                {
                    "role": "system",
                    "content": (
                        f"CONTEXT FROM {label} ({pdf_filename}):\n"
                        f"URL: {pdf_url}\n"
                        "--- START PDF CONTENT ---\n"
                        f"{excerpt}\n"
                        "--- END PDF CONTENT ---\n"
                        "Please prioritize this content when the user asks about the selected document."
                    ),
                },
            )
            logger.info(
                f"Injected PDF excerpt ({len(excerpt)} chars) from {pdf_source_log} into history"
            )
        elif fetch_url.startswith(("http://", "https://")):
            logger.warning(
                f"No PDF excerpt injected (blob fetch or parse produced no text): {fetch_url}"
            )
    except Exception as e:
        logger.warning(f"Failed to extract PDF text for {pdf_url}: {e}")


# =============================================================================
# REST Endpoints for Session Management
# =============================================================================


@router.get("/chat/sessions")
async def list_sessions(limit: int = 20):
    """
    List recent chat sessions.

    Args:
        limit: Maximum number of sessions to return

    Returns:
        List of session summaries
    """
    return session_manager.list_sessions(limit=limit, include_messages=False)


@router.get("/chat/sessions/{session_id}")
async def get_session(session_id: str):
    """
    Get a specific chat session with full message history.

    Args:
        session_id: Session identifier

    Returns:
        Complete session data including messages
    """
    session = session_manager.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


@router.delete("/chat/sessions/{session_id}")
async def delete_session(session_id: str):
    """
    Delete a chat session.

    Args:
        session_id: Session identifier

    Returns:
        Success message
    """
    if session_manager.delete_session(session_id):
        return {"status": "deleted", "session_id": session_id}
    raise HTTPException(status_code=404, detail="Session not found")


@router.post("/chat/upload-attachment")
async def upload_chat_attachment(file: UploadFile = File(...)):
    """
    Upload a PDF, image, or document for chat context.
    Returns a public blob URL when Azure is configured.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename required")

    raw_name = Path(file.filename).name
    suffix = Path(raw_name).suffix.lower()
    allowed = {
        ".pdf",
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".gif",
        ".doc",
        ".docx",
        ".txt",
    }
    if suffix not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Allowed: {', '.join(sorted(allowed))}",
        )

    body = await file.read()
    if not body:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(body) > 25 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 25MB)")

    safe_name = re.sub(r"[^\w.\-]", "_", raw_name)[:120] or "upload"
    unique = f"{uuid.uuid4().hex[:10]}_{safe_name}"

    kind = "pdf" if suffix == ".pdf" else "image" if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif"} else "document"

    from src.services.storage.azure_kb_blob import upload_file_to_blob

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(body)
        tmp_path = Path(tmp.name)

    try:
        url = upload_file_to_blob(tmp_path, "chat-attachments", unique)
    finally:
        try:
            tmp_path.unlink(missing_ok=True)
        except Exception:
            pass

    if not url:
        raise HTTPException(
            status_code=503,
            detail="File storage is not configured. Set Azure Blob credentials in .env",
        )

    return {"url": url, "filename": safe_name, "kind": kind}


# =============================================================================
# WebSocket Endpoint for Chat
# =============================================================================


@router.websocket("/chat")
async def websocket_chat(websocket: WebSocket):
    """
    WebSocket endpoint for chat with session and context management.

    Message format:
    {
        "message": str,              # User message
        "session_id": str | null,    # Session ID (null for new session)
        "history": [...] | null,     # Optional: explicit history override
        "kb_name": str,              # Knowledge base name (for RAG)
        "enable_rag": bool,          # Enable RAG retrieval
        "enable_web_search": bool,   # Enable Web Search
        "enable_thinking": bool      # Step-by-step reasoning mode (optional, default false)
    }

    Response format:
    - {"type": "session", "session_id": str}           # Session ID (new or existing)
    - {"type": "status", "stage": str, "message": str} # Status updates
    - {"type": "thinking_phase", "phase": str, "status": str} # Thinking mode: pipeline phases (active|done)
    - {"type": "stream", "content": str}               # Streaming response chunks
    - {"type": "sources", "rag": list, "web": list, "videos": list}  # Citations (videos often YouTube when using Tavily)
    - {"type": "result", "content": str}               # Final complete response
    - {"type": "error", "message": str}                # Error message
    """
    await websocket.accept()

    try:
        while True:
            # Receive message
            data = await websocket.receive_json()
            # Use current UI language (fallback to config/main.yaml system.language)
            language = get_ui_language(default=config.get("system", {}).get("language", "en"))
            message = data.get("message", "").strip()
            session_id = data.get("session_id")
            explicit_history = data.get("history")  # Optional override
            kb_name = data.get("kb_name", "")
            enable_rag = data.get("enable_rag", False)
            enable_web_search = data.get("enable_web_search", False)
            enable_thinking = bool(data.get("enable_thinking", False))
            # Persist General mode for session restore; optional field for older clients
            if "enable_general" in data:
                enable_general_saved = bool(data.get("enable_general"))
            else:
                enable_general_saved = (
                    not enable_rag and not enable_web_search and not enable_thinking
                )

            if not message:
                await websocket.send_json({"type": "error", "message": "Message is required"})
                continue

            logger.info(
                f"Chat request: session={session_id}, "
                f"message={message[:50]}..., rag={enable_rag}, web={enable_web_search}, "
                f"thinking={enable_thinking}, general={enable_general_saved}"
            )

            chat_settings = {
                "kb_name": kb_name,
                "enable_rag": enable_rag,
                "enable_web_search": enable_web_search,
                "enable_thinking": enable_thinking,
                "enable_general": enable_general_saved,
            }

            try:
                # Get or create session
                if session_id:
                    session = session_manager.get_session(session_id)
                    if not session:
                        # Session not found, create new one
                        session = session_manager.create_session(
                            title=message[:50] + ("..." if len(message) > 50 else ""),
                            settings=chat_settings,
                        )
                        session_id = session["session_id"]
                else:
                    # Create new session
                    session = session_manager.create_session(
                        title=message[:50] + ("..." if len(message) > 50 else ""),
                        settings=chat_settings,
                    )
                    session_id = session["session_id"]

                # Merge settings so mid-chat mode switches persist for History reload
                merged_settings = {**(session.get("settings") or {}), **chat_settings}
                session_manager.update_session(session_id, settings=merged_settings)
                session = session_manager.get_session(session_id) or session

                # Send session ID to frontend
                await websocket.send_json(
                    {
                        "type": "session",
                        "session_id": session_id,
                    }
                )

                # Build history from session or explicit override
                if explicit_history is not None:
                    history = explicit_history
                else:
                    # Get history from session messages
                    history = [
                        {"role": msg["role"], "content": msg["content"]}
                        for msg in session.get("messages", [])
                    ]

                # PDF-RAG: chapter/source PDF + optional user-uploaded PDFs (blob URLs only).
                pdf_url = data.get("pdf_url") or data.get("pdf")
                if pdf_url:
                    _inject_pdf_context(
                        history, str(pdf_url), message, label="SELECTED PDF"
                    )

                extra_pdfs = data.get("extra_pdf_urls") or []
                if isinstance(extra_pdfs, list):
                    for i, extra in enumerate(extra_pdfs):
                        if extra and str(extra).strip():
                            _inject_pdf_context(
                                history,
                                str(extra).strip(),
                                message,
                                label=f"ATTACHED PDF {i + 1}",
                            )

                has_pdf_context = any(
                    m.get("role") == "system" and "CONTEXT FROM SELECTED PDF" in m.get("content", "")
                    for m in history
                )

                # Add user message to session
                session_manager.add_message(
                    session_id=session_id,
                    role="user",
                    content=message,
                )

                # Initialize ChatAgent
                try:
                    llm_config = get_llm_config()
                    api_key = llm_config.api_key
                    base_url = llm_config.base_url
                    api_version = getattr(llm_config, "api_version", None)
                except Exception:
                    api_key = None
                    base_url = None
                    api_version = None

                agent = ChatAgent(
                    language=language,
                    config=config,
                    api_key=api_key,
                    base_url=base_url,
                    api_version=api_version,
                )

                # Status updates (normal mode). Thinking mode uses `thinking_phase` from the agent instead.
                if not enable_thinking:
                    if enable_rag and kb_name:
                        await websocket.send_json(
                            {
                                "type": "status",
                                "stage": "rag",
                                "message": f"Searching knowledge base: {kb_name}...",
                            }
                        )

                    if enable_web_search:
                        await websocket.send_json(
                            {
                                "type": "status",
                                "stage": "web",
                                "message": "Searching the web...",
                            }
                        )

                    is_general_mode = not enable_rag and not enable_web_search
                    generating_msg = "Generating answer..." if is_general_mode else "Generating response..."
                    await websocket.send_json(
                        {
                            "type": "status",
                            "stage": "generating",
                            "message": generating_msg,
                        }
                    )

                # Process with streaming
                full_response = ""
                sources = {"rag": [], "web": [], "videos": []}
                suggest_websearch = False

                stream_generator = await agent.process(
                    message=message,
                    history=history,
                    kb_name=kb_name,
                    enable_rag=enable_rag,
                    enable_web_search=enable_web_search,
                    enable_thinking=enable_thinking,
                    stream=True,
                    has_pdf_context=has_pdf_context,
                    pdf_url=pdf_url,
                )

                async for chunk_data in stream_generator:
                    if chunk_data["type"] == "thinking_phase":
                        await websocket.send_json(
                            {
                                "type": "thinking_phase",
                                "phase": chunk_data["phase"],
                                "status": chunk_data["status"],
                            }
                        )
                    elif chunk_data["type"] == "chunk":
                        await websocket.send_json(
                            {
                                "type": "stream",
                                "content": chunk_data["content"],
                            }
                        )
                        full_response += chunk_data["content"]
                    elif chunk_data["type"] == "complete":
                        full_response = chunk_data["response"]
                        sources = chunk_data.get("sources", {"rag": [], "web": []})
                        suggest_websearch = bool(chunk_data.get("suggest_websearch"))
                    elif chunk_data["type"] == "related_diagram":
                        mermaid_src = (chunk_data.get("mermaid") or "").strip()
                        if mermaid_src:
                            await websocket.send_json(
                                {
                                    "type": "related_diagram",
                                    "mermaid": mermaid_src,
                                    "title": chunk_data.get("title") or "",
                                }
                            )
                    elif chunk_data["type"] == "images":
                        # Web images searched from AI response keywords — forward to frontend
                        images = chunk_data.get("images", [])
                        if images:
                            logger.info(
                                f"[ImagePipeline] Sending {len(images)} web image(s) to frontend"
                            )
                            print(f"\n📤 Sending {len(images)} image(s) to frontend via WebSocket")
                            await websocket.send_json({"type": "images", "images": images})
                    elif chunk_data["type"] == "composed_content":
                        # Final content with inline images — replaces streamed text
                        composed_content = chunk_data["content"]
                        images = chunk_data.get("images", [])
                        
                        logger.info(f"[ImagePipeline] Sending composed content with {len(images)} inline image(s)")
                        await websocket.send_json({
                            "type": "composed_content",
                            "content": composed_content,
                            "images": images,
                        })
                        # Update the full response to be saved in history
                        full_response = composed_content

                # Send sources if any
                if sources.get("rag") or sources.get("web") or sources.get("videos"):
                    await websocket.send_json({"type": "sources", **sources})

                # Send final result
                await websocket.send_json(
                    {
                        "type": "result",
                        "content": full_response,
                        "suggest_websearch": suggest_websearch,
                    }
                )


                # Save assistant message to session
                session_manager.add_message(
                    session_id=session_id,
                    role="assistant",
                    content=full_response,
                    sources=sources if (sources.get("rag") or sources.get("web")) else None,
                    is_thinking=enable_thinking,
                )

                logger.info(f"Chat completed: session={session_id}, {len(full_response)} chars")
                break # Exit the while loop to close this session
            except Exception as e:
                logger.error(f"Chat processing error: {e}")
                await websocket.send_json({"type": "error", "message": str(e)})

    except WebSocketDisconnect:
        logger.debug("Client disconnected from chat")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
