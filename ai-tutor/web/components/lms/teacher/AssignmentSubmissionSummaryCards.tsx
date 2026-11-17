"use client";

import { CheckCircle2, Clock, Users } from "lucide-react";
import {
  submissionSummaryTheme,
  type SubmissionSummaryKey,
} from "@/lib/assignmentSubmissionVisuals";
import {
  submissionProgressBarClass,
  submissionProgressShellClass,
} from "@/lib/assignmentDetailUi";

type SubmissionCounts = {
  submitted: number;
  inProgress: number;
  notStarted: number;
};

const CARDS: {
  key: SubmissionSummaryKey;
  countKey: keyof SubmissionCounts;
  label: string;
  icon: typeof CheckCircle2;
}[] = [
  {
    key: "submitted",
    countKey: "submitted",
    label: "Submitted",
    icon: CheckCircle2,
  },
  {
    key: "inProgress",
    countKey: "inProgress",
    label: "In progress",
    icon: Clock,
  },
  {
    key: "notStarted",
    countKey: "notStarted",
    label: "Not started",
    icon: Users,
  },
];

export default function AssignmentSubmissionSummaryCards({
  counts,
  total,
}: {
  counts: SubmissionCounts;
  total: number;
}) {
  const submissionPct =
    total > 0 ? Math.round((counts.submitted / total) * 100) : 0;

  return (
    <div className="mb-6 space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {CARDS.map(({ key, countKey, label, icon: Icon }) => {
          const count = counts[countKey];
          const theme = submissionSummaryTheme(key);

          return (
            <div
              key={key}
              className={`group relative overflow-hidden rounded-xl border px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 sm:px-5 ${theme.shell} ${theme.shadow}`}
            >
              <div
                className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br opacity-40 transition-opacity duration-200 group-hover:opacity-100 ${theme.wash}`}
                aria-hidden
              />
              <div className="relative flex items-center gap-4">
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${theme.icon}`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p
                    className={`text-[1.75rem] font-bold leading-none tabular-nums tracking-tight ${theme.value}`}
                  >
                    {count}
                  </p>
                  <p
                    className={`mt-1 text-[11px] font-bold uppercase tracking-wider ${theme.label}`}
                  >
                    {label}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {total > 0 ? (
        <div
          className={`overflow-hidden rounded-xl border px-4 py-4 shadow-md sm:px-5 ${submissionProgressShellClass(submissionPct)}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold text-slate-800">
              Class submission progress
            </p>
            <p className="text-sm font-bold tabular-nums">
              <span className="text-slate-800">{counts.submitted}</span>
              <span className="mx-0.5 font-medium text-slate-400">/</span>
              <span className="text-slate-600">{total}</span>
              <span
                className={`ml-2 ${
                  submissionPct > 0 ? "text-emerald-600" : "text-violet-600"
                }`}
              >
                {submissionPct}%
              </span>
            </p>
          </div>
          <div
            className="mt-3 h-3 overflow-hidden rounded-full bg-white shadow-inner ring-1 ring-slate-200/90"
            role="progressbar"
            aria-valuenow={submissionPct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full rounded-full transition-all duration-500 ${submissionProgressBarClass(submissionPct)}`}
              style={{
                width: `${Math.max(submissionPct, submissionPct > 0 ? 6 : 3)}%`,
              }}
            />
          </div>
          {submissionPct === 0 ? (
            <p className="mt-2 text-xs font-medium text-violet-600/90">
              No submissions yet — students can start from their portal
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
