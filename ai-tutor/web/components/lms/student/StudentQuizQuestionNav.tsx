import { studentQuizAttemptUi } from "@/lib/studentQuizAttemptUi";
import type { QuizQuestion } from "@/lib/quizQuestions";

function navDotClass(answered: boolean, marked: boolean): string {
  const base = studentQuizAttemptUi.navDot;
  if (answered) return `${base} ${studentQuizAttemptUi.navDotAnswered}`;
  if (marked) return `${base} ${studentQuizAttemptUi.navDotReview}`;
  return `${base} ${studentQuizAttemptUi.navDotEmpty}`;
}

/** Question jump palette only — submit lives in toolbar + answer sheet footer. */
export default function StudentQuizQuestionNav({
  questions,
  answers,
  markedForReview,
  onJumpTo,
}: {
  questions: QuizQuestion[];
  answers: Record<string, string>;
  markedForReview: Set<string>;
  onJumpTo: (index: number) => void;
}) {
  const answeredCount = questions.filter(
    (q) => (answers[q.id] ?? "").trim().length > 0,
  ).length;

  return (
    <div
      className={`${studentQuizAttemptUi.sidePanel} lg:sticky lg:top-24 lg:self-start`}
    >
      <div className={studentQuizAttemptUi.sidePanelHeader}>Jump to question</div>
      <div className="p-4">
        <p className="mb-3 text-xs font-medium text-slate-600">
          {answeredCount} of {questions.length} answered
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {questions.map((q, i) => {
            const answered = (answers[q.id] ?? "").trim().length > 0;
            const marked = markedForReview.has(q.id);
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => onJumpTo(i)}
                className={navDotClass(answered, marked)}
                aria-label={`Go to question ${i + 1}${marked ? ", marked for review" : ""}${answered ? ", answered" : ""}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-emerald-200" aria-hidden />
            Answered
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-200" aria-hidden />
            Review
          </span>
        </div>
      </div>
    </div>
  );
}
