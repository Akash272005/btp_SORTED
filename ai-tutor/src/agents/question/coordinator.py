#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
AgentCoordinator - Orchestrates question generation workflow.

Refactored version:
- Uses specialized agents: RetrieveAgent, GenerateAgent, RelevanceAnalyzer
- No iterative validation loops - single-pass generation + relevance analysis
- All questions are accepted, classified as "high" or "partial" relevance
"""

import asyncio
from collections.abc import Callable
from datetime import datetime
import json
import time
from pathlib import Path
import re
import sys
from typing import Any

# Add project root for imports
project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))

from src.app_logging import Logger, get_logger
from src.services.config import load_config_with_main
from src.utils.ncert_auto_pdf import extract_ncert_pdf_text_from_blob

from .agents.generate_agent import GenerateAgent
from .agents.relevance_analyzer import RelevanceAnalyzer
from .agents.retrieve_agent import RetrieveAgent


class AgentCoordinator:
    """
    Coordinate question generation workflow using specialized agents.

    Workflow:
    1. RetrieveAgent: Generate queries and retrieve knowledge
    2. Plan: Generate question plan with focuses
    3. GenerateAgent: Generate questions
    4. RelevanceAnalyzer: Analyze relevance (no rejection, just classification)
    """

    def __init__(
        self,
        api_key: str | None = None,
        base_url: str | None = None,
        api_version: str | None = None,
        max_rounds: int = 10,  # Kept for backward compatibility, but not used for iteration
        kb_name: str | None = None,
        output_dir: str | None = None,
        language: str = "en",
        pdf_url: str | None = None,
    ):
        """
        Initialize the coordinator.

        Args:
            api_key: API key (optional, loaded from config if not provided)
            base_url: API endpoint (optional)
            api_version: API version for Azure (optional)
            max_rounds: Deprecated, kept for backward compatibility
            kb_name: Knowledge base name
            output_dir: Output directory for results
            language: Language for prompts ("en" or "zh")
        """
        self.kb_name = kb_name
        self.output_dir = output_dir
        self.language = language
        self.pdf_url = pdf_url

        # Store API credentials for creating agents
        self._api_key = api_key
        self._base_url = base_url
        self._api_version = api_version

        # Load configuration
        self.config = load_config_with_main("question_config.yaml", project_root)

        # Initialize logger
        log_dir = self.config.get("paths", {}).get("user_log_dir") or self.config.get(
            "logging", {}
        ).get("log_dir")
        self.logger: Logger = get_logger("QuestionCoordinator", log_dir=log_dir)

        # Get config values
        question_cfg = self.config.get("question", {})
        self.rag_query_count = question_cfg.get("rag_query_count", 3)
        self.max_parallel_questions = question_cfg.get("max_parallel_questions", 1)
        self.rag_mode = question_cfg.get("rag_mode", "naive")

        # Token tracking - will be updated from BaseAgent shared stats
        self.token_stats = {
            "model": "gpt-4o-mini",
            "calls": 0,
            "tokens": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "cost": 0.0,
        }

        # WebSocket callback for streaming updates
        self._ws_callback: Callable | None = None

    def _update_token_stats(self):
        """Update token_stats from BaseAgent's shared LLMStats for the question module."""
        from src.agents.base_agent import BaseAgent

        try:
            stats = BaseAgent.get_stats("question")
            summary = stats.get_summary()

            self.token_stats = {
                "model": summary.get("model", "gpt-4o-mini"),
                "calls": summary.get("calls", 0),
                "tokens": summary.get("total_tokens", 0),
                "input_tokens": summary.get("input_tokens", 0),
                "output_tokens": summary.get("output_tokens", 0),
                "cost": summary.get("cost", 0.0),
            }
        except Exception as e:
            self.logger.debug(f"Failed to update token stats: {e}")

    def set_ws_callback(self, callback: Callable):
        """Set WebSocket callback for streaming updates to frontend."""
        self._ws_callback = callback

    async def _send_ws_update(self, update_type: str, data: dict[str, Any]):
        """Send update via WebSocket callback if available."""
        if self._ws_callback:
            try:
                await self._ws_callback({"type": update_type, **data})
            except Exception as e:
                self.logger.debug(f"Failed to send WS update: {e}")

    def _create_retrieve_agent(self) -> RetrieveAgent:
        """Create a RetrieveAgent instance."""
        return RetrieveAgent(
            kb_name=self.kb_name,
            rag_mode=self.rag_mode,
            language=self.language,
            api_key=self._api_key,
            base_url=self._base_url,
            api_version=self._api_version,
        )

    def _schedule_disk_write(self, fn: Callable, *args: Any, **kwargs: Any) -> None:
        """Run blocking disk writes in a background thread."""

        async def _run() -> None:
            try:
                await asyncio.to_thread(fn, *args, **kwargs)
            except Exception as exc:
                self.logger.debug(f"Background disk write failed: {exc}")

        asyncio.create_task(_run())

    def _create_generate_agent(self) -> GenerateAgent:
        """Create a GenerateAgent instance."""
        return GenerateAgent(
            language=self.language,
            api_key=self._api_key,
            base_url=self._base_url,
            api_version=self._api_version,
        )

    def _create_relevance_analyzer(self) -> RelevanceAnalyzer:
        """Create a RelevanceAnalyzer instance."""
        return RelevanceAnalyzer(
            language=self.language,
            api_key=self._api_key,
            base_url=self._base_url,
            api_version=self._api_version,
        )

    # =========================================================================
    # Knowledge retrieval (shared across batch / mimic)
    # =========================================================================

    async def retrieve_knowledge_context(
        self,
        requirement: dict[str, Any],
        pdf_url: str | None = None,
        *,
        include_pdf_context: bool = True,
    ) -> dict[str, Any]:
        """Retrieve and merge knowledge context for one or many questions."""
        pdf_url = pdf_url or self.pdf_url

        retrieve_agent = self._create_retrieve_agent()
        retrieval_result = await retrieve_agent.process(
            requirement=requirement,
            num_queries=self.rag_query_count,
        )

        if not retrieval_result.get("has_content"):
            return {
                "success": False,
                "error": "knowledge_not_found",
                "message": "Knowledge base does not contain relevant information.",
                "queries": retrieval_result.get("queries", []),
                "retrieval_result": retrieval_result,
            }

        knowledge_context = retrieval_result["summary"]
        if include_pdf_context:
            pdf_context = self._get_pdf_context(pdf_url)
            if pdf_context:
                knowledge_context = (
                    f"=== NCERT DOCUMENT CONTEXT ===\n{pdf_context}\n\n{knowledge_context}"
                )

        return {
            "success": True,
            "knowledge_context": knowledge_context,
            "queries": retrieval_result.get("queries", []),
            "retrieval_result": retrieval_result,
        }

    async def generate_question_with_knowledge(
        self,
        requirement: dict[str, Any],
        knowledge_context: str,
        *,
        save_result: bool = True,
    ) -> dict[str, Any]:
        """Generate one question using pre-retrieved knowledge (no RAG pass)."""
        generate_agent = self._create_generate_agent()
        reference_question = requirement.get("reference_question")

        gen_result = await generate_agent.process(
            requirement=requirement,
            knowledge_context=knowledge_context,
            reference_question=reference_question,
        )

        if not gen_result.get("success"):
            return {
                "success": False,
                "error": gen_result.get("error", "Generation failed"),
            }

        question = gen_result["question"]

        analyzer = self._create_relevance_analyzer()
        analysis = await analyzer.process(
            question=question,
            knowledge_context=knowledge_context,
        )

        result = {
            "success": True,
            "question": question,
            "analysis": analysis,
            "validation": {
                "decision": "approve",
                "relevance": analysis["relevance"],
                "kb_coverage": analysis["kb_coverage"],
                "extension_points": analysis.get("extension_points", ""),
            },
            "rounds": 1,
        }

        if save_result and self.output_dir:
            self._schedule_disk_write(self._save_question_result, result, requirement)

        self._update_token_stats()
        return result

    # =========================================================================
    # Main Entry Points
    # =========================================================================

    async def generate_question(
        self,
        requirement: dict[str, Any],
        pdf_url: str | None = None,
    ) -> dict[str, Any]:
        """
        Generate a single question with relevance analysis.

        This is used by Mimic mode and for single question generation.

        Args:
            requirement: Question requirement dict

        Returns:
            Dict with:
                - success: bool
                - question: Generated question dict
                - analysis: Relevance analysis result
                - rounds: Always 1 (no iteration)
        """
        self.logger.section("Single Question Generation")
        self.logger.info(f"Knowledge point: {requirement.get('knowledge_point', 'N/A')}")

        pdf_url = pdf_url or self.pdf_url

        retrieval = await self.retrieve_knowledge_context(requirement, pdf_url=pdf_url)
        if not retrieval.get("success"):
            self.logger.warning("No relevant knowledge found")
            return {
                "success": False,
                "error": retrieval.get("error", "knowledge_not_found"),
                "message": retrieval.get(
                    "message",
                    "Knowledge base does not contain relevant information.",
                ),
            }

        knowledge_context = retrieval["knowledge_context"]

        result = await self.generate_question_with_knowledge(
            requirement,
            knowledge_context,
            save_result=bool(self.output_dir),
        )

        if result.get("success"):
            self.logger.success(
                f"Question generated with {result['validation']['relevance']} relevance"
            )

        return result

    async def generate_questions_custom(
        self,
        requirement: dict[str, Any],
        num_questions: int,
        pdf_url: str | None = None,
        skip_relevance: bool = False,
        slot_specs: list[dict[str, Any]] | None = None,
        slot_requirement_for_index: Callable[[int], dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        Custom mode: Generate multiple questions from a requirement.

        Flow:
        1. Researching: Retrieve background knowledge
        2. Planning: Generate question plan with focuses
        3. Generating: Generate each question (parallel) + optional relevance analysis

        Args:
            requirement: Base requirement dict (knowledge_point, difficulty, question_type)
            num_questions: Number of questions to generate
            pdf_url: Optional NCERT PDF blob URL for chapter context
            skip_relevance: If True, skip RelevanceAnalyzer (faster; use for LMS quiz builder)

        Returns:
            Summary dict with all results
        """
        if num_questions <= 0:
            raise ValueError("num_questions must be greater than zero")

        self.logger.section(f"Custom Mode Generation: {num_questions} question(s)")

        run_started = time.perf_counter()
        stage_times: dict[str, float] = {}

        # Create batch directory
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        batch_dir = Path(self.output_dir) / f"batch_{timestamp}" if self.output_dir else None
        if batch_dir:
            batch_dir.mkdir(parents=True, exist_ok=True)

        # =====================================================================
        # Stage 1: Researching
        # =====================================================================
        stage_research_start = time.perf_counter()
        self.logger.stage("Stage 1: Researching")
        await self._send_ws_update(
            "progress",
            {"stage": "researching", "progress": {"status": "retrieving"}, "total": num_questions},
        )

        retrieval = await self.retrieve_knowledge_context(requirement, pdf_url=pdf_url)

        if not retrieval.get("success"):
            self.logger.warning("No relevant knowledge found")
            return {
                "success": False,
                "error": retrieval.get("error", "knowledge_not_found"),
                "message": retrieval.get(
                    "message",
                    "Knowledge base does not contain relevant information.",
                ),
                "search_queries": retrieval.get("queries", []),
            }

        knowledge_context = retrieval["knowledge_context"]
        queries = retrieval["queries"]
        retrieval_result = retrieval["retrieval_result"]

        # Save knowledge.json
        if batch_dir:
            self._schedule_disk_write(self._save_knowledge_json, batch_dir, retrieval_result)

        await self._send_ws_update("knowledge_saved", {"queries": queries})
        stage_times["researching_secs"] = round(time.perf_counter() - stage_research_start, 2)

        # =====================================================================
        # Stage 2: Planning
        # =====================================================================
        stage_plan_start = time.perf_counter()
        self.logger.stage("Stage 2: Planning")
        await self._send_ws_update(
            "progress", {"stage": "planning", "progress": {"status": "creating_plan"}}
        )

        if num_questions == 1 and not slot_specs:
            question_type = requirement.get("question_type", "written")
            plan = {
                "knowledge_point": requirement.get("knowledge_point", ""),
                "difficulty": requirement.get("difficulty", "medium"),
                "question_type": question_type,
                "num_questions": 1,
                "focuses": [
                    {
                        "id": "q_1",
                        "focus": requirement.get("knowledge_point", "topic"),
                        "type": question_type,
                    }
                ],
            }
        else:
            plan = await self._generate_question_plan(
                requirement,
                knowledge_context,
                num_questions,
                slot_specs=slot_specs,
            )
        focuses = plan.get("focuses", [])

        # Save plan.json
        if batch_dir:
            self._schedule_disk_write(self._save_plan_json, batch_dir, plan)

        await self._send_ws_update("plan_ready", {"plan": plan, "focuses": focuses})
        stage_times["planning_secs"] = round(time.perf_counter() - stage_plan_start, 2)

        # =====================================================================
        # Stage 3: Generating (parallel batches)
        # =====================================================================
        stage_generate_start = time.perf_counter()
        parallel_limit = max(1, int(self.max_parallel_questions))
        self.logger.stage(
            f"Stage 3: Generating (parallel={parallel_limit}, skip_relevance={skip_relevance})"
        )
        await self._send_ws_update(
            "progress",
            {"stage": "generating", "progress": {"current": 0, "total": num_questions}},
        )

        results: list[dict[str, Any]] = []
        failures: list[dict[str, Any]] = []

        generate_agent = self._create_generate_agent()
        analyzer = None if skip_relevance else self._create_relevance_analyzer()

        focuses_to_run = focuses[:num_questions]
        if len(focuses_to_run) < num_questions:
            if slot_specs:
                from src.lms.services.ncert_question_requirements import (
                    fallback_focuses_for_slots,
                )

                focuses_to_run = fallback_focuses_for_slots(
                    requirement.get("knowledge_point", "topic"),
                    slot_specs,
                )[:num_questions]
            else:
                question_type = requirement.get("question_type", "written")
                for i in range(len(focuses_to_run), num_questions):
                    focuses_to_run.append(
                        {
                            "id": f"q_{i + 1}",
                            "focus": f"Aspect {i + 1} of {requirement.get('knowledge_point', 'topic')}",
                            "type": question_type,
                        }
                    )

        generate_sem = asyncio.Semaphore(parallel_limit)
        relevance_sem = asyncio.Semaphore(parallel_limit)
        progress_lock = asyncio.Lock()
        completed_count = 0

        async def process_one(idx: int, focus: dict[str, Any]) -> dict[str, Any]:
            nonlocal completed_count
            question_id = focus.get("id", f"q_{idx + 1}")

            async with generate_sem:
                self.logger.info(f"Generating question {question_id}")

                await self._send_ws_update(
                    "question_update",
                    {
                        "question_id": question_id,
                        "status": "generating",
                        "focus": focus.get("focus", ""),
                    },
                )

                req = (
                    slot_requirement_for_index(idx)
                    if slot_requirement_for_index is not None
                    else requirement
                )
                gen_result = await generate_agent.process(
                    requirement=req,
                    knowledge_context=knowledge_context,
                    focus=focus,
                )

            if not gen_result.get("success"):
                self.logger.error(f"Failed to generate question {question_id}")
                await self._send_ws_update(
                    "question_update", {"question_id": question_id, "status": "error"}
                )
                return {
                    "ok": False,
                    "idx": idx,
                    "failure": {
                        "question_id": question_id,
                        "error": gen_result.get("error", "Unknown error"),
                    },
                }

            question = gen_result["question"]

            if skip_relevance:
                analysis: dict[str, Any] = {
                    "relevance": "high",
                    "kb_coverage": "",
                    "extension_points": "",
                }
            else:
                async with relevance_sem:
                    await self._send_ws_update(
                        "question_update",
                        {"question_id": question_id, "status": "analyzing"},
                    )
                    analysis = await analyzer.process(
                        question=question,
                        knowledge_context=knowledge_context,
                    )

            validation = {
                "decision": "approve",
                "relevance": analysis["relevance"],
                "kb_coverage": analysis["kb_coverage"],
                "extension_points": analysis.get("extension_points", ""),
            }

            result = {
                "question_id": question_id,
                "focus": focus,
                "question": question,
                "analysis": analysis,
                "validation": validation,
            }

            if batch_dir:
                self._schedule_disk_write(self._save_custom_question_result, batch_dir, result)

            await self._send_ws_update(
                "question_update", {"question_id": question_id, "status": "done"}
            )
            await self._send_ws_update(
                "result",
                {
                    "question_id": question_id,
                    "question": question,
                    "validation": validation,
                    "focus": focus,
                    "index": idx,
                },
            )

            async with progress_lock:
                completed_count += 1
                current = completed_count

            await self._send_ws_update(
                "progress",
                {
                    "stage": "generating",
                    "progress": {"current": current, "total": num_questions},
                },
            )

            return {"ok": True, "idx": idx, "result": result}

        outcomes = await asyncio.gather(
            *[process_one(idx, focus) for idx, focus in enumerate(focuses_to_run)],
            return_exceptions=True,
        )

        indexed_results: list[tuple[int, dict[str, Any]]] = []
        for outcome in outcomes:
            if isinstance(outcome, BaseException):
                failures.append({"error": str(outcome)})
                continue
            if not outcome.get("ok"):
                failures.append(outcome["failure"])
                continue
            indexed_results.append((outcome.get("idx", 0), outcome["result"]))

        indexed_results.sort(key=lambda pair: pair[0])

        retry_idxs = [
            outcome["idx"]
            for outcome in outcomes
            if isinstance(outcome, dict) and not outcome.get("ok") and "idx" in outcome
        ]
        if retry_idxs:
            self.logger.info(f"Retrying {len(retry_idxs)} failed question(s) sequentially...")
            for idx in retry_idxs:
                focus = focuses_to_run[idx]
                qid = focus.get("id", f"q_{idx + 1}")
                retry_focus = focus
                prior_err = ""
                for outcome in outcomes:
                    if (
                        isinstance(outcome, dict)
                        and outcome.get("idx") == idx
                        and not outcome.get("ok")
                    ):
                        prior_err = str(outcome.get("failure", {}).get("error", ""))
                        break
                if "content_filter" in prior_err.lower() or "content management policy" in prior_err.lower():
                    retry_focus = {
                        **focus,
                        "focus": (
                            "Standard CBSE exam question using formulas from the chapter "
                            "(Ohm's law, resistance, power, or circuit calculations). "
                            "Keep wording neutral and academic."
                        ),
                    }
                retry_outcome = await process_one(idx, retry_focus)
                failures = [f for f in failures if f.get("question_id") != qid]
                if retry_outcome.get("ok"):
                    indexed_results = [(i, r) for i, r in indexed_results if i != idx]
                    indexed_results.append((idx, retry_outcome["result"]))
                elif isinstance(retry_outcome, dict):
                    failures.append(retry_outcome.get("failure", {"question_id": qid}))

            indexed_results.sort(key=lambda pair: pair[0])

        results = [item for _, item in indexed_results]
        stage_times["generating_secs"] = round(time.perf_counter() - stage_generate_start, 2)
        duration_secs = round(time.perf_counter() - run_started, 2)

        # =====================================================================
        # Complete
        # =====================================================================
        summary = {
            "success": len(results) == num_questions,
            "requested": num_questions,
            "completed": len(results),
            "failed": len(failures),
            "duration_secs": duration_secs,
            "stage_times": stage_times,
            "search_queries": queries,
            "plan": plan,
            "results": results,
            "failures": failures,
        }

        if batch_dir:
            summary_file = batch_dir / "summary.json"
            with open(summary_file, "w", encoding="utf-8") as f:
                json.dump(summary, f, indent=2, ensure_ascii=False)
            summary["output_dir"] = str(batch_dir)

        # Update token stats from shared LLMStats
        self._update_token_stats()

        await self._send_ws_update(
            "progress",
            {
                "stage": "complete",
                "completed": len(results),
                "failed": len(failures),
                "total": num_questions,
                "duration_secs": duration_secs,
                "stage_times": stage_times,
            },
        )

        self.logger.section("Generation Summary")
        self.logger.info(f"Requested: {num_questions}")
        self.logger.info(f"Completed: {len(results)}")
        self.logger.info(f"Failed: {len(failures)}")
        self.logger.info(
            f"Total time: {duration_secs}s "
            f"(research={stage_times.get('researching_secs', 0)}s, "
            f"plan={stage_times.get('planning_secs', 0)}s, "
            f"generate={stage_times.get('generating_secs', 0)}s)"
        )

        return summary

    # =========================================================================
    # Helper Methods
    # =========================================================================

    async def _generate_question_plan(
        self,
        requirement: dict[str, Any],
        knowledge_context: str,
        num_questions: int,
        slot_specs: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        """
        Generate a question plan with distinct focuses.

        Args:
            requirement: Base requirement
            knowledge_context: Retrieved knowledge summary
            num_questions: Number of questions

        Returns:
            Plan dict with focuses array
        """
        from src.services.llm import complete as llm_complete
        from src.services.llm.config import get_llm_config

        llm_config = get_llm_config()

        default_type = requirement.get("question_type", "written")
        system_prompt = (
            "You are an educational content planner. Create distinct question focuses "
            "that test different aspects of the same topic.\n\n"
            "CRITICAL: Return ONLY valid JSON. Do not wrap in markdown code blocks.\n"
            'Output JSON with key "focuses" containing an array of objects, each with:\n'
            '- "id": string like "q_1", "q_2"\n'
            '- "focus": string describing what aspect to test\n'
            f'- "type": "{default_type}" (use "choice" for MCQ, "written" for short/long)'
        )
        if slot_specs:
            system_prompt += (
                "\n\nFor mixed papers each question index MUST use the type specified below. "
                'Use type "choice" for MCQ slots and "written" for short/long slots.'
            )

        # Truncate knowledge context consistently (4000 chars across all agents)
        truncated_knowledge = (
            knowledge_context[:4000] if len(knowledge_context) > 4000 else knowledge_context
        )
        truncation_suffix = "...[truncated]" if len(knowledge_context) > 4000 else ""

        slot_lines = ""
        if slot_specs:
            from src.lms.services.ncert_question_requirements import agent_focus_type_for_section

            qn = 1
            lines: list[str] = []
            for spec in slot_specs:
                sid = str(spec.get("section_id", "A"))
                st = str(spec.get("section_type", "mcq")).lower()
                cnt = int(spec.get("count") or 0)
                agent_type = agent_focus_type_for_section(st)
                for _ in range(cnt):
                    lines.append(
                        f'- q_{qn}: type "{agent_type}" — Section {sid} ({st.upper()})'
                    )
                    qn += 1
            slot_lines = (
                "\n\nExact type per question (do not change order or types):\n"
                + "\n".join(lines)
            )

        user_prompt = (
            f"Topic: {requirement.get('knowledge_point', '')}\n"
            f"Difficulty: {requirement.get('difficulty', 'medium')}\n"
            f"Question Type: {requirement.get('question_type', 'written')}\n"
            f"Number: {num_questions}\n"
            f"{requirement.get('additional_requirements', '')}\n\n"
            f"Knowledge:\n{truncated_knowledge}{truncation_suffix}\n\n"
            f"Generate exactly {num_questions} distinct focuses in JSON."
            f"{slot_lines}"
        )

        try:
            response = await llm_complete(
                prompt=user_prompt,
                system_prompt=system_prompt,
                model=llm_config.model,
                api_key=self._api_key or llm_config.api_key,
                base_url=self._base_url or llm_config.base_url,
                api_version=self._api_version,
                response_format={"type": "json_object"},
                temperature=0.3,
            )

            data = json.loads(response)
            focuses = data.get("focuses", [])
            if not isinstance(focuses, list):
                focuses = []

        except Exception as e:
            self.logger.warning(f"Failed to generate plan: {e}")
            focuses = []

        # Fallback: create simple focuses
        if len(focuses) < num_questions:
            if slot_specs:
                from src.lms.services.ncert_question_requirements import (
                    fallback_focuses_for_slots,
                )

                focuses = fallback_focuses_for_slots(
                    requirement.get("knowledge_point", "topic"),
                    slot_specs,
                )
            else:
                question_type = requirement.get("question_type", "written")
                for i in range(len(focuses), num_questions):
                    focuses.append(
                        {
                            "id": f"q_{i + 1}",
                            "focus": f"Aspect {i + 1} of {requirement.get('knowledge_point', 'topic')}",
                            "type": question_type,
                        }
                    )

        return {
            "knowledge_point": requirement.get("knowledge_point", ""),
            "difficulty": requirement.get("difficulty", "medium"),
            "question_type": requirement.get("question_type", "written"),
            "num_questions": num_questions,
            "focuses": focuses[:num_questions],
        }

    def _save_question_result(
        self,
        result: dict[str, Any],
        requirement: dict[str, Any],
    ) -> str | None:
        """Save a single question result to disk."""
        if not self.output_dir:
            return None

        try:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            output_path = Path(self.output_dir) / f"question_{timestamp}"
            output_path.mkdir(parents=True, exist_ok=True)

            # Save result.json
            with open(output_path / "result.json", "w", encoding="utf-8") as f:
                json.dump(result, f, indent=2, ensure_ascii=False)

            # Save question.md
            question = result.get("question", {})
            validation = result.get("validation", {})

            md_content = f"""# Generated Question

**Knowledge point**: {requirement.get("knowledge_point", question.get("knowledge_point", "N/A"))}
**Difficulty**: {requirement.get("difficulty", "N/A")}
**Type**: {question.get("question_type", "N/A")}
**Relevance**: {validation.get("relevance", "N/A")}

---

## Question
{question.get("question", "")}

"""
            if question.get("options"):
                md_content += "## Options\n"
                for key, value in question.get("options", {}).items():
                    md_content += f"- **{key}**: {value}\n"
                md_content += "\n"

            md_content += f"""
## Answer
{question.get("correct_answer", "")}

## Explanation
{question.get("explanation", "")}

---

## Relevance Analysis

**KB Coverage**: {validation.get("kb_coverage", "")}
"""
            if validation.get("extension_points"):
                md_content += f"\n**Extension Points**: {validation.get('extension_points', '')}"

            with open(output_path / "question.md", "w", encoding="utf-8") as f:
                f.write(md_content)

            self.logger.info(f"Result saved to: {output_path}")
            return str(output_path)

        except Exception as e:
            self.logger.warning(f"Failed to save result: {e}")
            return None

    def _save_knowledge_json(
        self,
        batch_dir: Path,
        retrieval_result: dict[str, Any],
    ):
        """Save knowledge.json for a batch."""
        knowledge_file = batch_dir / "knowledge.json"
        with open(knowledge_file, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "queries": retrieval_result.get("queries", []),
                    "retrievals": retrieval_result.get("retrievals", []),
                },
                f,
                indent=2,
                ensure_ascii=False,
            )

    def _save_plan_json(self, batch_dir: Path, plan: dict[str, Any]):
        """Save plan.json for a batch."""
        plan_file = batch_dir / "plan.json"
        with open(plan_file, "w", encoding="utf-8") as f:
            json.dump(plan, f, indent=2, ensure_ascii=False)

    def _save_custom_question_result(
        self,
        batch_dir: Path,
        result: dict[str, Any],
    ):
        """Save a single question result in custom mode."""
        question_id = result.get("question_id", "q_unknown")
        question_dir = batch_dir / question_id
        question_dir.mkdir(parents=True, exist_ok=True)

        # Save result.json
        with open(question_dir / "result.json", "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        # Save question.md
        question = result.get("question", {})
        analysis = result.get("analysis", {})
        focus = result.get("focus", {})

        md_content = f"""# Generated Question

**Focus**: {focus.get("focus", "N/A")}
**Type**: {question.get("question_type", "N/A")}
**Relevance**: {analysis.get("relevance", "N/A")}

---

## Question
{question.get("question", "")}

"""
        if question.get("options"):
            md_content += "## Options\n"
            for key, value in question.get("options", {}).items():
                md_content += f"- **{key}**: {value}\n"
            md_content += "\n"

        md_content += f"""
## Answer
{question.get("correct_answer", "")}

## Explanation
{question.get("explanation", "")}

---

## Relevance Analysis

**KB Coverage**: {analysis.get("kb_coverage", "")}
"""
        if analysis.get("extension_points"):
            md_content += f"\n**Extension Points**: {analysis.get('extension_points', '')}"

        with open(question_dir / "question.md", "w", encoding="utf-8") as f:
            f.write(md_content)

    def _get_pdf_context(self, pdf_url: str | None) -> str | None:
        """Extract NCERT PDF text from Azure Blob only (no local web/public files)."""
        if not pdf_url:
            return None
        try:
            text = extract_ncert_pdf_text_from_blob(
                pdf_url, max_chars=10_000, max_pages=30
            )
            if text:
                preview = pdf_url if len(pdf_url) <= 120 else pdf_url[:120] + "..."
                self.logger.info(
                    f"PDF context from blob ({len(text)} chars): {preview}"
                )
            else:
                self.logger.warning(f"No PDF text from blob URL: {pdf_url}")
            return text
        except Exception as e:
            self.logger.error(f"Failed to extract PDF context from blob: {e}")
            return None
