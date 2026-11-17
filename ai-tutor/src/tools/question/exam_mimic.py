#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Reference-based exam-question generation system

Workflow:
1. Parse the PDF exam (MinerU)
2. Extract question information (LLM)
3. Generate new questions per reference question (Agent)
"""

from __future__ import annotations

import asyncio
from datetime import datetime
import hashlib
import json
import os
import shutil
from pathlib import Path
import sys
import time
from typing import TYPE_CHECKING, Any, Callable

if TYPE_CHECKING:
    from src.agents.question import AgentCoordinator

# Project root is 3 levels up from src/tools/question/
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))

# Note: AgentCoordinator is imported inside functions to avoid circular import
from src.services.llm.config import get_llm_config
from src.tools.question.pdf_parser import (
    fallback_parse_pdf_with_ocr,
    fallback_parse_pdf_with_pymupdf,
    parse_pdf_for_exam,
)
from src.tools.question.question_extractor import (
    extract_questions_from_paper,
    load_parsed_paper,
)

# Type alias for WebSocket callback
WsCallback = Callable[[str, dict[str, Any]], Any]

MIN_MARKDOWN_CHARS = 400
MIMIC_CACHE_ROOT = project_root / "data" / "user" / "question" / "mimic_cache"


def _pdf_content_hash(pdf_path: Path) -> str:
    digest = hashlib.sha256()
    with open(pdf_path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return digest.hexdigest()[:20]


def _find_cached_questions_json(paper_dir: Path) -> Path | None:
    json_files = sorted(
        paper_dir.glob("*_questions.json"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return json_files[0] if json_files else None


def _try_restore_mimic_cache(pdf_path: Path, output_base: Path) -> Path | None:
    """Reuse parsed markdown + extracted questions for the same PDF bytes."""
    try:
        pdf_hash = _pdf_content_hash(pdf_path)
    except OSError:
        return None

    cache_dir = MIMIC_CACHE_ROOT / pdf_hash
    if not cache_dir.exists():
        return None

    auto = cache_dir / "auto"
    if not auto.exists() or not list(auto.glob("*.md")):
        return None

    if not _find_cached_questions_json(cache_dir):
        return None

    stem = pdf_path.stem
    dest = output_base / stem
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(cache_dir, dest)
    print(f"✓ Reusing cached parse/extract for this PDF (hash {pdf_hash[:12]}…)")
    return dest


def _save_mimic_cache(paper_dir: Path, pdf_path: Path | None) -> None:
    """Persist parsed folder for faster re-runs of the same exam PDF."""
    if not pdf_path:
        return
    try:
        pdf_hash = _pdf_content_hash(Path(pdf_path))
    except OSError:
        return

    cache_dir = MIMIC_CACHE_ROOT / pdf_hash
    cache_dir.parent.mkdir(parents=True, exist_ok=True)
    if cache_dir.exists():
        shutil.rmtree(cache_dir)
    shutil.copytree(paper_dir, cache_dir)
    print(f"💾 Cached parse/extract for future runs (hash {pdf_hash[:12]}…)")


def resolve_parsed_paper_dir(output_base: Path, pdf_path: str | None = None) -> Path | None:
    """Pick the parsed exam folder (must contain auto/*.md)."""
    if pdf_path:
        stem = Path(pdf_path).stem
        candidate = output_base / stem
        auto = candidate / "auto"
        if auto.exists() and list(auto.glob("*.md")):
            return candidate

    candidates: list[Path] = []
    for d in output_base.iterdir():
        if not d.is_dir() or d.name.startswith("temp_"):
            continue
        auto = d / "auto"
        if auto.exists() and list(auto.glob("*.md")):
            candidates.append(d)

    if not candidates:
        return None

    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def ensure_sufficient_parsed_text(paper_dir: Path, pdf_path: str | None) -> bool:
    """Re-extract with PyMuPDF or OCR if parsed markdown is too short."""
    markdown, _, _ = load_parsed_paper(paper_dir)
    if markdown and len(markdown.strip()) >= MIN_MARKDOWN_CHARS:
        return True

    if not pdf_path:
        return bool(markdown and markdown.strip())

    resolved_pdf = Path(pdf_path).resolve()
    char_count = len((markdown or "").strip())
    print(
        f"⚠️ Parsed text is short ({char_count} chars); "
        "re-extracting (PyMuPDF → OCR)..."
    )

    if fallback_parse_pdf_with_pymupdf(resolved_pdf, paper_dir):
        markdown, _, _ = load_parsed_paper(paper_dir)
        if markdown and len(markdown.strip()) >= MIN_MARKDOWN_CHARS:
            return True

    if fallback_parse_pdf_with_ocr(resolved_pdf, paper_dir):
        markdown, _, _ = load_parsed_paper(paper_dir)
        return bool(markdown and len(markdown.strip()) >= 80)

    return bool(markdown and len(markdown.strip()) >= 80)


def _build_mimic_generation_plan(
    reference_questions: list[dict[str, Any]],
    target_count: int,
) -> list[dict[str, Any]]:
    """Build output slots by cycling template references until target_count is reached."""
    if target_count <= 0 or not reference_questions:
        return []

    plan: list[dict[str, Any]] = []
    n_refs = len(reference_questions)
    for out_idx in range(1, target_count + 1):
        ref = reference_questions[(out_idx - 1) % n_refs]
        cycle = (out_idx - 1) // n_refs + 1
        plan.append(
            {
                "ref_question": ref,
                "output_index": out_idx,
                "variant_cycle": cycle,
            }
        )
    return plan


def _build_mimic_batch_requirement(
    reference_questions: list[dict[str, Any]],
    kb_name: str | None,
) -> dict[str, Any]:
    """Build retrieval requirement: NCERT chapter content + template style hints."""
    previews: list[str] = []
    for i, question in enumerate(reference_questions[:10], start=1):
        text = str(question.get("question_text", "")).strip()
        if text:
            previews.append(f"{i}. {text[:120]}")

    style_block = (
        "\n".join(previews)
        if previews
        else "General exam question patterns (MCQ / short / long answer mix)."
    )

    return {
        "knowledge_point": kb_name or "NCERT chapter",
        "difficulty": "medium",
        "question_type": "written",
        "additional_requirements": (
            "Retrieve comprehensive knowledge from the selected NCERT chapter and "
            "knowledge base to generate new exam questions.\n\n"
            "IMPORTANT: The uploaded exam paper is ONLY a format/pattern template "
            "(question type, structure, difficulty). All facts, concepts, and answers "
            "must come from the NCERT chapter context — not from the template paper's subject.\n\n"
            "Template style hints (format only):\n"
            + style_block
        ),
    }


def _build_mimic_reference_requirement(
    reference_question: dict[str, Any],
    kb_name: str,
    style_hint: str | None = None,
) -> dict[str, Any]:
    """Build generation requirement for one mimic reference question."""
    extra = (
        "Reference question (PATTERN / FORMAT TEMPLATE ONLY — do not reuse its subject, "
        "facts, or domain; match question type, structure, and difficulty only):\n"
        f"{reference_question['question_text']}\n\n"
        "Requirements:\n"
        "1. Match the reference's question TYPE and STRUCTURE (MCQ vs written, parts, difficulty).\n"
        "2. **All concepts, facts, scenarios, and answers MUST come from the Background Knowledge "
        "(selected NCERT chapter) — never from the template paper's content.**\n"
        "3. **Change the scenario/objects; do not simply replace numbers or symbols.**\n"
        "4. **Alter at least one part of the reasoning process or add a new sub-question.**\n"
        "5. Ensure the prompt is rigorous, precise, and self-contained within the NCERT chapter scope.\n"
        "6. If the template references images, describe any needed visuals in text.\n"
        "7. Rejection is forbidden—you must complete the generation task.\n"
        "8. Write marks clearly as 'N Marks' (e.g. '2 Marks', '10 Marks') — not 'N M' or slash-only like '5/6/1'.\n\n"
        "Chain-of-thought guidance:\n"
        "- Plan the new scenario using NCERT chapter knowledge, shaped by the template format.\n"
        "- Do not reveal your reasoning; output only the final JSON."
    )
    if style_hint and style_hint.strip():
        extra += f"\n\nUser generation preference:\n{style_hint.strip()}"

    return {
        "reference_question": reference_question["question_text"],
        "has_images": len(reference_question.get("images", [])) > 0,
        "kb_name": kb_name,
        "allow_reject": False,
        "additional_requirements": extra,
    }


async def generate_question_from_reference(
    reference_question: dict[str, Any],
    coordinator: AgentCoordinator,
    kb_name: str,
    knowledge_context: str | None = None,
) -> dict[str, Any]:
    """
    Generate a new question based on a reference entry.
    """
    # Build generation requirement that encodes the reference
    requirement = _build_mimic_reference_requirement(reference_question, kb_name)

    # Trigger generation through the coordinator
    if knowledge_context:
        result = await coordinator.generate_question_with_knowledge(
            requirement,
            knowledge_context,
            save_result=False,
        )
    else:
        result = await coordinator.generate_question(requirement)

    return result


async def mimic_exam_questions(
    pdf_path: str | None = None,
    paper_dir: str | None = None,
    kb_name: str = None,
    output_dir: str | None = None,
    pdf_url: str | None = None,
    max_questions: int | None = None,
    style_hint: str | None = None,
    ws_callback: WsCallback | None = None,
) -> dict[str, Any]:
    """
    End-to-end orchestration for reference-based question generation.

    Args:
        pdf_path: Path to the PDF exam paper
        paper_dir: Path to a pre-parsed exam directory
        kb_name: Knowledge base name to use
        output_dir: Output directory for generated questions
        max_questions: Maximum number of questions to process
        ws_callback: Optional async callback for WebSocket progress updates
                     Signature: async def callback(event_type: str, data: dict)
    """

    async def send_progress(event_type: str, data: dict[str, Any]):
        """Helper to send progress updates via WebSocket callback."""
        if ws_callback:
            try:
                await ws_callback(event_type, data)
            except Exception as e:
                print(f"WebSocket callback error: {e}")

    print("=" * 80)
    print("📚 Reference-based question generation system")
    print("=" * 80)
    print()

    run_started = time.perf_counter()
    stage_times: dict[str, float] = {}

    # Validate arguments
    if not pdf_path and not paper_dir:
        await send_progress("error", {"content": "Either pdf_path or paper_dir must be provided."})
        return {"success": False, "error": "Either pdf_path or paper_dir must be provided."}

    if pdf_path and paper_dir:
        await send_progress("error", {"content": "pdf_path and paper_dir cannot be used together."})
        return {
            "success": False,
            "error": "pdf_path and paper_dir cannot be used together. Choose only one.",
        }

    latest_dir = None

    # If an already parsed exam directory is provided
    if paper_dir:
        await send_progress(
            "progress",
            {
                "stage": "parsing",
                "status": "locating",
                "message": "Locating parsed exam directory...",
            },
        )

        print("🔍 Using parsed exam directory")
        print("-" * 80)

        # Resolve relative names against reference_papers
        # SECURITY FIX: Prevent Path Injection / Traversal
        if os.path.isabs(paper_dir) or ".." in paper_dir:
            error_msg = (
                f"Invalid paper_dir: Absolute paths and traversal are not allowed. ({paper_dir})"
            )
            await send_progress("error", {"content": error_msg})
            return {"success": False, "error": error_msg}

        mimic_root = (
            project_root / "data" / "user" / "question" / "mimic_papers"
        )
        paper_path = Path(paper_dir)

        # Candidate locations to search (including new location)
        possible_paths = [
            mimic_root / paper_dir,  # New primary location (supports nested paths)
            Path("question_agents/reference_papers") / paper_dir,  # Legacy location
            Path("reference_papers") / paper_dir,
        ]

        latest_dir = None
        for p in possible_paths:
            if not p.exists():
                continue
            try:
                resolved_p = p.resolve()
                auto_dir = resolved_p / "auto"
                if not auto_dir.exists():
                    continue
                if resolved_p == mimic_root.resolve() or mimic_root.resolve() in resolved_p.parents:
                    latest_dir = resolved_p
                    break
                if p in possible_paths[1:]:
                    latest_dir = resolved_p
                    break
            except Exception:
                continue

        if not latest_dir:
            if str(paper_dir).strip().isdigit():
                error_msg = (
                    f'"{paper_dir}" is not a folder name — it looks like a question count. '
                    "Set the number of questions in the Count field and upload a PDF exam paper, "
                    "or enter an existing parsed folder name (e.g. 2211asm1)."
                )
            else:
                error_msg = (
                    f"Exam directory not found: {paper_dir}. "
                    "Upload a PDF exam paper or use an existing parsed folder under "
                    "data/user/question/mimic_papers/."
                )
            await send_progress("error", {"content": error_msg})
            return {
                "success": False,
                "error": error_msg,
            }
        # Note: latest_dir was already resolved in the loop above, no need to override

        # Ensure auto subdirectory exists
        auto_dir = latest_dir / "auto"
        if not auto_dir.exists():
            error_msg = f"Invalid exam directory (missing auto folder): {latest_dir}"
            await send_progress("error", {"content": error_msg})
            return {
                "success": False,
                "error": error_msg,
            }

        print(f"✓ Exam directory detected: {latest_dir.name}")
        print(f"   Full path: {latest_dir}")
        print()

        await send_progress(
            "progress",
            {
                "stage": "parsing",
                "status": "complete",
                "message": f"Using parsed exam: {latest_dir.name}",
            },
        )

    # If a PDF is provided, parse it first
    elif pdf_path:
        parse_started = time.perf_counter()
        resolved_pdf = Path(pdf_path).resolve()

        # Stage 1: Parsing PDF
        await send_progress(
            "progress",
            {"stage": "parsing", "status": "running", "message": "Parsing exam PDF..."},
        )

        print("🔄 Step 1: parse the PDF exam")
        print("-" * 80)

        # Use provided output_dir or default to mimic_papers
        if output_dir:
            output_base = Path(output_dir)
        else:
            output_base = project_root / "data" / "user" / "question" / "mimic_papers"
        output_base.mkdir(parents=True, exist_ok=True)

        latest_dir = _try_restore_mimic_cache(resolved_pdf, output_base)
        if latest_dir:
            await send_progress(
                "progress",
                {
                    "stage": "parsing",
                    "status": "complete",
                    "message": f"Using cached parse: {latest_dir.name}",
                },
            )
            stage_times["parsing_secs"] = round(time.perf_counter() - parse_started, 2)
        else:
            success = parse_pdf_for_exam(
                pdf_path=str(resolved_pdf),
                output_base_dir=str(output_base),
                prefer_fast=True,
            )

            if not success:
                await send_progress("error", {"content": "Failed to parse PDF"})
                return {"success": False, "error": "Failed to parse PDF"}

            print()

            print("🔍 Step 2: locating parsed results")
            print("-" * 80)

            latest_dir = resolve_parsed_paper_dir(output_base, pdf_path=str(resolved_pdf))
            if not latest_dir:
                await send_progress("error", {"content": "No parsed outputs were found"})
                return {"success": False, "error": "No parsed outputs were found"}

            if not ensure_sufficient_parsed_text(latest_dir, str(resolved_pdf)):
                msg = (
                    "Could not extract enough text from the PDF. "
                    "If this is a scanned/image PDF, try a text-based PDF or use "
                    "'From Knowledge' mode instead."
                )
                await send_progress("error", {"content": msg})
                return {"success": False, "error": msg}

            print(f"✓ Parsed folder: {latest_dir.name}")
            print()

            await send_progress(
                "progress",
                {
                    "stage": "parsing",
                    "status": "complete",
                    "message": f"PDF parsed successfully: {latest_dir.name}",
                },
            )

        stage_times["parsing_secs"] = round(time.perf_counter() - parse_started, 2)

    # Stage 2: Extract questions
    extract_started = time.perf_counter()
    await send_progress(
        "progress",
        {
            "stage": "extracting",
            "status": "running",
            "message": "Extracting reference questions from exam...",
        },
    )

    print("🔄 Step 3: extract reference questions")
    print("-" * 80)

    json_files = list(latest_dir.glob("*_questions.json"))

    if json_files:
        print(f"✓ Found existing question file: {json_files[0].name}")
        with open(json_files[0], encoding="utf-8") as f:
            questions_data = json.load(f)
    else:
        print("📄 No question file found, starting extraction...")
        success = extract_questions_from_paper(
            paper_dir=str(latest_dir),
            output_dir=None,
            max_questions=max_questions,
            prefer_pattern=True,
        )

        if not success:
            md_preview, _, _ = load_parsed_paper(latest_dir)
            char_count = len((md_preview or "").strip())
            msg = (
                "Question extraction failed. "
                f"Only {char_count} characters were read from the PDF. "
                "Try a clearer text-based exam PDF, or use 'From Knowledge' mode."
            )
            await send_progress("error", {"content": msg})
            return {"success": False, "error": msg}

        json_files = list(latest_dir.glob("*_questions.json"))
        if not json_files:
            await send_progress(
                "error", {"content": "Question JSON file not found after extraction"}
            )
            return {"success": False, "error": "Question JSON file not found after extraction"}

        with open(json_files[0], encoding="utf-8") as f:
            questions_data = json.load(f)

    if pdf_path:
        _save_mimic_cache(latest_dir, Path(pdf_path))

    stage_times["extracting_secs"] = round(time.perf_counter() - extract_started, 2)

    reference_questions = questions_data.get("questions", [])

    if not reference_questions:
        msg = "No reference questions found in the exam paper after extraction."
        await send_progress("error", {"content": msg})
        return {"success": False, "error": msg}

    unique_refs = reference_questions
    target_count = (
        max_questions
        if max_questions and max_questions > 0
        else len(unique_refs)
    )
    generation_plan = _build_mimic_generation_plan(unique_refs, target_count)

    print(f"✓ Loaded {len(unique_refs)} template pattern(s); generating {target_count} question(s)")
    if target_count > len(unique_refs):
        print(
            f"   ↳ Template has fewer patterns than requested count — "
            f"cycling {len(unique_refs)} pattern(s) to reach {target_count}"
        )
    print()

    # Send reference questions info
    await send_progress(
        "progress",
        {
            "stage": "extracting",
            "status": "complete",
            "message": (
                f"Using {len(unique_refs)} template pattern(s) to generate {target_count} question(s)"
            ),
            "total_questions": target_count,
            "reference_questions": [
                {
                    "number": q.get("question_number", str(i + 1)),
                    "preview": (
                        q["question_text"][:100] + "..."
                        if len(q["question_text"]) > 100
                        else q["question_text"]
                    ),
                }
                for i, q in enumerate(unique_refs)
            ],
        },
    )

    # Stage 3: Generate mimic questions
    await send_progress(
        "progress",
        {
            "stage": "generating",
            "status": "running",
            "message": "Generating mimic questions...",
            "current": 0,
            "total": target_count,
        },
    )

    print("🔄 Step 4: generate new questions from references (parallel)")
    print("-" * 80)

    # Lazy import to avoid circular import
    from src.agents.question import AgentCoordinator
    from src.services.config import load_config_with_main

    # Load config for parallel settings
    config = load_config_with_main("question_config.yaml", project_root)
    question_cfg = config.get("question", {})
    max_parallel = question_cfg.get("max_parallel_questions", 3)

    llm_config = get_llm_config()
    coordinator = AgentCoordinator(
        api_key=llm_config.api_key,
        base_url=llm_config.base_url,
        api_version=getattr(llm_config, "api_version", None),
        max_rounds=10,
        kb_name=kb_name,
        pdf_url=pdf_url,
    )

    source_chapter_url = (pdf_url or "").strip() or None
    if not source_chapter_url:
        msg = (
            "Please select an NCERT chapter in Source. "
            "Questions are generated from that chapter; the uploaded exam paper is only the pattern template."
        )
        await send_progress("error", {"content": msg})
        return {"success": False, "error": "source_chapter_required"}

    chapter_context = coordinator._get_pdf_context(source_chapter_url)
    if not chapter_context:
        msg = (
            "Could not load the selected NCERT chapter from Source. "
            "Please pick a chapter again, then retry."
        )
        await send_progress("error", {"content": msg})
        return {"success": False, "error": "source_chapter_unavailable"}

    # Shared knowledge retrieval once for the whole mimic batch
    await send_progress(
        "progress",
        {
            "stage": "researching",
            "status": "running",
            "message": "Retrieving knowledge from selected NCERT chapter...",
        },
    )

    batch_requirement = _build_mimic_batch_requirement(unique_refs, kb_name)
    research_started = time.perf_counter()
    retrieval = await coordinator.retrieve_knowledge_context(
        batch_requirement,
        pdf_url=source_chapter_url,
        include_pdf_context=True,
    )
    stage_times["researching_secs"] = round(time.perf_counter() - research_started, 2)

    if not retrieval.get("success"):
        msg = retrieval.get(
            "message",
            "Knowledge base does not contain relevant information for this exam.",
        )
        await send_progress("error", {"content": msg})
        return {"success": False, "error": retrieval.get("error", "knowledge_not_found")}

    shared_knowledge_context = retrieval["knowledge_context"]
    print(
        f"✓ Shared knowledge retrieved ({len(shared_knowledge_context)} chars, "
        f"{len(retrieval.get('queries', []))} queries)"
    )

    await send_progress(
        "progress",
        {
            "stage": "researching",
            "status": "complete",
            "message": "Knowledge ready for mimic generation",
            "queries": retrieval.get("queries", []),
        },
    )

    print(f"📊 Processing {target_count} outputs ({len(unique_refs)} template pattern(s)) with max {max_parallel} parallel")

    generate_agent = coordinator._create_generate_agent()
    relevance_analyzer = coordinator._create_relevance_analyzer()
    generate_sem = asyncio.Semaphore(max_parallel)
    relevance_sem = asyncio.Semaphore(max_parallel)

    # Track completed count
    completed_count = 0
    completed_lock = asyncio.Lock()
    generate_started = time.perf_counter()

    async def generate_single_mimic(
        ref_question: dict,
        index: int,
        variant_cycle: int = 1,
    ) -> dict:
        """Generate a single mimic question with pipelined generate + relevance."""
        nonlocal completed_count

        question_id = f"mimic_{index}"
        ref_number = ref_question.get("question_number", str(index))
        effective_style = style_hint
        if variant_cycle > 1:
            cycle_note = (
                f"Variant #{variant_cycle} of this template pattern — "
                "must differ clearly from earlier variants (new scenario, values, wording)."
            )
            effective_style = f"{style_hint}\n{cycle_note}" if style_hint else cycle_note

        requirement = _build_mimic_reference_requirement(
            ref_question, kb_name, effective_style
        )

        async with generate_sem:
            await send_progress(
                "question_update",
                {
                    "question_id": question_id,
                    "index": index,
                    "status": "generating",
                    "reference_number": ref_number,
                    "reference_preview": ref_question["question_text"][:80] + "...",
                },
            )

            print(f"\n📝 [{question_id}] Starting - Reference: {ref_number}")
            print(f"   Preview: {ref_question['question_text'][:80]}...")

            try:
                gen_result = await generate_agent.process(
                    requirement=requirement,
                    knowledge_context=shared_knowledge_context,
                    reference_question=requirement.get("reference_question"),
                )
            except Exception as e:
                gen_result = {"success": False, "error": str(e)}

        if not gen_result.get("success"):
            async with completed_lock:
                completed_count += 1
                current_completed = completed_count

            print(f"✗ [{question_id}] Failed: {gen_result.get('error', 'Unknown error')}")
            error_data = {
                "success": False,
                "reference_question_number": ref_number,
                "reference_question_text": ref_question["question_text"],
                "error": gen_result.get("error", "Unknown error"),
                "reason": gen_result.get("reason", ""),
            }
            await send_progress(
                "question_update",
                {
                    "question_id": question_id,
                    "index": index,
                    "status": "failed",
                    "error": gen_result.get("error", "Unknown error"),
                    "current": current_completed,
                    "total": target_count,
                },
            )
            return error_data

        question = gen_result["question"]

        async with relevance_sem:
            await send_progress(
                "question_update",
                {
                    "question_id": question_id,
                    "index": index,
                    "status": "analyzing",
                    "reference_number": ref_number,
                },
            )
            try:
                analysis = await relevance_analyzer.process(
                    question=question,
                    knowledge_context=shared_knowledge_context,
                )
            except Exception as e:
                analysis = {
                    "relevance": "partial",
                    "kb_coverage": "",
                    "extension_points": str(e),
                }

        validation = {
            "decision": "approve",
            "relevance": analysis["relevance"],
            "kb_coverage": analysis["kb_coverage"],
            "extension_points": analysis.get("extension_points", ""),
        }
        result = {
            "success": True,
            "question": question,
            "validation": validation,
            "rounds": 1,
        }

        async with completed_lock:
            completed_count += 1
            current_completed = completed_count

        print(f"✓ [{question_id}] Generated in {result['rounds']} round(s)")

        result_data = {
            "success": True,
            "reference_question_number": ref_number,
            "reference_question_text": ref_question["question_text"],
            "reference_images": ref_question.get("images", []),
            "generated_question": result["question"],
            "validation": result["validation"],
            "rounds": result["rounds"],
        }

        await send_progress(
            "result",
            {
                "question_id": question_id,
                "index": index,
                "success": True,
                "question": result["question"],
                "validation": result["validation"],
                "rounds": result["rounds"],
                "reference_question": ref_question["question_text"],
                "current": current_completed,
                "total": target_count,
            },
        )

        return result_data

    # Run all mimic generations in parallel
    tasks = [
        generate_single_mimic(
            item["ref_question"],
            item["output_index"],
            item["variant_cycle"],
        )
        for item in generation_plan
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Separate successes and failures
    generated_questions = []
    failed_questions = []

    for result in results:
        if isinstance(result, Exception):
            failed_questions.append({"error": str(result)})
        elif result.get("success"):
            generated_questions.append(result)
        else:
            failed_questions.append(result)

    stage_times["generating_secs"] = round(time.perf_counter() - generate_started, 2)
    duration_secs = round(time.perf_counter() - run_started, 2)

    print()
    print("=" * 80)
    print("📊 Generation summary")
    print("=" * 80)
    print(f"Template patterns: {len(unique_refs)}")
    print(f"Requested outputs: {target_count}")
    print(f"Successes: {len(generated_questions)}")
    print(f"Failures: {len(failed_questions)}")
    print(
        f"Total time: {duration_secs}s "
        f"(parse={stage_times.get('parsing_secs', 0)}s, "
        f"extract={stage_times.get('extracting_secs', 0)}s, "
        f"research={stage_times.get('researching_secs', 0)}s, "
        f"generate={stage_times.get('generating_secs', 0)}s)"
    )

    if output_dir is None:
        output_dir = latest_dir
    else:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = output_dir / f"{latest_dir.name}_{timestamp}_generated_questions.json"

    output_data = {
        "reference_paper": latest_dir.name,
        "kb_name": kb_name,
        "total_reference_questions": len(unique_refs),
        "requested_outputs": target_count,
        "successful_generations": len(generated_questions),
        "failed_generations": len(failed_questions),
        "duration_secs": duration_secs,
        "stage_times": stage_times,
        "generated_questions": generated_questions,
        "failed_questions": failed_questions,
    }

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(output_data, f, ensure_ascii=False, indent=2)

    print(f"\n💾 Results saved to: {output_file}")
    print()

    # Send summary
    await send_progress(
        "summary",
        {
            "total_reference": len(unique_refs),
            "requested_outputs": target_count,
            "successful": len(generated_questions),
            "failed": len(failed_questions),
            "output_file": str(output_file),
            "duration_secs": duration_secs,
            "stage_times": stage_times,
        },
    )

    return {
        "success": True,
        "output_file": str(output_file),
        "total_reference_questions": len(unique_refs),
        "requested_outputs": target_count,
        "generated_questions": generated_questions,
        "failed_questions": failed_questions,
        "duration_secs": duration_secs,
        "stage_times": stage_times,
    }


async def main():
    """Command-line entry point."""
    import argparse

    parser = argparse.ArgumentParser(
        description="Reference-based question generation CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python exam_mimic.py --pdf /path/to/exam.pdf --kb math2211
  python exam_mimic.py --paper 2211asm1 --kb math2211
  python exam_mimic.py --paper reference_papers/2211asm1 --kb math2211
  python exam_mimic.py --paper 2211asm1 --kb math2211 --max-questions 3
  python exam_mimic.py --paper 2211asm1 --kb math2211 -o ./output
        """,
    )

    # Input mode (mutually exclusive)
    input_group = parser.add_mutually_exclusive_group(required=True)
    input_group.add_argument(
        "--pdf", type=str, help="Absolute path to the PDF exam (will be parsed)"
    )

    input_group.add_argument(
        "--paper",
        type=str,
        help="Name of a parsed exam directory (e.g., 2211asm1) or its absolute path",
    )

    parser.add_argument("--kb", type=str, required=True, help="Knowledge base name")

    parser.add_argument(
        "-o",
        "--output",
        type=str,
        default=None,
        help="Output directory (defaults to the exam folder)",
    )

    parser.add_argument(
        "--max-questions",
        type=int,
        default=None,
        help="Maximum number of reference questions to process (testing)",
    )

    args = parser.parse_args()

    # Execute the workflow
    result = await mimic_exam_questions(
        pdf_path=args.pdf,
        paper_dir=args.paper,
        kb_name=args.kb,
        output_dir=args.output,
        max_questions=args.max_questions,
    )

    if result["success"]:
        print("✓ Completed!")
        sys.exit(0)
    else:
        print(f"✗ Failed: {result.get('error')}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
