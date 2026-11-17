import { isMcq, mcqOptionText, type QuizQuestion } from "@/lib/quizQuestions";
import { studentQuizAttemptUi } from "@/lib/studentQuizAttemptUi";
import { StudentQuizMarkReviewButton } from "@/components/lms/student/StudentQuizSubmitFooter";

const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export default function StudentQuizQuestionBlock({
  question,
  index,
  answer,
  marked,
  onAnswer,
  onToggleReview,
}: {
  question: QuizQuestion;
  index: number;
  answer: string;
  marked: boolean;
  onAnswer: (value: string) => void;
  onToggleReview: () => void;
}) {
  const answered = answer.trim().length > 0;
  const sectionClass = marked
    ? studentQuizAttemptUi.questionSectionReview
    : answered
      ? studentQuizAttemptUi.questionSectionAnswered
      : "";

  return (
    <section
      id={`quiz-question-${index}`}
      className={`${studentQuizAttemptUi.questionSection} ${sectionClass}`.trim()}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-slate-900">Q{index + 1}.</p>
        <StudentQuizMarkReviewButton marked={marked} onToggle={onToggleReview} />
      </div>

      <p className="text-base font-semibold leading-relaxed text-slate-900">
        {question.text}
      </p>

      {isMcq(question) ? (
        <div className="mt-4 space-y-2.5">
          {question.options!.map((opt, oi) => {
            const selected = answer === opt;
            const letter = OPTION_LETTERS[oi] ?? String.fromCharCode(65 + oi);
            return (
              <button
                key={`${question.id}-opt-${oi}`}
                type="button"
                onClick={() => onAnswer(opt)}
                className={`${studentQuizAttemptUi.optionBase} ${
                  selected
                    ? studentQuizAttemptUi.optionSelected
                    : studentQuizAttemptUi.optionIdle
                }`}
              >
                <span
                  className={
                    selected
                      ? studentQuizAttemptUi.optionLetterActive
                      : studentQuizAttemptUi.optionLetterIdle
                  }
                >
                  {letter}
                </span>
                <span
                  className={`pt-0.5 ${
                    selected ? "font-medium text-slate-900" : "text-slate-800"
                  }`}
                >
                  {mcqOptionText(opt)}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <textarea
          className="mt-4 w-full rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-sm shadow-sm transition-colors focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          rows={4}
          placeholder="Type your answer here…"
          value={answer}
          onChange={(e) => onAnswer(e.target.value)}
        />
      )}
    </section>
  );
}

export function StudentQuizQuestionDivider() {
  return (
    <div
      className={studentQuizAttemptUi.questionDivider}
      role="separator"
      aria-hidden
    />
  );
}
