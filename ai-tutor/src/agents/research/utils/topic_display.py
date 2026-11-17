"""Short topic labels for UI and reporting prompts (no NCERT excerpt blobs)."""


def strip_topic_for_display(text: str, max_len: int = 280) -> str:
    t = (text or "").strip()
    for marker in (
        "Use this NCERT chapter excerpt",
        "NCERT chapter scope:",
        "PDF source:",
    ):
        idx = t.find(marker)
        if idx > 0:
            t = t[:idx].strip()
    if t.lower().startswith("research topic (user):"):
        t = t.split(":", 1)[1].strip()
    one_line = " ".join(t.split())
    if len(one_line) <= max_len:
        return one_line
    return f"{one_line[:max_len]}…"
