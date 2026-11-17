export function attemptStatusBadgeClass(status: string): string {
  if (status === "completed") {
    return "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-200/80";
  }
  if (status === "in_progress") {
    return "bg-amber-100 text-amber-900 ring-2 ring-amber-200/80";
  }
  return "bg-indigo-100 text-indigo-800 ring-2 ring-indigo-200/80";
}

export function attemptStatusLabel(status: string): string {
  if (status === "completed") return "Completed";
  if (status === "in_progress") return "In progress";
  return "Not started";
}

const STUDENT_ROW_STYLES: Record<
  string,
  { iconWrap: string; rowHover: string; rowAccent: string }
> = {
  completed: {
    iconWrap:
      "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-200/80",
    rowHover: "hover:bg-emerald-50/80",
    rowAccent: "border-l-[4px] border-l-emerald-500",
  },
  in_progress: {
    iconWrap:
      "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-200/80",
    rowHover: "hover:bg-amber-50/80",
    rowAccent: "border-l-[4px] border-l-amber-500",
  },
  not_started: {
    iconWrap:
      "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200/80",
    rowHover: "hover:bg-indigo-50/80",
    rowAccent: "border-l-[4px] border-l-indigo-400",
  },
};

export function studentAttemptRowStyles(status: string) {
  return STUDENT_ROW_STYLES[status] ?? STUDENT_ROW_STYLES.not_started;
}

export function studentInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function dueLabelPillClass(dueLabel: string): string {
  const lower = dueLabel.toLowerCase();
  if (lower.includes("overdue") || lower.includes("past")) {
    return "bg-rose-100 text-rose-800 ring-2 ring-rose-200/80";
  }
  if (lower.includes("today") || lower.includes("tomorrow")) {
    return "bg-amber-100 text-amber-900 ring-2 ring-amber-200/80";
  }
  return "bg-violet-100 text-violet-800 ring-2 ring-violet-200/80";
}

export function submissionProgressBarClass(percent: number): string {
  if (percent >= 100) return "bg-gradient-to-r from-emerald-500 to-teal-500";
  if (percent >= 50) return "bg-gradient-to-r from-indigo-500 to-violet-500";
  if (percent > 0) return "bg-gradient-to-r from-amber-400 to-orange-500";
  return "bg-gradient-to-r from-indigo-300 to-violet-400";
}

export function submissionProgressShellClass(percent: number): string {
  if (percent >= 100) {
    return "border-indigo-200/60 border-l-[4px] border-l-emerald-500 bg-gradient-to-r from-emerald-50/90 via-white to-white";
  }
  if (percent > 0) {
    return "border-indigo-200/60 border-l-[4px] border-l-indigo-500 bg-gradient-to-r from-indigo-50/90 via-white to-white";
  }
  return "border-indigo-200/60 border-l-[4px] border-l-violet-500 bg-gradient-to-r from-violet-50/90 via-indigo-50/40 to-white";
}

/** Brief highlight after a manual refresh on assignment detail. */
export const assignmentRefreshContentFlash =
  "rounded-2xl ring-2 ring-indigo-300/80 ring-offset-2 ring-offset-[#F9FAFB] bg-indigo-50/25 shadow-md shadow-indigo-100/40 transition-all duration-500";

export const assignmentRefreshTimestampFlash =
  "rounded-md bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700 shadow-sm transition-all duration-500";
