"""
StartWritingAgent - Initial NCERT-grounded document for Co-Writer.
"""

from datetime import datetime
from typing import Any, Literal
import uuid

from src.agents.base_agent import BaseAgent
from src.agents.co_writer.edit_agent import (
    extract_citations,
    resolve_kb_name,
    save_tool_call,
)
from src.tools.rag_tool import rag_search
from src.tools.web_search import web_search

SourceType = Literal["rag", "web", "both"] | None
Perspective = Literal["teacher", "student"]

THINKING_SYSTEM_SUFFIX = (
    "\n\nUse deep step-by-step reasoning internally before writing. "
    "Output only the final polished markdown document—no chain-of-thought."
)


class StartWritingAgent(BaseAgent):
    """Generate an initial markdown draft grounded in NCERT and optional web sources."""

    def __init__(self, language: str = "en"):
        super().__init__(
            module_name="co_writer",
            agent_name="start_writing_agent",
            language=language,
        )

    async def process(
        self,
        class_key: str,
        subject_key: str,
        chapter_label: str | None = None,
        kb_name: str | None = None,
        description: str | None = None,
        perspective: Perspective = "teacher",
        source: SourceType = "rag",
        enable_thinking: bool = False,
        **_: Any,
    ) -> dict[str, Any]:
        return await self.start_writing(
            class_key=class_key,
            subject_key=subject_key,
            chapter_label=chapter_label,
            kb_name=kb_name,
            description=description,
            perspective=perspective,
            source=source,
            enable_thinking=enable_thinking,
        )

    def _build_query(
        self,
        class_key: str,
        subject_key: str,
        chapter_label: str | None,
        description: str | None,
        perspective: Perspective,
    ) -> str:
        chapter_part = f" chapter {chapter_label}" if chapter_label else ""
        role = "class preparation notes" if perspective == "teacher" else "student study notes"
        base = (
            f"NCERT Class {class_key.replace('class-', '')} "
            f"{subject_key.replace('-', ' ')}{chapter_part} {role}"
        )
        if description:
            return f"{base}. {description}"
        return base

    async def start_writing(
        self,
        class_key: str,
        subject_key: str,
        chapter_label: str | None = None,
        kb_name: str | None = None,
        description: str | None = None,
        perspective: Perspective = "teacher",
        source: SourceType = "rag",
        enable_thinking: bool = False,
    ) -> dict[str, Any]:
        operation_id = datetime.now().strftime("%Y%m%d_%H%M%S") + "_" + uuid.uuid4().hex[:6]
        resolved_kb = resolve_kb_name(kb_name, class_key, subject_key)
        query = self._build_query(class_key, subject_key, chapter_label, description, perspective)

        context_parts: list[str] = []
        citations: list[dict[str, Any]] = []
        tool_call_file = None

        if source in ("rag", "both") and resolved_kb:
            self.logger.info(f"Start writing RAG in KB {resolved_kb}: {query}")
            try:
                search_result = await rag_search(
                    query=query,
                    kb_name=resolved_kb,
                    mode="naive",
                    only_need_context=True,
                )
                rag_context = search_result.get("answer", "") or search_result.get("content", "")
                if rag_context:
                    context_parts.append(f"NCERT textbook excerpts:\n{rag_context}")
                citations.extend(extract_citations(search_result, resolved_kb, "rag"))
                tool_call_file = save_tool_call(
                    operation_id,
                    "rag",
                    {
                        "type": "rag",
                        "timestamp": datetime.now().isoformat(),
                        "operation_id": operation_id,
                        "query": query,
                        "kb_name": resolved_kb,
                        "perspective": perspective,
                        "context": rag_context,
                        "raw_result": search_result,
                    },
                )
            except Exception as e:
                self.logger.error(f"Start writing RAG failed: {e}")

        if source in ("web", "both"):
            self.logger.info(f"Start writing web search: {query}")
            try:
                web_result = web_search(query)
                web_context = web_result.get("answer", "")
                if web_context:
                    context_parts.append(f"Web reference material:\n{web_context}")
                citations.extend(extract_citations(web_result, None, "web"))
                save_tool_call(
                    operation_id,
                    "web",
                    {
                        "type": "web_search",
                        "timestamp": datetime.now().isoformat(),
                        "operation_id": operation_id,
                        "query": query,
                        "answer": web_context,
                        "citations": web_result.get("citations", []),
                    },
                )
            except Exception as e:
                self.logger.error(f"Start writing web search failed: {e}")

        context = "\n\n---\n\n".join(context_parts)

        if perspective == "student":
            system_prompt = self.get_prompt(
                "perspective_student_system",
                "You are a helpful tutor writing clear study notes for Indian school students.",
            )
            template_key = "template_start_student"
        else:
            system_prompt = self.get_prompt(
                "perspective_teacher_system",
                "You are an experienced NCERT teacher preparing class materials.",
            )
            template_key = "template_start_teacher"

        template_prompt = self.get_prompt(
            template_key,
            "Write a structured markdown document.",
        )

        user_parts = [
            template_prompt.format(
                class_key=class_key,
                subject_key=subject_key.replace("-", " "),
                chapter_label=chapter_label or "the selected topic",
            )
        ]
        if context:
            context_template = self.get_prompt(
                "context_template", "Reference material:\n{context}\n\n"
            )
            user_parts.append(context_template.format(context=context))
        if description:
            user_parts.append(f"User instructions: {description}\n")
        user_parts.append(
            self.get_prompt(
                "output_template",
                "Output only the markdown document, no preamble or explanation.",
            )
        )
        user_prompt = "\n".join(user_parts)

        if enable_thinking:
            system_prompt += THINKING_SYSTEM_SUFFIX

        content = await self.call_llm(
            user_prompt=user_prompt,
            system_prompt=system_prompt,
            stage=f"start_writing_{perspective}",
            temperature=0.2 if enable_thinking else None,
        )

        return {
            "content": content.strip(),
            "operation_id": operation_id,
            "kb_name": resolved_kb,
            "perspective": perspective,
            "citations": citations,
            "tool_call_file": tool_call_file,
        }
