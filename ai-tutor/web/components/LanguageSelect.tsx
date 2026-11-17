"use client";

import { ChevronDown, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppLanguage } from "@/i18n/init";
import { LANGUAGE_OPTIONS } from "@/app/settings/constants";

type LanguageSelectProps = {
  value: AppLanguage;
  onChange: (lang: AppLanguage) => void;
  className?: string;
  /** Globe + translated "Language" before the control */
  showLabel?: boolean;
};

export function LanguageSelect({
  value,
  onChange,
  className = "",
  showLabel = false,
}: LanguageSelectProps) {
  const { t } = useTranslation();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel ? (
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 shrink-0">
          <Globe className="w-4 h-4" />
          <span>{t("Language")}</span>
        </div>
      ) : null}
      <div className="relative min-w-[6.75rem] max-w-[12rem] flex-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value as AppLanguage)}
          className="w-full pl-2.5 pr-7 py-1.5 rounded-lg text-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-800 dark:text-slate-200 appearance-none focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer"
          aria-label={t("Language")}
        >
          {LANGUAGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
}
