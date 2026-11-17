import { loadFromStorage, removeFromStorage, saveToStorage } from "@/lib/persistence";
import type { TeacherQuizQuestion } from "@/lib/teacherQuiz";

export type QuizBuilderSaveStatus = "draft" | "published" | null;

export type QuizBuilderDraft = {
  pdfUrl: string;
  chapterLabel: string;
  ncertClass: string;
  subject: string;
  questionCount: number;
  marksPerQuestion: number;
  examDurationMins: number;
  questions: TeacherQuizQuestion[];
  quizTitle: string;
  savedQuizId: string | null;
  saveStatus: QuizBuilderSaveStatus;
};

const DRAFT_KEY = "teacher-quiz-builder-draft";

export function draftStorageKey(userId: number | undefined): string {
  return userId ? `${DRAFT_KEY}-u${userId}` : DRAFT_KEY;
}

export const EMPTY_QUIZ_BUILDER_DRAFT: QuizBuilderDraft = {
  pdfUrl: "",
  chapterLabel: "",
  ncertClass: "",
  subject: "Science",
  questionCount: 5,
  marksPerQuestion: 1,
  examDurationMins: 30,
  questions: [],
  quizTitle: "",
  savedQuizId: null,
  saveStatus: null,
};

export function isQuizBuilderDraftEmpty(draft: QuizBuilderDraft): boolean {
  return (
    draft.questions.length === 0 &&
    !draft.savedQuizId &&
    !draft.quizTitle.trim() &&
    !draft.pdfUrl
  );
}

export function loadQuizBuilderDraft(
  userId: number | undefined,
): QuizBuilderDraft | null {
  const stored = loadFromStorage<QuizBuilderDraft | null>(
    draftStorageKey(userId),
    null,
  );
  if (!stored || isQuizBuilderDraftEmpty(stored)) return null;
  return {
    ...EMPTY_QUIZ_BUILDER_DRAFT,
    ...stored,
    questions: Array.isArray(stored.questions) ? stored.questions : [],
  };
}

export function saveQuizBuilderDraft(
  userId: number | undefined,
  draft: QuizBuilderDraft,
): void {
  if (isQuizBuilderDraftEmpty(draft)) {
    clearQuizBuilderDraft(userId);
    return;
  }
  saveToStorage(draftStorageKey(userId), draft);
}

export function clearQuizBuilderDraft(userId: number | undefined): void {
  removeFromStorage(draftStorageKey(userId));
}

/** Clear browser draft when that quiz was deleted from My Quizzes. */
export function clearQuizBuilderDraftForQuiz(
  userId: number | undefined,
  quizId: string,
): boolean {
  const draft = loadQuizBuilderDraft(userId);
  if (!draft?.savedQuizId || draft.savedQuizId !== quizId) {
    return false;
  }
  clearQuizBuilderDraft(userId);
  return true;
}
