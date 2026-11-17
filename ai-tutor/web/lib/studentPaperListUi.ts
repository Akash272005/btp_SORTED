import type { StudentPaperItem, StudentPaperListTab } from "@/services/lmsApi";

export type StudentPaperFilterTab = StudentPaperListTab;

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function studentPaperDueDayDelta(dueAt: string): number {
  const due = startOfLocalDay(new Date(dueAt));
  const today = startOfLocalDay(new Date());
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function isStudentPaperSubmitted(p: StudentPaperItem): boolean {
  return p.status === "completed";
}

export function isStudentPaperOverdue(p: StudentPaperItem): boolean {
  return p.status === "overdue";
}

export function isStudentPaperPending(p: StudentPaperItem): boolean {
  return !isStudentPaperSubmitted(p) && !isStudentPaperOverdue(p);
}

export function matchesStudentPaperFilterTab(
  p: StudentPaperItem,
  tab: StudentPaperFilterTab,
): boolean {
  switch (tab) {
    case "all":
      return true;
    case "pending":
      return isStudentPaperPending(p);
    case "submitted":
      return isStudentPaperSubmitted(p);
    case "overdue":
      return isStudentPaperOverdue(p);
    default:
      return true;
  }
}

export function studentPaperTabCounts(items: StudentPaperItem[]) {
  return {
    all: items.length,
    pending: items.filter((p) => matchesStudentPaperFilterTab(p, "pending")).length,
    submitted: items.filter((p) => matchesStudentPaperFilterTab(p, "submitted"))
      .length,
    overdue: items.filter((p) => matchesStudentPaperFilterTab(p, "overdue")).length,
  };
}

export function studentPaperSummaryCounts(items: StudentPaperItem[]) {
  let urgent = 0;
  let thisWeek = 0;
  let pending = 0;
  for (const p of items) {
    if (isStudentPaperSubmitted(p)) continue;
    const delta = studentPaperDueDayDelta(p.due_at);
    if (delta <= 0) urgent += 1;
    if (delta >= 1 && delta <= 7) thisWeek += 1;
    if (isStudentPaperPending(p)) pending += 1;
  }
  return { urgent, thisWeek, pending };
}

export type StudentPaperUrgency = "urgent" | "soon" | "done" | "neutral";

export function studentPaperUrgency(p: StudentPaperItem): StudentPaperUrgency {
  if (isStudentPaperSubmitted(p)) return "done";
  const delta = studentPaperDueDayDelta(p.due_at);
  if (delta <= 0) return "urgent";
  if (delta <= 7) return "soon";
  return "neutral";
}

const SUBJECT_BADGE: Record<string, string> = {
  Science: "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-200/80",
  Physics: "bg-violet-100 text-violet-800 ring-2 ring-violet-200/80",
  Chemistry: "bg-cyan-100 text-cyan-800 ring-2 ring-cyan-200/80",
  Biology: "bg-emerald-100 text-emerald-800 ring-2 ring-emerald-200/80",
  Mathematics: "bg-blue-100 text-blue-800 ring-2 ring-blue-200/80",
  Maths: "bg-blue-100 text-blue-800 ring-2 ring-blue-200/80",
};

export function studentPaperSubjectBadgeClass(subject?: string | null): string {
  if (subject && SUBJECT_BADGE[subject]) return SUBJECT_BADGE[subject];
  return "bg-indigo-100 text-indigo-800 ring-2 ring-indigo-200/80";
}

export function studentPaperRowMetaLine(p: StudentPaperItem): string {
  const parts = [
    p.teacher_name,
    `${p.duration_mins} min · ${p.total_marks} marks`,
  ].filter(Boolean);
  if (p.submission_mode_label) parts.push(p.submission_mode_label);
  return parts.join(" · ");
}

const URGENCY_STYLES: Record<
  StudentPaperUrgency,
  {
    pill: string;
    iconWrap: string;
    rowHover: string;
    rowAccent: string;
  }
> = {
  urgent: {
    pill: "bg-rose-50 text-rose-700 ring-rose-100",
    iconWrap: "bg-rose-50 text-rose-600",
    rowHover: "hover:bg-rose-50/70",
    rowAccent: "border-l-[3px] border-l-rose-300",
  },
  soon: {
    pill: "bg-amber-50 text-amber-800 ring-amber-100",
    iconWrap: "bg-amber-50 text-amber-600",
    rowHover: "hover:bg-amber-50/60",
    rowAccent: "border-l-[3px] border-l-transparent",
  },
  done: {
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    iconWrap: "bg-emerald-50 text-emerald-600",
    rowHover: "hover:bg-emerald-50/50",
    rowAccent: "border-l-[3px] border-l-transparent",
  },
  neutral: {
    pill: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    iconWrap: "bg-indigo-50 text-indigo-600",
    rowHover: "hover:bg-slate-50/90",
    rowAccent: "border-l-[3px] border-l-transparent",
  },
};

export function studentPaperRowStyles(p: StudentPaperItem) {
  return URGENCY_STYLES[studentPaperUrgency(p)];
}

export function studentPaperStatusPillLabel(p: StudentPaperItem): string {
  if (isStudentPaperSubmitted(p)) return "Submitted";
  if (isStudentPaperOverdue(p)) return "Overdue";
  if (p.status === "downloaded") return "In progress";
  return p.due_label;
}

export function studentPaperPrimaryActionLabel(p: StudentPaperItem): string {
  if (p.status === "completed") return "Open";
  if (p.allow_online_exam) return "Take test";
  if (p.allow_written_submission) return "Submit answers";
  if (p.allow_online_practice) return "Practice MCQs";
  return "Open paper";
}
