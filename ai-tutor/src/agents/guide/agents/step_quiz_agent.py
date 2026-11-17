#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
StepQuizAgent - Generate two quiz questions for current guided step.
"""

import json
import re
from typing import Any

from src.agents.base_agent import BaseAgent
from src.utils.content_filter import content_filter_safe_text, is_content_filter_error

_SYSTEM_SAFETY_SUFFIX = (
    "\n\nThis is standard school/NCERT educational material for students. "
    "Use neutral academic language only. Do not include sensitive or political content."
)


class StepQuizAgent(BaseAgent):
    """Generates exactly two MCQs based on current step content only."""

    _THINKING_BLOCKS = re.compile(
        r"<(?:think|thinking|redacted_reasoning|thought)>[\s\S]*?</(?:think|thinking|redacted_reasoning|thought)>",
        re.IGNORECASE,
    )

    def __init__(
        self,
        api_key: str,
        base_url: str,
        language: str = "en",
        api_version: str | None = None,
        binding: str = "openai",
    ):
        super().__init__(
            module_name="guide",
            agent_name="step_quiz_agent",
            api_key=api_key,
            base_url=base_url,
            api_version=api_version,
            language=language,
            binding=binding,
        )

    def _strip_llm_noise(self, text: str) -> str:
        raw = (text or "").strip()
        if raw.startswith("\ufeff"):
            raw = raw.lstrip("\ufeff").strip()
        raw = self._THINKING_BLOCKS.sub("", raw).strip()
        return raw

    def _coerce_quiz_payload(self, obj: Any) -> dict[str, Any] | None:
        """Accept dict schema or a bare list of two question objects."""
        if isinstance(obj, dict):
            return obj
        if isinstance(obj, list) and len(obj) == 2:
            return {"questions": obj, "encouragement": "Nice, go ahead."}
        return None

    def _parse_json_object(self, snippet: str) -> dict[str, Any] | None:
        """Parse one JSON object (or coerced quiz payload) from a string fragment."""
        snippet = (snippet or "").strip()
        if not snippet:
            return None
        try:
            obj = json.loads(snippet)
            return self._coerce_quiz_payload(obj)
        except json.JSONDecodeError:
            pass
        dec = json.JSONDecoder()
        bracket = snippet.find("[")
        brace = snippet.find("{")
        if bracket >= 0 and (brace < 0 or bracket < brace):
            try:
                obj, _end = dec.raw_decode(snippet, bracket)
                got = self._coerce_quiz_payload(obj)
                if got:
                    return got
            except json.JSONDecodeError:
                pass
        if brace >= 0:
            try:
                obj, _end = dec.raw_decode(snippet, brace)
                return self._coerce_quiz_payload(obj)
            except json.JSONDecodeError:
                pass
        return None

    def _extract_json(self, text: str) -> dict[str, Any] | None:
        raw = self._strip_llm_noise(text)
        if not raw:
            return None

        data = self._parse_json_object(raw)
        if data:
            return data

        fenced = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", raw, re.IGNORECASE)
        if fenced:
            inner = fenced.group(1).strip()
            data = self._parse_json_object(inner)
            if data:
                return data

        return None

    def _normalize_questions(self, data: dict[str, Any]) -> dict[str, Any]:
        questions = data.get("questions") or []
        encouragement = str(data.get("encouragement") or "").strip() or "Nice, go ahead."
        if not isinstance(questions, list) or len(questions) != 2:
            return {"success": False, "error": "Quiz must contain exactly 2 questions"}

        normalized: list[dict[str, Any]] = []
        for q in questions:
            if not isinstance(q, dict):
                continue
            options = q.get("options")
            if not isinstance(options, list) or len(options) != 4:
                continue
            try:
                ci = int(q.get("correct_index"))
            except (TypeError, ValueError):
                continue
            if ci < 0 or ci > 3:
                continue
            normalized.append(
                {
                    "question": str(q.get("question") or "").strip(),
                    "options": [str(o) for o in options],
                    "correct_index": ci,
                    "explanation": str(q.get("explanation") or "").strip(),
                }
            )

        if len(normalized) != 2:
            return {"success": False, "error": "Invalid quiz question format"}

        return {"success": True, "items": normalized, "encouragement": encouragement}

    def _fallback_quiz(self, knowledge_title: str) -> dict[str, Any]:
        """Deterministic quiz when the provider blocks all LLM attempts."""
        topic = (knowledge_title or "this lesson").strip()[:160]
        items = [
            {
                "question": f"What is the main focus of the lesson on \"{topic}\"?",
                "options": [
                    f"Key concepts and ideas about {topic}",
                    "Unrelated topics from other subjects",
                    "Only exam dates and schedules",
                    "Content not covered in the lesson",
                ],
                "correct_index": 0,
                "explanation": "The lesson is designed around this topic's core ideas.",
            },
            {
                "question": f"How can you best check your understanding of \"{topic}\"?",
                "options": [
                    "Review the lesson summary and practice with examples",
                    "Skip all practice questions",
                    "Ignore the lesson and move on",
                    "Memorize unrelated facts only",
                ],
                "correct_index": 0,
                "explanation": "Reviewing lesson material helps reinforce learning.",
            },
        ]
        return {
            "success": True,
            "items": items,
            "encouragement": "Great effort — keep going!",
            "fallback": True,
        }

    async def _generate_from_prompts(
        self, user_prompt: str, system_prompt: str
    ) -> dict[str, Any]:
        response = await self.call_llm(
            user_prompt=user_prompt,
            system_prompt=system_prompt,
            response_format={"type": "json_object"},
            stage="step_quiz",
        )
        data = self._extract_json(response)
        if not data:
            preview = ((response or "").strip().replace("\n", " "))[:320]
            self.logger.warning(
                f"step_quiz: JSON parse failed. preview={preview!r}"
            )
            return {"success": False, "error": "Could not parse quiz response"}
        return self._normalize_questions(data)

    async def process(self, knowledge_title: str, lesson_text: str) -> dict[str, Any]:
        title = knowledge_title or "Current Step"
        try:
            return await self._process_quiz(title, lesson_text)
        except Exception as e:
            self.logger.error(f"step_quiz: unexpected error, using fallback: {e}")
            return self._fallback_quiz(title)

    async def _process_quiz(self, title: str, lesson_text: str) -> dict[str, Any]:
        system_prompt = self.get_prompt("system")
        user_template = self.get_prompt("user_template")
        if not system_prompt or not user_template:
            return {"success": False, "error": "Missing step_quiz_agent prompts"}

        lesson = lesson_text or ""
        system_with_safety = system_prompt + _SYSTEM_SAFETY_SUFFIX

        attempts: list[tuple[str, str, str]] = [
            (
                "full",
                user_template.format(knowledge_title=title, lesson_text=lesson[:14000]),
                system_prompt,
            ),
            (
                "softened",
                user_template.format(
                    knowledge_title=title,
                    lesson_text=content_filter_safe_text(lesson, max_chars=8000),
                ),
                system_with_safety,
            ),
            (
                "title_summary",
                user_template.format(
                    knowledge_title=title,
                    lesson_text=(
                        f"Create quiz questions using only this topic title and a brief summary. "
                        f"Topic: {title}. "
                        f"Context excerpt: {content_filter_safe_text(lesson, max_chars=2000)}"
                    ),
                ),
                system_with_safety,
            ),
        ]

        last_error = "Quiz generation failed"
        for attempt_name, user_prompt, sys_prompt in attempts:
            try:
                result = await self._generate_from_prompts(user_prompt, sys_prompt)
                if result.get("success"):
                    return result
                last_error = str(result.get("error") or last_error)
                self.logger.warning(
                    f"step_quiz: attempt {attempt_name} failed: {last_error}"
                )
            except Exception as e:
                last_error = str(e)
                if is_content_filter_error(e):
                    self.logger.warning(
                        f"step_quiz: content filter on {attempt_name} attempt, retrying"
                    )
                    continue
                self.logger.error(f"LLM call failed: {e}")
                return {"success": False, "error": last_error}

        self.logger.warning(
            f"step_quiz: all LLM attempts failed (last={last_error}); using template fallback"
        )
        return self._fallback_quiz(title)
