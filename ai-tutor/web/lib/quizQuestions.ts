/** Question shapes returned by LMS APIs (correct_answer stripped for students). */

export type QuizQuestion = {
  id: string;
  type: "mcq" | "short_answer" | string;
  text: string;
  marks?: number;
  options?: string[];
};

export function isMcq(q: QuizQuestion): boolean {
  return q.type === "mcq" && Array.isArray(q.options) && q.options.length > 0;
}

const OPTION_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** Letter label for MCQ option index (0 → A, 1 → B, …). */
export function mcqOptionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

/** Strip leading "A." / "B)" if already present in generated text. */
export function mcqOptionText(text: string): string {
  return String(text ?? "")
    .trim()
    .replace(/^[A-Za-z][.)]\s*/, "");
}

/** Display string: "A. option text" */
export function formatMcqOptionDisplay(index: number, text: string): string {
  const body = mcqOptionText(text);
  return `${mcqOptionLetter(index)}. ${body}`;
}

/** Answer key line: "(B) option text" when correct answer matches an option. */
export function formatMcqAnswerDisplay(
  options: string[] | undefined,
  correctAnswer: string | undefined,
): string {
  const raw = String(correctAnswer ?? "").trim();
  if (!raw) return "— not set yet";
  if (!options?.length) return raw;

  const idx = options.findIndex((o) => String(o).trim() === raw);
  if (idx >= 0) {
    return `(${mcqOptionLetter(idx)}) ${mcqOptionText(raw)}`;
  }

  const letterMatch = raw.match(/^([A-Za-z])[.)]?\s*(.*)$/);
  if (letterMatch) {
    const letter = letterMatch[1].toUpperCase();
    const letterIdx = OPTION_LETTERS.indexOf(letter);
    if (letterIdx >= 0 && options[letterIdx]) {
      const body = letterMatch[2]?.trim() || mcqOptionText(options[letterIdx]);
      return `(${letter}) ${body}`;
    }
  }

  return raw;
}
