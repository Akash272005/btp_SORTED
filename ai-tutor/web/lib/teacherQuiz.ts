import { mcqOptionText } from "@/lib/quizQuestions";

/** Upper bound for NCERT AI generate count (must match backend `MAX_NCERT_QUIZ_GENERATE_QUESTIONS`). */
export const MAX_NCERT_QUIZ_GENERATE_QUESTIONS = 100;

/** Format API duration (seconds) for toast / UI, e.g. "2m 14s". */
export function formatGenerationDuration(secs: number | null | undefined): string {
  if (secs == null || !Number.isFinite(secs) || secs < 0) return "";
  const total = Math.round(secs);
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

/** LMS quiz builder question shape (stored in API / DB). */
export type TeacherQuizQuestion = {
  id: string;
  type: "mcq" | "short_answer";
  text: string;
  marks: number;
  options?: string[];
  correct_answer?: string;
  source?: "ncert_ai" | "manual";
};

export function totalMarks(questions: TeacherQuizQuestion[]): number {
  return questions.reduce((s, q) => s + (q.marks || 1), 0);
}

/** Normalize MCQ options to plain text; match correct_answer after strip. */
export function normalizeMcqQuestion(q: TeacherQuizQuestion): TeacherQuizQuestion {
  if (q.type !== "mcq" || !q.options?.length) return q;
  const options = q.options.map((o) => mcqOptionText(o));
  const correctRaw = mcqOptionText(q.correct_answer ?? "");
  const correct =
    options.find((o) => o === correctRaw) ??
    options.find((o) => o === (q.correct_answer ?? "").trim()) ??
    options[0];
  return { ...q, options, correct_answer: correct };
}

export function newManualQuestionId(): string {
  return `q-manual-${Date.now().toString(36)}`;
}

/** Restore quiz questions from API JSON into builder state. */
export function mapLoadedQuizQuestions(
  raw: Array<Record<string, unknown>> | undefined | null,
): TeacherQuizQuestion[] {
  if (!raw?.length) return [];
  return raw.map((q) => {
    const type =
      q.type === "short_answer" ? ("short_answer" as const) : ("mcq" as const);
    const base: TeacherQuizQuestion = {
      id: String(q.id ?? newManualQuestionId()),
      type,
      text: String(q.text ?? ""),
      marks: Number(q.marks) || 1,
      options: Array.isArray(q.options)
        ? (q.options as unknown[]).map(String)
        : undefined,
      correct_answer: q.correct_answer ? String(q.correct_answer) : undefined,
      source:
        q.source === "ncert_ai" || q.source === "manual"
          ? q.source
          : undefined,
    };
    return type === "mcq" ? normalizeMcqQuestion(base) : base;
  });
}

export function parseNcertPathFromUrl(
  pdfUrl: string,
  manifest: Record<string, Record<string, { url: string; label: string }[]>> | null,
): { ncertClass: string; subject: string; chapterLabel: string } | null {
  if (!manifest) return null;
  for (const cls of Object.keys(manifest)) {
    for (const subj of Object.keys(manifest[cls])) {
      const match = manifest[cls][subj].find((f) => f.url === pdfUrl);
      if (match) {
        return {
          ncertClass: cls.replace("class-", ""),
          subject: subj.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
          chapterLabel: match.label,
        };
      }
    }
  }
  return null;
}
