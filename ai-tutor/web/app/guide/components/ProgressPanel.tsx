"use client";

import { Loader2, Play, ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";
import { SessionState } from "../types";
import { useTranslation } from "react-i18next";

interface ProgressPanelProps {
  sessionState: SessionState;
  isLoading: boolean;
  loadingAction: "start" | "next" | "prev" | null;
  canStart: boolean;
  canPrev: boolean;
  canNext: boolean;
  isCompleted: boolean;
  isLastKnowledge: boolean;
  nextLocked?: boolean;
  nextLockReason?: string;
  onStartLearning: () => void;
  onPreviousKnowledge: () => void;
  onNextKnowledge: () => void;
  onReset: () => void;
}

export default function ProgressPanel({
  sessionState,
  isLoading,
  loadingAction,
  canStart,
  canPrev,
  canNext,
  isCompleted,
  isLastKnowledge,
  nextLocked = false,
  nextLockReason,
  onStartLearning,
  onPreviousKnowledge,
  onNextKnowledge,
  onReset,
}: ProgressPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          {t("Learning Progress")}
        </span>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {sessionState.progress}%
        </span>
      </div>
      <div className="h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500"
          style={{ width: `${sessionState.progress}%` }}
        />
      </div>
      {sessionState.knowledge_points.length > 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          {t("Knowledge Point {n} / {total}")
            .replace("{n}", String(sessionState.current_index + 1))
            .replace("{total}", String(sessionState.knowledge_points.length))}
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        {canStart && (
          <button
            onClick={onStartLearning}
            disabled={isLoading}
            className="flex-1 min-w-[120px] px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
          >
            {loadingAction === "start" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("Generating...")}
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                {t("Start Learning")}
              </>
            )}
          </button>
        )}

        {canPrev && (
          <button
            type="button"
            onClick={onPreviousKnowledge}
            disabled={isLoading}
            className="flex-1 min-w-[120px] px-4 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
          >
            {loadingAction === "prev" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("Loading...")}
              </>
            ) : (
              <>
                <ChevronLeft className="w-4 h-4" />
                {t("Back")}
              </>
            )}
          </button>
        )}

        {canNext && (
          <button
            onClick={onNextKnowledge}
            disabled={isLoading || nextLocked}
            className="flex-1 min-w-[120px] px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
            title={nextLocked ? nextLockReason : undefined}
          >
            {loadingAction === "next" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("Loading...")}
              </>
            ) : (
              <>
                <ChevronRight className="w-4 h-4" />
                {t("Next")}
              </>
            )}
          </button>
        )}

        {isLastKnowledge && (
          <button
            onClick={onNextKnowledge}
            disabled={isLoading || nextLocked}
            className="flex-1 min-w-[120px] px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
            title={nextLocked ? nextLockReason : undefined}
          >
            {loadingAction === "next" ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("Generating Summary...")}
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                {t("Complete Learning")}
              </>
            )}
          </button>
        )}

        {nextLocked && !isLoading && (
          <p className="w-full text-xs text-amber-600 dark:text-amber-400" role="status" aria-live="polite">
            {nextLockReason || t("Attempt the step quiz to unlock Next.")}
          </p>
        )}

        {isCompleted && (
          <button
            onClick={onReset}
            disabled={isLoading}
            className="flex-1 min-w-[120px] px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-2 text-sm font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-4 h-4" />
            {t("Start New Learning")}
          </button>
        )}
      </div>
    </div>
  );
}
