import type { AssignmentItem } from "@/types/lms";

export type StudentQuizFilterTab = "all" | "pending" | "submitted" | "overdue";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function studentQuizDueDayDelta(dueAt: string): number {
  const due = startOfLocalDay(new Date(dueAt));
  const today = startOfLocalDay(new Date());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function isStudentQuizSubmitted(a: AssignmentItem): boolean {
  return (
    a.status === "completed" ||
    (a.attempts_used > 0 && a.last_score != null)
  );
}

export function isStudentQuizOverdue(a: AssignmentItem): boolean {
  return studentQuizDueDayDelta(a.due_at) < 0 && !isStudentQuizSubmitted(a);
}

/** Not submitted yet and still before due date (matches backend pending tab). */
export function isStudentQuizPending(a: AssignmentItem): boolean {
  return !isStudentQuizSubmitted(a) && !isStudentQuizOverdue(a);
}

export function matchesStudentQuizFilterTab(
  a: AssignmentItem,
  tab: StudentQuizFilterTab,
): boolean {
  switch (tab) {
    case "all":
      return true;
    case "pending":
      return isStudentQuizPending(a);
    case "submitted":
      return isStudentQuizSubmitted(a);
    case "overdue":
      return isStudentQuizOverdue(a);
    default:
      return true;
  }
}

export function studentQuizTabCounts(items: AssignmentItem[]) {
  return {
    all: items.length,
    pending: items.filter((a) => matchesStudentQuizFilterTab(a, "pending")).length,
    submitted: items.filter((a) => matchesStudentQuizFilterTab(a, "submitted"))
      .length,
    overdue: items.filter((a) => matchesStudentQuizFilterTab(a, "overdue")).length,
  };
}

export function studentQuizSummaryCounts(items: AssignmentItem[]) {
  let urgent = 0;
  let thisWeek = 0;
  let pending = 0;
  for (const a of items) {
    if (isStudentQuizSubmitted(a)) continue;
    const delta = studentQuizDueDayDelta(a.due_at);
    if (delta <= 0) urgent += 1;
    if (delta >= 1 && delta <= 7) thisWeek += 1;
    if (isStudentQuizPending(a)) pending += 1;
  }
  return { urgent, thisWeek, pending };
}

export type StudentQuizUrgency = "urgent" | "soon" | "done" | "neutral";

export function studentQuizUrgency(a: AssignmentItem): StudentQuizUrgency {
  if (isStudentQuizSubmitted(a)) return "done";
  const delta = studentQuizDueDayDelta(a.due_at);
  if (delta <= 0) return "urgent";
  if (delta <= 7) return "soon";
  return "neutral";
}

const SUBJECT_BADGE: Record<string, string> = {
  Physics: "bg-violet-100 text-violet-800 ring-2 ring-violet-200/80",
  Chemistry: "bg-cyan-100 text-cyan-800 ring-2 ring-cyan-200/80",
  Biology: "bg-emerald-100 text-emerald-800 ring-emerald-200/80",
  Mathematics: "bg-blue-100 text-blue-800 ring-2 ring-blue-200/80",
};

export function studentQuizSubjectBadgeClass(subject?: string | null): string {
  if (subject && SUBJECT_BADGE[subject]) return SUBJECT_BADGE[subject];
  return "bg-indigo-100 text-indigo-800 ring-2 ring-indigo-200/80";
}

export function studentQuizDisplayTitle(
  title: string,
  subject?: string | null,
): string {
  const raw = title || "";
  const label = subject || "General";
  for (const p of [`${label} — `, `${label} - `, `${label}: `]) {
    if (raw.startsWith(p)) return raw.slice(p.length);
  }
  return raw;
}

export function studentQuizRowMetaLine(a: AssignmentItem): string {
  const parts = [a.teacher_name, `${a.marks} marks`];
  if (a.duration_mins > 0) parts.push(`${a.duration_mins} min`);
  return parts.join(" · ");
}

const URGENCY_STYLES: Record<
  StudentQuizUrgency,
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

export function studentQuizRowStyles(a: AssignmentItem) {
  return URGENCY_STYLES[studentQuizUrgency(a)];
}

export function studentQuizStatusPillLabel(a: AssignmentItem): string {
  if (isStudentQuizSubmitted(a)) return "Submitted";
  if (isStudentQuizOverdue(a)) return "Overdue";
  if (a.status === "in_progress") return "In progress";
  return a.due_label;
}

export function studentQuizAttemptPercent(a: AssignmentItem): number {
  if (a.max_attempts <= 0) return 0;
  return Math.min(100, Math.round((a.attempts_used / a.max_attempts) * 100));
}

export function studentQuizProgressBarClass(
  a: AssignmentItem,
  percent: number,
): string {
  const styles = studentQuizRowStyles(a);
  if (percent <= 0) return styles.progressEmpty;
  return styles.progress;
}

export function studentQuizPrimaryActionLabel(a: AssignmentItem): string {
  if (a.status === "in_progress") return "Continue";
  if (a.attempts_used > 0) return "Reattempt";
  return "Start";
}
