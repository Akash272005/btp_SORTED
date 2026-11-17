import type { AssignmentItem } from "@/services/lmsApi";

export type AssignmentFilterTab =
  | "all"
  | "due_today"
  | "this_week"
  | "completed";

/** e.g. class-8a → Class 8-A */
export function formatTeacherClassLabel(classId: string): string {
  const m = classId.match(/^class-(\d+)([a-z])?$/i);
  if (m) {
    const section = m[2] ? `-${m[2].toUpperCase()}` : "";
    return `Class ${m[1]}${section}`;
  }
  return classId;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Days from today (local) to due date; negative = overdue. */
export function assignmentDueDayDelta(dueAt: string): number {
  const due = startOfLocalDay(new Date(dueAt));
  const today = startOfLocalDay(new Date());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function isAssignmentFullySubmitted(a: AssignmentItem): boolean {
  const total = a.student_count ?? 0;
  const done = a.submitted_count ?? 0;
  return total > 0 && done >= total;
}

export function assignmentSummaryCounts(items: AssignmentItem[]) {
  let urgent = 0;
  let thisWeek = 0;
  for (const a of items) {
    const delta = assignmentDueDayDelta(a.due_at);
    if (delta <= 0) urgent += 1;
    if (delta >= 1 && delta <= 7) thisWeek += 1;
  }
  return {
    urgent,
    thisWeek,
    active: items.length,
  };
}

export function matchesAssignmentFilterTab(
  a: AssignmentItem,
  tab: AssignmentFilterTab,
): boolean {
  const delta = assignmentDueDayDelta(a.due_at);
  switch (tab) {
    case "all":
      return true;
    case "due_today":
      return delta <= 0;
    case "this_week":
      return delta >= 1 && delta <= 7;
    case "completed":
      return isAssignmentFullySubmitted(a);
    default:
      return true;
  }
}

export type AssignmentUrgency = "urgent" | "soon" | "done" | "neutral";

export function assignmentUrgency(a: AssignmentItem): AssignmentUrgency {
  if (isAssignmentFullySubmitted(a)) return "done";
  const delta = assignmentDueDayDelta(a.due_at);
  if (delta <= 1) return "urgent";
  if (delta <= 7) return "soon";
  return "neutral";
}

const SUBJECT_BADGE: Record<string, string> = {
  Physics: "bg-violet-100 text-violet-800 ring-2 ring-violet-200/80",
  Chemistry: "bg-cyan-100 text-cyan-800 ring-2 ring-cyan-200/80",
  Biology: "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-200/80",
  Mathematics: "bg-blue-100 text-blue-800 ring-2 ring-blue-200/80",
};

export function assignmentSubjectBadgeClass(subject?: string | null): string {
  if (subject && SUBJECT_BADGE[subject]) return SUBJECT_BADGE[subject];
  return "bg-indigo-100 text-indigo-800 ring-2 ring-indigo-200/80";
}

export function assignmentRowMetaLine(a: AssignmentItem): string {
  const parts = [`${a.marks} marks`];
  if (a.duration_mins > 0) parts.push(`${a.duration_mins} min`);
  return parts.join(" · ");
}

/** Strip redundant subject prefix when a subject badge is shown separately. */
export function assignmentDisplayTitle(
  title: string,
  subject?: string | null,
): string {
  const raw = title || "";
  const label = subject || "General";
  const prefixCandidates = [
    `${label} — `,
    `${label} - `,
    `${label}: `,
  ];
  for (const p of prefixCandidates) {
    if (raw.startsWith(p)) return raw.slice(p.length);
  }
  return raw;
}

export function assignmentSubmissionsTooltip(a: AssignmentItem): string {
  const total = a.student_count ?? 0;
  const done = a.submitted_count ?? 0;
  if (total <= 0) return "View submissions";
  const pending = Math.max(0, total - done);
  return `${done}/${total} submitted · ${pending} pending · Open full view`;
}

const URGENCY_STYLES: Record<
  AssignmentUrgency,
  {
    pill: string;
    progress: string;
    progressEmpty: string;
    iconWrap: string;
    rowHover: string;
    rowAccent: string;
  }
> = {
  urgent: {
    pill: "bg-rose-50 text-rose-700 ring-rose-100",
    progress: "bg-rose-500",
    progressEmpty: "bg-slate-200",
    iconWrap: "bg-rose-50 text-rose-600",
    rowHover: "hover:bg-rose-50/70",
    rowAccent: "border-l-[3px] border-l-rose-300",
  },
  soon: {
    pill: "bg-amber-50 text-amber-800 ring-amber-100",
    progress: "bg-amber-500",
    progressEmpty: "bg-slate-200",
    iconWrap: "bg-amber-50 text-amber-600",
    rowHover: "hover:bg-amber-50/60",
    rowAccent: "border-l-[3px] border-l-transparent",
  },
  done: {
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    progress: "bg-emerald-500",
    progressEmpty: "bg-slate-200",
    iconWrap: "bg-emerald-50 text-emerald-600",
    rowHover: "hover:bg-emerald-50/50",
    rowAccent: "border-l-[3px] border-l-transparent",
  },
  neutral: {
    pill: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    progress: "bg-indigo-500",
    progressEmpty: "bg-slate-200",
    iconWrap: "bg-indigo-50 text-indigo-600",
    rowHover: "hover:bg-slate-50/90",
    rowAccent: "border-l-[3px] border-l-transparent",
  },
};

export function assignmentRowStyles(a: AssignmentItem) {
  return URGENCY_STYLES[assignmentUrgency(a)];
}

export function assignmentStatusPillLabel(a: AssignmentItem): string {
  const total = a.student_count ?? 0;
  const done = a.submitted_count ?? 0;
  if (total > 0 && done >= total) return `${done}/${total} done`;
  return a.due_label;
}

export function assignmentProgressPercent(a: AssignmentItem): number {
  const total = a.student_count ?? 0;
  const done = a.submitted_count ?? 0;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

export function assignmentProgressBarClass(
  a: AssignmentItem,
  percent: number,
): string {
  const styles = assignmentRowStyles(a);
  if (percent <= 0) return styles.progressEmpty;
  return styles.progress;
}

export function assignmentTabCounts(items: AssignmentItem[]) {
  return {
    all: items.length,
    due_today: items.filter((a) => matchesAssignmentFilterTab(a, "due_today"))
      .length,
    this_week: items.filter((a) => matchesAssignmentFilterTab(a, "this_week"))
      .length,
    completed: items.filter((a) => matchesAssignmentFilterTab(a, "completed"))
      .length,
  };
}
