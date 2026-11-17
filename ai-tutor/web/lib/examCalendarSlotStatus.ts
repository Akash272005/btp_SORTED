import type { ExamCalendarSlot } from "@/services/lmsApi";

export type ExamSlotWorkflowStatus =
  | "planned"
  | "paper"
  | "distributed"
  | "assigned"
  | "done";

export function examSlotWorkflowStatus(
  slot: Pick<
    ExamCalendarSlot,
    "exam_date" | "linked_paper_id" | "linked_assignment_id"
  >,
  distributedPaperIds: Set<number>,
): ExamSlotWorkflowStatus {
  const examPast =
    slot.exam_date != null && new Date(slot.exam_date).getTime() < Date.now();
  if (slot.linked_assignment_id) {
    return examPast ? "done" : "assigned";
  }
  if (
    slot.linked_paper_id != null &&
    distributedPaperIds.has(slot.linked_paper_id)
  ) {
    return examPast ? "done" : "distributed";
  }
  if (slot.linked_paper_id != null) {
    return "paper";
  }
  return "planned";
}

export const SLOT_STATUS_LABEL: Record<ExamSlotWorkflowStatus, string> = {
  planned: "Planned",
  paper: "Paper ready",
  distributed: "Distributed",
  assigned: "Quiz assigned",
  done: "Done",
};

export const SLOT_STATUS_CLASS: Record<ExamSlotWorkflowStatus, string> = {
  planned: "bg-slate-50 text-slate-700 ring-1 ring-slate-200",
  paper: "bg-sky-50 text-sky-700 ring-1 ring-sky-100",
  distributed: "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100",
  assigned: "bg-amber-50 text-amber-800 ring-1 ring-amber-100",
  done: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100",
};
