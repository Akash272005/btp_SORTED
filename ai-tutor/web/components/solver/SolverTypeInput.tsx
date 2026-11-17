"use client";

/** Text box at the bottom — AiChat input and follow-up questions on other tabs. */

import { Loader2, Send } from "lucide-react";
import { useTranslation } from "react-i18next";

type SolverTypeInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  isSolving?: boolean;
  placeholder?: string;
};

export default function SolverTypeInput({
  value,
  onChange,
  onSubmit,
  disabled = false,
  isSolving = false,
  placeholder,
}: SolverTypeInputProps) {
  const { t } = useTranslation();

  return (
    <div className="relative w-full">
      <input
        type="text"
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-5 py-3.5 pr-14 text-slate-700 shadow-inner transition-all placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
        placeholder={placeholder ?? t("solver.type_placeholder")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        disabled={disabled || isSolving}
      />
      <div className="absolute inset-y-0 right-2 flex items-center">
        <button
          type="button"
          onClick={onSubmit}
          disabled={disabled || isSolving || !value.trim()}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-white shadow-md shadow-blue-500/20 transition-all hover:bg-blue-700 disabled:opacity-50 disabled:hover:bg-blue-600"
          aria-label={t("solver.solve_send")}
        >
          {isSolving ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
        </button>
      </div>
    </div>
  );
}
