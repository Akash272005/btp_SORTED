#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
NoteAgent - Recording Agent
Responsible for information compression and summary generation, converting raw data returned by tools into usable knowledge summaries
"""

from pathlib import Path
from string import Template
import sys
from typing import Any, Optional

project_root = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(project_root))

import json
import logging

from src.agents.base_agent import BaseAgent
from src.agents.research.data_structures import ToolTrace

from ..utils.json_utils import extract_json_from_text

# Keep NoteAgent prompts small — large RAG payloads often cause Azure connection resets.
NOTE_SUMMARY_RAW_MAX_CHARS = 12_000


class NoteAgent(BaseAgent):
    """Recording Agent"""

    def __init__(
        self,
        config: dict[str, Any],
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        api_version: Optional[str] = None,
    ):
        language = config.get("system", {}).get("language", "zh")
        super().__init__(
            module_name="research",
            agent_name="note_agent",
            api_key=api_key,
            base_url=base_url,
            api_version=api_version,
            language=language,
            config=config,
        )
        self._logger = logging.getLogger("Research.note_agent")

    @staticmethod
    def _prepare_raw_for_summary(raw_answer: str) -> str:
        if len(raw_answer) <= NOTE_SUMMARY_RAW_MAX_CHARS:
            return raw_answer
        return ToolTrace._truncate_raw_answer(raw_answer, NOTE_SUMMARY_RAW_MAX_CHARS)

    @staticmethod
    def _fallback_summary(raw_answer: str, query: str, tool_type: str) -> str:
        """Use when the summary LLM fails — keeps research running."""
        text = raw_answer
        try:
            data = json.loads(raw_answer)
            if isinstance(data, dict):
                for key in ("answer", "content", "text", "response"):
                    if isinstance(data.get(key), str) and data[key].strip():
                        text = data[key]
                        break
        except (json.JSONDecodeError, TypeError):
            pass
        text = " ".join(text.split())
        excerpt = text[:2500]
        if len(text) > 2500:
            excerpt += "... [truncated fallback summary]"
        return (
            f"[{tool_type}] Query: {query}\n\n"
            f"Summary (auto-generated after LLM unavailable):\n{excerpt}"
        )

    async def process(
        self,
        tool_type: str,
        query: str,
        raw_answer: str,
        citation_id: str,
        topic: str = "",
        context: str = "",
    ) -> ToolTrace:
        """
        Process raw data returned by tool, generate summary and create ToolTrace

        Args:
            tool_type: Tool type
            query: Query statement
            raw_answer: Raw answer returned by tool
            citation_id: Citation ID (REQUIRED, must be obtained from CitationManager)
            topic: Topic (for context)
            context: Additional context

        Returns:
            ToolTrace object

        Note:
            citation_id must be obtained from CitationManager before calling this method.
            Use CitationManager.get_next_citation_id() or its async variant.
        """
        print(f"\n{'=' * 70}")
        print("📝 NoteAgent - Information Recording and Summary")
        print(f"{'=' * 70}")
        print(f"Tool: {tool_type}")
        print(f"Query: {query}")
        print(f"Citation ID: {citation_id}")
        print(f"Raw Answer Length: {len(raw_answer)} characters\n")

        # Generate summary
        summary = await self._generate_summary(
            tool_type=tool_type, query=query, raw_answer=raw_answer, topic=topic, context=context
        )

        print(f"✓ Summary generation completed ({len(summary)} characters)")

        # Create ToolTrace with the provided citation ID
        tool_id = self._generate_tool_id()
        trace = ToolTrace(
            tool_id=tool_id,
            citation_id=citation_id,
            tool_type=tool_type,
            query=query,
            raw_answer=raw_answer,
            summary=summary,
        )

        return trace

    @staticmethod
    def _convert_to_template_format(template_str: str) -> str:
        """
        Convert {var} style placeholders to $var style for string.Template.
        This avoids conflicts with LaTeX braces like {\rho}.
        """
        import re

        # Only convert simple {var_name} patterns, not nested or complex ones
        return re.sub(r"\{(\w+)\}", r"$\1", template_str)

    async def _generate_summary(
        self, tool_type: str, query: str, raw_answer: str, topic: str = "", context: str = ""
    ) -> str:
        """
        Generate summary

        Args:
            tool_type: Tool type
            query: Query statement
            raw_answer: Raw answer
            topic: Topic
            context: Additional context

        Returns:
            Generated summary
        """
        system_prompt = self.get_prompt("system", "role")
        if not system_prompt:
            raise ValueError(
                "NoteAgent missing system prompt, please configure system.role in prompts/{lang}/note_agent.yaml"
            )

        user_prompt_template = self.get_prompt("process", "generate_summary")
        if not user_prompt_template:
            raise ValueError(
                "NoteAgent missing generate_summary prompt, please configure process.generate_summary in prompts/{lang}/note_agent.yaml"
            )

        # Use string.Template to avoid conflicts with LaTeX braces like {\rho}
        # Convert {var} to $var format, then use safe_substitute
        template_str = self._convert_to_template_format(user_prompt_template)
        raw_for_llm = self._prepare_raw_for_summary(raw_answer)
        if len(raw_answer) > len(raw_for_llm):
            self._logger.info(
                "Truncated raw_answer for summary LLM: %s -> %s chars",
                len(raw_answer),
                len(raw_for_llm),
            )

        template = Template(template_str)
        user_prompt = template.safe_substitute(
            tool_type=tool_type,
            query=query,
            raw_answer=raw_for_llm,
            topic=topic,
            context=context,
        )

        try:
            response = await self.call_llm(
                user_prompt=user_prompt,
                system_prompt=system_prompt,
                stage="generate_summary",
                verbose=False,
            )
        except Exception as exc:
            self._logger.warning(
                "Summary LLM failed (%s); using local excerpt fallback", exc
            )
            return self._fallback_summary(raw_answer, query, tool_type)

        # Parse JSON output (strict validation)
        from ..utils.json_utils import ensure_json_dict, ensure_keys

        data = extract_json_from_text(response)
        try:
            obj = ensure_json_dict(data)
            ensure_keys(obj, ["summary"])
            summary = obj.get("summary", "")
            # Ensure summary is string type
            if not isinstance(summary, str):
                summary = str(summary) if summary else ""
            if summary.strip():
                return summary
        except Exception:
            pass
        # Fallback: directly use text prefix
        if response and response.strip():
            return response[:1000]
        return self._fallback_summary(raw_answer, query, tool_type)

    def _generate_tool_id(self) -> str:
        """Generate tool ID"""
        import time

        timestamp = int(time.time() * 1000)
        return f"tool_{timestamp}"


__all__ = ["NoteAgent"]
