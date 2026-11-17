"use client";

/** Review/edit OCR text before sending to Smart Solver (Upload and Draw tabs). */

import { Crop, Loader2, RotateCcw, Sparkles, Type } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { OcrConfidence } from "@/lib/solverOcr";

interface SolverOcrConfirmProps {
  previewUrl: string;
  questionText: string;
  onQuestionChange: (value: string) => void;
  onSolve: () => void;
  onRetake: () => void;
  onRecrop?: () => void;
  onTypeInstead?: () => void;
  confidence?: OcrConfidence;
  loading?: boolean;
  error?: string | null;
  disabled?: boolean;
}

export default function SolverOcrConfirm({
  previewUrl,
  questionText,
  onQuestionChange,
  onSolve,
  onRetake,
  onRecrop,
  onTypeInstead,
  confidence,
  loading = false,
  error = null,
  disabled = false,
}: SolverOcrConfirmProps) {
  const { t } = useTranslation();
  const canSolve = questionText.trim().length > 0 && !loading && !disabled;
  const showTypeFallback =
    Boolean(onTypeInstead) && !loading && (Boolean(error) || !questionText.trim());

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="text-center">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("solver.ocr_confirm_title")}
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("solver.ocr_confirm_hint")}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded preview */}
        <img
          src={previewUrl}
          alt={t("solver.upload_preview_alt")}
          className="max-h-64 w-full object-contain bg-slate-50 dark:bg-slate-900"
        />
      </div>

      <div>
        <label
          htmlFor="solver-ocr-question"
          className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300"
        >
          {t("solver.ocr_detected_label")}
        </label>
        <textarea
          id="solver-ocr-question"
          value={questionText}
          onChange={(e) => onQuestionChange(e.target.value)}
          rows={10}
          disabled={loading || disabled}
          placeholder={t("solver.ocr_empty_placeholder")}
          className="min-h-[220px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-4 py-3.5 text-sm leading-relaxed text-slate-800 shadow-inner transition-colors placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
        />
        {confidence === "low" && !error && (
          <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
            {t("solver.ocr_confidence_low")}
          </p>
        )}
        {questionText.toLowerCase().includes("figure description:") && !error && (
          <p className="mt-1.5 text-[11px] text-blue-600 dark:text-blue-400">
            {t("solver.ocr_figure_detected")}
          </p>
        )}
      </div>

      {error && (
        <p className="text-center text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-center gap-2">
        {showTypeFallback && (
          <button
            type="button"
            onClick={onTypeInstead}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-60 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
          >
            <Type className="h-3.5 w-3.5" />
            {t("solver.ocr_type_instead")}
          </button>
        )}
        <button
          type="button"
          onClick={onRetake}
          disabled={loading || disabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("solver.ocr_retake")}
        </button>
        {onRecrop && (
          <button
            type="button"
            onClick={onRecrop}
            disabled={loading || disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Crop className="h-3.5 w-3.5" />
            {t("solver.ocr_recrop")}
          </button>
        )}
        <button
          type="button"
          onClick={onSolve}
          disabled={!canSolve}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {t("solver.ocr_solve_button")}
        </button>
      </div>
    </div>
  );
}
