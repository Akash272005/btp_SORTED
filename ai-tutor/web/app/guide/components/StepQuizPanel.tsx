"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";
import { useTranslation } from "react-i18next";
import type { StepQuizQuestion } from "../types";

type StepQuizUiState = {
  selectedAnswers: (number | null)[];
  quizSubmitted: boolean;
};

interface StepQuizPanelProps {
  stepKey: number;
  questions: StepQuizQuestion[];
  encouragement: string;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onQuizAttemptStatusChange?: (attempted: boolean) => void;
  /** Called once when the learner submits answers (for outline / persistence). */
  onQuizScoreRecorded?: (score: { correct: number; total: number }) => void;
  persistedState?: StepQuizUiState;
  onPersistedStateChange?: (state: StepQuizUiState) => void;
  canMoveToNext?: boolean;
  isLastKnowledge?: boolean;
  onMoveToNext?: () => void;
  moveToNextLoading?: boolean;
}

export default function StepQuizPanel({
  stepKey,
  questions,
  encouragement,
  loading,
  error,
  onRetry,
  onQuizAttemptStatusChange,
  onQuizScoreRecorded,
  persistedState,
  onPersistedStateChange,
  canMoveToNext = false,
  isLastKnowledge = false,
  onMoveToNext,
  moveToNextLoading = false,
}: StepQuizPanelProps) {
  const { t } = useTranslation();
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>([]);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [showResultModal, setShowResultModal] = useState(false);

  // Track the last stepKey our local state belongs to.
  // When stepKey changes, reset synchronously DURING render (before paint) so
  // the new step's questions never flash with the previous step's answers.
  const [prevStepKey, setPrevStepKey] = useState(stepKey);
  if (prevStepKey !== stepKey) {
    setPrevStepKey(stepKey);
    setSelectedAnswers([]);
    setQuizSubmitted(false);
    setShowResultModal(false);
  }

  // Keep a ref so the restore effect can read the latest persistedState without
  // listing it as a dependency (which would cause an infinite update loop:
  // restore → persist → quizUiByStep update → persistedState ref change → restore…)
  const persistedStateRef = useRef(persistedState);
  persistedStateRef.current = persistedState;

  // Restore from persisted state once questions are available for this step.
  // Only re-runs when stepKey or questions change — NOT when persistedState changes.
  useEffect(() => {
    if (questions.length === 0) return;
    const ps = persistedStateRef.current;
    const canRestore = ps && ps.selectedAnswers.length === questions.length;
    setSelectedAnswers(canRestore ? ps.selectedAnswers : questions.map(() => null));
    setQuizSubmitted(Boolean(canRestore && ps.quizSubmitted));
    // Deliberately do NOT reset showResultModal here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepKey, questions]);

  // Persist state changes up to parent (localStorage via useGuideStepProgress).
  useEffect(() => {
    if (questions.length === 0) return;
    onPersistedStateChange?.({ selectedAnswers, quizSubmitted });
  }, [
    selectedAnswers,
    quizSubmitted,
    onPersistedStateChange,
    questions.length,
  ]);

  const allQuizAnswered = useMemo(
    () =>
      questions.length > 0 &&
      selectedAnswers.length === questions.length &&
      selectedAnswers.every((x) => x !== null),
    [questions, selectedAnswers],
  );

  const correctCount = useMemo(() => {
    let n = 0;
    for (let i = 0; i < questions.length; i++) {
      if (selectedAnswers[i] === questions[i].correct_index) n++;
    }
    return n;
  }, [questions, selectedAnswers]);

  if (loading && questions.length === 0) {
    return (
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 space-y-3"
        aria-busy="true"
        aria-label={t("Generating quiz for this step...")}
      >
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-500 shrink-0" aria-hidden />
          <span>{t("Generating quiz for this step...")}</span>
        </div>
        <div className="space-y-3 animate-pulse pt-2" aria-hidden>
          <div className="h-4 bg-slate-200 dark:bg-slate-600 rounded-md w-3/4" />
          <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded-lg w-full" />
          <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded-lg w-full" />
          <div className="h-10 bg-slate-100 dark:bg-slate-700 rounded-lg w-5/6" />
        </div>
      </div>
    );
  }

  if (error && questions.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-rose-200 dark:border-rose-700 p-4">
        <p className="text-sm text-rose-600 dark:text-rose-300">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 text-sm text-indigo-600 hover:underline"
        >
          {t("Retry")}
        </button>
      </div>
    );
  }

  if (questions.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {t("Step Quiz")}
        </div>
        <button
          type="button"
          onClick={() => {
            const resetAnswers = questions.map(() => null);
            setSelectedAnswers(resetAnswers);
            setQuizSubmitted(false);
            setShowResultModal(false);
            onQuizAttemptStatusChange?.(false);
          }}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
          title={t("Refresh")}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          {t("Refresh")}
        </button>
      </div>
      <div className="space-y-3">
        {questions.map((q, qi) => (
          <div key={qi} className="border border-slate-200 dark:border-slate-600 rounded-lg p-2.5">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-100 mb-2">
              {qi + 1}. {q.question}
            </p>
            <div className="space-y-1.5">
              {q.options.map((opt, oi) => {
                const selected = selectedAnswers[qi] === oi;
                const isCorrect = oi === q.correct_index;
                return (
                  <label
                    key={oi}
                    className={`flex items-start gap-2 rounded-md px-2 py-1.5 border text-sm ${
                      !quizSubmitted
                        ? selected
                          ? "bg-indigo-50 border-indigo-300 dark:bg-indigo-900/40 dark:border-indigo-600"
                          : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/40"
                        : isCorrect
                          ? "bg-emerald-50 border-emerald-300 dark:bg-emerald-900/30 dark:border-emerald-600"
                          : selected
                            ? "bg-rose-50 border-rose-300 dark:bg-rose-900/30 dark:border-rose-600"
                            : "border-transparent opacity-80"
                    }`}
                  >
                    <input
                      type="radio"
                      checked={selected}
                      name={`right-quiz-${qi}`}
                      disabled={quizSubmitted}
                      onChange={() => {
                        if (quizSubmitted) return;
                        setSelectedAnswers((prev) => {
                          const next = [...prev];
                          next[qi] = oi;
                          return next;
                        });
                      }}
                    />
                    <span className="text-slate-700 dark:text-slate-200">{opt}</span>
                  </label>
                );
              })}
            </div>
            {quizSubmitted && (
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-2">
                <span className="font-semibold">{t("Explanation")}:</span>{" "}
                {q.explanation}
              </p>
            )}
          </div>
        ))}
        {!quizSubmitted ? (
          <button
            type="button"
            disabled={!allQuizAnswered}
            onClick={() => {
              setQuizSubmitted(true);
              onQuizAttemptStatusChange?.(true);
              onQuizScoreRecorded?.({
                correct: correctCount,
                total: questions.length,
              });
              setShowResultModal(true);
            }}
            className="px-3 py-2 text-sm rounded-lg bg-indigo-600 text-white disabled:opacity-50"
          >
            {t("Check answers")}
          </button>
        ) : (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
            <p className="font-medium">{encouragement || "Nice, go ahead."}</p>
            <p className="text-xs mt-1">
              {t("Score")}: {correctCount}/{questions.length}
            </p>
          </div>
        )}
      </div>

      {showResultModal && (() => {
        const total = questions.length;
        const isPerfect = total > 0 && correctCount === total;
        const isStrong = !isPerfect && total > 0 && correctCount / total >= 0.5;

        const headerEmoji = isPerfect ? "🏆" : isStrong ? "🚀" : "💪";
        const titleText = isPerfect
          ? t("guide.quiz_title_perfect")
          : isStrong
            ? t("guide.quiz_title_strong")
            : t("guide.quiz_title_keep_going");
        const message = isPerfect
          ? t("guide.quiz_motivation_perfect")
          : isStrong
            ? t("guide.quiz_motivation_strong")
            : t("guide.quiz_motivation_keep_going");

        const ringClass = isPerfect
          ? "bg-emerald-50 ring-emerald-100 dark:bg-emerald-900/30 dark:ring-emerald-800"
          : isStrong
            ? "bg-indigo-50 ring-indigo-100 dark:bg-indigo-900/30 dark:ring-indigo-800"
            : "bg-amber-50 ring-amber-100 dark:bg-amber-900/30 dark:ring-amber-800";
        const scoreClass = isPerfect
          ? "text-emerald-700 dark:text-emerald-300"
          : isStrong
            ? "text-indigo-700 dark:text-indigo-300"
            : "text-amber-700 dark:text-amber-300";
        const primaryBtnClass = isPerfect
          ? "bg-emerald-600 hover:bg-emerald-700"
          : isStrong
            ? "bg-indigo-600 hover:bg-indigo-700"
            : "bg-amber-600 hover:bg-amber-700";

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden">
              <ModalCloseButton onClick={() => setShowResultModal(false)} />
              <div className="px-6 pt-6 pb-5 text-center">
                <div
                  className={`mx-auto w-16 h-16 rounded-full ring-8 flex items-center justify-center text-3xl ${ringClass}`}
                >
                  <span aria-hidden>{headerEmoji}</span>
                </div>
                <p className="mt-4 text-base font-semibold text-slate-800 dark:text-slate-100">
                  {titleText}
                </p>
                <p className={`mt-1 text-3xl font-bold tracking-tight ${scoreClass}`}>
                  {correctCount}
                  <span className="text-slate-400 dark:text-slate-500 font-semibold">
                    /{total}
                  </span>
                </p>
                <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                  {message}
                </p>
              </div>
              <div className="px-4 pb-4 pt-3 flex items-center gap-2 border-t border-slate-100 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setShowResultModal(false)}
                  className="flex-1 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
                >
                  {t("Close")}
                </button>
                {canMoveToNext && onMoveToNext && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowResultModal(false);
                      onMoveToNext();
                    }}
                    disabled={moveToNextLoading}
                    className={`flex-1 px-3 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-50 ${primaryBtnClass}`}
                  >
                    {isLastKnowledge ? t("Complete Learning") : t("Next")}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
