/** Short label for Deep Research UI — never show full NCERT excerpt in the panel. */
export function sanitizeDisplayTopic(text: string, maxLen = 280): string {
  let t = (text || "").trim();
  const markers = [
    "Use this NCERT chapter excerpt",
    "NCERT chapter scope:",
    "PDF source:",
  ];
  for (const marker of markers) {
    const idx = t.indexOf(marker);
    if (idx > 0) t = t.slice(0, idx).trim();
  }
  if (/^Research topic \(user\):/i.test(t)) {
    t = t.replace(/^Research topic \(user\):\s*/i, "").trim();
  }
  const oneLine = t.replace(/\s+/g, " ");
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen)}…`;
}

export function buildDisplayTopic(
  userText: string,
  chapterTitle?: string,
  optimized?: string,
): string {
  const chapter = (chapterTitle || "").trim();
  const user = (userText || "").trim();
  const core = sanitizeDisplayTopic((optimized || user).trim());
  if (chapter) {
    if (!user || user === chapter) return chapter;
    const shortUser = sanitizeDisplayTopic(user, 120);
    return `${chapter}: ${shortUser}`;
  }
  return core || "Research topic";
}
