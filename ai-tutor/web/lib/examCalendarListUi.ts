import type { ExamCalendarSlot } from "@/services/lmsApi";
import {
  examSlotWorkflowStatus,
  type ExamSlotWorkflowStatus,
} from "@/lib/examCalendarSlotStatus";

export type ExamCalendarSlotFilter = "all" | "upcoming" | "needs_action" | "done";

export type SlotNumericDraft = Partial<{ marks: string; duration: string }>;

export function formatExamDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function toIsoDate(dateStr: string): string | null {
  if (!dateStr.trim()) return null;
  return new Date(`${dateStr}T12:00:00.000Z`).toISOString();
}

export function slotNumericDisplay(
  slot: Pick<ExamCalendarSlot, "id" | "marks" | "duration_mins">,
  field: "marks" | "duration",
  drafts: Record<string, SlotNumericDraft>,
): string {
  const draft = drafts[slot.id]?.[field];
  if (draft !== undefined) return draft;
  const stored = field === "marks" ? slot.marks : slot.duration_mins;
  return stored != null ? String(stored) : "";
}

export function slotStatusFor(
  slot: Pick<
    ExamCalendarSlot,
    "exam_date" | "linked_paper_id" | "linked_assignment_id"
  >,
  distributedPaperIds: Set<number>,
): ExamSlotWorkflowStatus {
  return examSlotWorkflowStatus(slot, distributedPaperIds);
}

export function examCalendarSummaryCounts(
  slots: ExamCalendarSlot[],
  distributedPaperIds: Set<number>,
) {
  let upcoming = 0;
  let needsAction = 0;
  let done = 0;
  const now = Date.now();

  for (const slot of slots) {
    const status = slotStatusFor(slot, distributedPaperIds);
    if (status === "done") {
      done += 1;
      continue;
    }
    if (slot.exam_date && new Date(slot.exam_date).getTime() >= now) {
      upcoming += 1;
    }
    if (status === "planned" || status === "paper") {
      needsAction += 1;
    }
  }

  return {
    total: slots.length,
    upcoming,
    needsAction,
    done,
  };
}

export function matchesExamCalendarSlotFilter(
  slot: ExamCalendarSlot,
  filter: ExamCalendarSlotFilter,
  distributedPaperIds: Set<number>,
): boolean {
  if (filter === "all") return true;
  const status = slotStatusFor(slot, distributedPaperIds);
  const now = Date.now();

  if (filter === "done") return status === "done";
  if (filter === "upcoming") {
    return (
      status !== "done" &&
      slot.exam_date != null &&
      new Date(slot.exam_date).getTime() >= now
    );
  }
  if (filter === "needs_action") {
    return status === "planned" || status === "paper";
  }
  return true;
}

export function slotRowMetaLine(slot: ExamCalendarSlot): string {
  const parts: string[] = [];
  if (slot.exam_date) {
    try {
      parts.push(
        new Date(slot.exam_date).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        }),
      );
    } catch {
      /* ignore */
    }
  } else {
    parts.push("No date set");
  }
  if (slot.marks != null) parts.push(`${slot.marks} marks`);
  if (slot.duration_mins != null) parts.push(`${slot.duration_mins} min`);
  parts.push(
    `${slot.chapters.length} chapter${slot.chapters.length === 1 ? "" : "s"}`,
  );
  return parts.join(" · ");
}

export function slotRowStyles(status: ExamSlotWorkflowStatus) {
  const styles: Record<
    ExamSlotWorkflowStatus,
    { pill: string; iconWrap: string; rowAccent: string; rowHover: string }
  > = {
    planned: {
      pill: "bg-slate-50 text-slate-700 ring-slate-200",
      iconWrap: "bg-amber-50 text-amber-600",
      rowAccent: "border-l-[3px] border-l-amber-300",
      rowHover: "hover:bg-amber-50/50",
    },
    paper: {
      pill: "bg-sky-50 text-sky-700 ring-sky-100",
      iconWrap: "bg-sky-50 text-sky-600",
      rowAccent: "border-l-[3px] border-l-sky-400",
      rowHover: "hover:bg-sky-50/50",
    },
    distributed: {
      pill: "bg-indigo-50 text-indigo-700 ring-indigo-100",
      iconWrap: "bg-indigo-50 text-indigo-600",
      rowAccent: "border-l-[3px] border-l-indigo-400",
      rowHover: "hover:bg-indigo-50/50",
    },
    assigned: {
      pill: "bg-amber-50 text-amber-800 ring-amber-100",
      iconWrap: "bg-amber-50 text-amber-600",
      rowAccent: "border-l-[3px] border-l-amber-400",
      rowHover: "hover:bg-amber-50/50",
    },
    done: {
      pill: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      iconWrap: "bg-emerald-50 text-emerald-600",
      rowAccent: "border-l-[3px] border-l-transparent",
      rowHover: "hover:bg-emerald-50/50",
    },
  };
  return styles[status];
}
