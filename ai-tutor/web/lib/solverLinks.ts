/** Deep links and cross-feature URLs for Smart Solver (Phase 5). */

export function buildSolverQuestionUrl(
  question: string,
  options?: { mode?: "check"; tab?: "type" | "draw" | "upload" },
): string {
  const params = new URLSearchParams();
  const trimmed = question.trim();
  if (trimmed) params.set("question", trimmed.slice(0, 2000));
  if (options?.mode === "check") params.set("mode", "check");
  if (options?.tab) params.set("tab", options.tab);
  const q = params.toString();
  return q ? `/solver?${q}` : "/solver";
}

export function buildSimilarQuestionUrl(topic: string, kb: string): string {
  const params = new URLSearchParams({
    topic: topic.trim().slice(0, 500),
    kb: kb.trim(),
    similar: "1",
  });
  return `/question?${params.toString()}`;
}

export function buildCheckWorkPrompt(question: string, attempt: string): string {
  const q = question.trim();
  const a = attempt.trim();
  // Used by Check my work mode — hints only, not a full solution dump.
  return [
    "Review the student's homework attempt. Do NOT give the full solution unless their work is wrong or incomplete.",
    "Point out specific mistakes, give hints for the next step, and praise correct steps.",
    "",
    "Question:",
    q,
    "",
    "Student's attempt:",
    a || "(no written attempt — review any diagram or sketch described above)",
  ].join("\n");
}
