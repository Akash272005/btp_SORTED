"use client";

import { AlertCircle, CalendarClock, ClipboardList } from "lucide-react";
import type { StudentQuizFilterTab } from "@/lib/studentQuizListUi";
import {
  STUDENT_QUIZ_SUMMARY_FILTER,
  studentQuizSummaryTheme,
  type StudentQuizSummaryKey,
} from "@/lib/studentQuizSummaryVisuals";

type SummaryCounts = {
  urgent: number;
  thisWeek: number;
  pending: number;
};

const CARDS: {
  key: StudentQuizSummaryKey;
  countKey: keyof SummaryCounts;
  label: string;
  icon: typeof AlertCircle;
}[] = [
  {
    key: "urgent",
    countKey: "urgent",
    label: "Due today / overdue",
    icon: AlertCircle,
  },
  {
    key: "thisWeek",
    countKey: "thisWeek",
    label: "Due this week",
    icon: CalendarClock,
  },
  {
    key: "pending",
    countKey: "pending",
    label: "Pending to complete",
    icon: ClipboardList,
  },
];

export default function StudentQuizSummaryCards({
  counts,
  onFilterClick,
  activeFilterTab,
}: {
  counts: SummaryCounts;
  onFilterClick?: (tab: StudentQuizFilterTab) => void;
  activeFilterTab?: StudentQuizFilterTab;
}) {
  return (
    <div className="mb-6 grid gap-3 sm:grid-cols-3">
      {CARDS.map(({ key, countKey, label, icon: Icon }) => {
        const count = counts[countKey];
        const muted = count === 0;
        const theme = studentQuizSummaryTheme(key);
        const filterTab = STUDENT_QUIZ_SUMMARY_FILTER[key];
        const isActive =
          activeFilterTab !== undefined && activeFilterTab === filterTab;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onFilterClick?.(filterTab)}
            aria-pressed={isActive}
            className={`group relative w-full overflow-hidden rounded-xl border px-4 py-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 sm:px-5 ${
              muted
                ? theme.mutedShell
                : `${theme.shell} ${theme.shadow}`
            } ${isActive ? "ring-2 ring-indigo-400/35 ring-offset-1" : ""} ${
              onFilterClick ? "cursor-pointer" : "cursor-default"
            }`}
          >
            {!muted ? (
              <div
                className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${theme.wash}`}
                aria-hidden
              />
            ) : null}
            <div className="relative flex items-center gap-4">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                  muted ? "bg-slate-400 text-white" : theme.icon
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p
                  className={`text-xl font-bold tabular-nums tracking-tight ${
                    muted ? "text-slate-500" : theme.value
                  }`}
                >
                  {count}
                </p>
                <p className="text-xs font-medium text-slate-500">{label}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
