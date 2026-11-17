import type { AttemptSubmitResult } from "@/services/lmsApi";

const PREFIX = "aitutor-quiz-result:";

export type StoredQuizResult = AttemptSubmitResult & {
  assignmentId: string;
  title: string;
  savedAt: string;
};

export function saveQuizResult(
  assignmentId: string,
  title: string,
  result: AttemptSubmitResult,
): void {
  if (typeof window === "undefined") return;
  const payload: StoredQuizResult = {
    ...result,
    assignmentId,
    title,
    savedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(`${PREFIX}${assignmentId}`, JSON.stringify(payload));
}

export function loadQuizResult(assignmentId: string): StoredQuizResult | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(`${PREFIX}${assignmentId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredQuizResult;
  } catch {
    return null;
  }
}
