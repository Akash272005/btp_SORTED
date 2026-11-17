"use client";

/** Check my work mode — student types question + attempt for hint-style feedback. */

import { Loader2, Send } from "lucide-react";
import { useTranslation } from "react-i18next";

interface SolverCheckWorkInputProps {
  question: string;
  attempt: string;
  onQuestionChange: (value: string) => void;
  onAttemptChange: (value: string) => void;
  onSubmit: () => void;
  isSolving: boolean;
}

export default function SolverCheckWorkInput({
  question,
  attempt,
  onQuestionChange,
  onAttemptChange,
  onSubmit,
  isSolving,
}: SolverCheckWorkInputProps) {
  const { t } = useTranslation();
  const canSubmit = question.trim().length > 0 && attempt.trim().length > 0;

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div className="text-center">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("solver.check_work_title")}
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("solver.check_work_subtitle")}
        </p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {t("solver.check_work_question_label")}
        </span>
        <textarea
          value={question}
          onChange={(e) => onQuestionChange(e.target.value)}
          rows={3}
          disabled={isSolving}
          placeholder={t("solver.type_placeholder")}
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>

      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {t("solver.check_work_attempt_label")}
        </span>
        <textarea
          value={attempt}
          onChange={(e) => onAttemptChange(e.target.value)}
          rows={5}
          disabled={isSolving}
          placeholder={t("solver.check_work_attempt_placeholder")}
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-400 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
        />
      </label>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={onSubmit}
          disabled={isSolving || !canSubmit}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSolving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {t("solver.check_work_submit")}
        </button>
      </div>
    </div>
  );
}
