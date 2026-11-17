"use client";

/** Upload Photo / Draw / AiChat tab switcher on the Smart Solver toolbar. */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { SolverInputMode } from "./types";
import { SOLVER_INPUT_MODES } from "./types";

type SolverInputTabsProps = {
  activeMode: SolverInputMode;
  onChange: (mode: SolverInputMode) => void;
  disabled?: boolean;
};

const LABEL_KEYS: Record<SolverInputMode, string> = {
  type: "solver.input_tab_type",
  draw: "solver.input_tab_draw",
  upload: "solver.input_tab_upload",
};

export default function SolverInputTabs({
  activeMode,
  onChange,
  disabled = false,
}: SolverInputTabsProps) {
  const { t } = useTranslation();

  const tabs = useMemo(
    () =>
      SOLVER_INPUT_MODES.map((id) => ({
        id,
        label: t(LABEL_KEYS[id]),
      })),
    [t],
  );

  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1 dark:border-slate-600 dark:bg-slate-700/50"
      role="tablist"
      aria-label={t("solver.input_tabs_aria")}
    >
      {tabs.map((tab) => {
        const isActive = activeMode === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={disabled}
            onClick={() => onChange(tab.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all whitespace-nowrap disabled:opacity-50 sm:px-4 sm:py-2 sm:text-sm ${
              isActive
                ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-600 dark:text-indigo-300 dark:ring-slate-500/50"
                : "border border-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-600/50"
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
