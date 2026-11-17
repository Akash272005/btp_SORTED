#!/usr/bin/env python
"""
LocateAgent - Agent for locating and organizing knowledge points
Analyzes notebook content and generates progressive knowledge point learning plans
"""

import json
from typing import Any, Optional

from src.agents.base_agent import BaseAgent


class LocateAgent(BaseAgent):
    """Knowledge point location agent"""

    _MAX_OUTPUT_LEN_DEFAULT = 2000
    _MAX_OUTPUT_LEN_NCERT_PDF = 100_000

    def __init__(
        self,
        api_key: str,
        base_url: str,
        language: str = "zh",
        api_version: Optional[str] = None,
        binding: str = "openai",
    ):
        super().__init__(
            module_name="guide",
            agent_name="locate_agent",
            api_key=api_key,
            base_url=base_url,
            api_version=api_version,
            language=language,
            binding=binding,
        )

    def _format_records(self, records: list[dict[str, Any]]) -> str:
        """Format notebook records as readable text"""
        formatted = []
        for i, record in enumerate(records, 1):
            record_type = record.get("type", "unknown")
            title = record.get("title", "Untitled")
            user_query = record.get("user_query", "")
            output = record.get("output", "")

            cap = (
                self._MAX_OUTPUT_LEN_NCERT_PDF
                if str(record.get("type", "")).lower() == "ncert_pdf"
                else self._MAX_OUTPUT_LEN_DEFAULT
            )
            if len(output) > cap:
                output = output[:cap] + "\n...[Content truncated]..."

            formatted.append(
                f"""
### Record {i} [{record_type.upper()}]
**Title**: {title}

**User Question/Input**:
{user_query}

**System Output**:
{output}
---"""
            )

        return "\n".join(formatted)

    async def process(
        self, notebook_id: str, notebook_name: str, records: list[dict[str, Any]]
    ) -> dict[str, Any]:
        """
        Analyze notebook content and generate knowledge point learning plan

        Args:
            notebook_id: Notebook ID
            notebook_name: Notebook name
            records: List of records in notebook

        Returns:
            Dictionary containing knowledge point list
        """
        if not records:
            return {"success": False, "error": "No records in notebook", "knowledge_points": []}

        system_prompt = self.get_prompt("system")
        if not system_prompt:
            raise ValueError(
                "LocateAgent missing system prompt, please configure system in prompts/{lang}/locate_agent.yaml"
            )

        user_template = self.get_prompt("user_template")
        if not user_template:
            raise ValueError(
                "LocateAgent missing user_template, please configure user_template in prompts/{lang}/locate_agent.yaml"
            )

        records_content = self._format_records(records)

        user_prompt = user_template.format(
            notebook_id=notebook_id,
            notebook_name=notebook_name,
            record_count=len(records),
            records_content=records_content,
        )

        try:
            response = await self.call_llm(
                user_prompt=user_prompt,
                system_prompt=system_prompt,
                response_format={"type": "json_object"},
            )

            try:
                # Strip markdown code blocks if the model returned them
                clean_response = response.strip()
                if clean_response.startswith("```"):
                    lines = clean_response.split("\n")
                    if lines and lines[0].startswith("```"):
                        lines = lines[1:]
                    if lines and lines[-1].strip().startswith("```"):
                        lines = lines[:-1]
                    clean_response = "\n".join(lines).strip()
                
                # If still empty for some reason, return empty array
                if not clean_response:
                    return {
                        "success": False,
                        "error": "LLM returned empty response",
                        "raw_response": response,
                        "knowledge_points": []
                    }

                result = json.loads(clean_response)

                if isinstance(result, list):
                    knowledge_points = result
                elif isinstance(result, dict):
                    knowledge_points = (
                        result.get("knowledge_points")
                        or result.get("points")
                        or result.get("data")
                        or []
                    )
                else:
                    knowledge_points = []

                validated_points = []
                for point in knowledge_points:
                    if isinstance(point, dict):
                        validated_points.append(
                            {
                                "knowledge_title": point.get(
                                    "knowledge_title", "Unnamed knowledge point"
                                ),
                                "knowledge_summary": point.get("knowledge_summary", ""),
                                "user_difficulty": point.get("user_difficulty", ""),
                            }
                        )

                return {
                    "success": True,
                    "knowledge_points": validated_points,
                    "total_points": len(validated_points),
                }

            except json.JSONDecodeError as e:
                return {
                    "success": False,
                    "error": f"JSON parsing failed: {e!s}",
                    "raw_response": response,
                    "knowledge_points": [],
                }

        except Exception as e:
            return {"success": False, "error": str(e), "knowledge_points": []}
