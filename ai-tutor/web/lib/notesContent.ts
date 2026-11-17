/** Convert markdown-ish text to simple HTML for student notes. */
export function markdownToNoteHtml(text: string): string {
  const lines = (text || "").trim().split("\n");
  const blocks: string[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (listItems.length) {
      blocks.push(
        "<ul>" + listItems.map((i) => `<li>${escapeHtml(i)}</li>`).join("") + "</ul>",
      );
      listItems = [];
    }
  };

  for (const line of lines) {
    const stripped = line.trim();
    if (!stripped) {
      flushList();
      continue;
    }
    if (stripped.startsWith("### ")) {
      flushList();
      blocks.push(`<h3>${escapeHtml(stripped.slice(4))}</h3>`);
    } else if (stripped.startsWith("## ")) {
      flushList();
      blocks.push(`<h2>${escapeHtml(stripped.slice(3))}</h2>`);
    } else if (stripped.startsWith("# ")) {
      flushList();
      blocks.push(`<h1>${escapeHtml(stripped.slice(2))}</h1>`);
    } else if (stripped.startsWith("- ") || stripped.startsWith("* ")) {
      listItems.push(stripped.slice(2));
    } else {
      flushList();
      blocks.push(`<p>${escapeHtml(stripped)}</p>`);
    }
  }
  flushList();
  return blocks.join("") || "<p></p>";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wrap selected plain text as a highlighted block for the editor. */
export function selectionToHighlightedHtml(text: string): string {
  const safe = escapeHtml(text.trim());
  return `<p><mark>${safe}</mark></p>`;
}

/** Append HTML fragment to existing note body. */
export function appendHtmlFragment(existing: string, fragment: string): string {
  const base = (existing || "").trim() || "<p></p>";
  return `${base}${fragment}`;
}
