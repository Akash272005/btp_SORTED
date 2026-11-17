"""LMS shared limits (keep API schema and services in sync)."""

# NCERT AI quiz generation — upper bound to avoid accidental huge LLM bills / timeouts.
# Raise this constant if you need larger papers; frontend should match.
MAX_NCERT_QUIZ_GENERATE_QUESTIONS = 100
