import type { ExamCalendarUpcomingSlot } from "@/services/lmsApi";

export type ExamSlotDateBlock = {
  day: string;
  month: string;
};

export function formatExamSlotDateBlock(
  iso: string | null | undefined,
): ExamSlotDateBlock {
  if (!iso) {
    return { day: "—", month: "" };
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return { day: "—", month: "" };
  }
  return {
    day: String(d.getDate()),
    month: d
      .toLocaleDateString("en-IN", { month: "short" })
      .replace(".", "")
      .toUpperCase(),
  };
}

export function examSlotMetaLine(slot: ExamCalendarUpcomingSlot): string {
  const subject = slot.subject || "Science";
  if (
    !slot.chapter_summary ||
    slot.chapter_summary === "Chapters TBD"
  ) {
    return `${subject} · No chapters set yet`;
  }
  return `${subject} · ${slot.chapter_summary}`;
}

export type ExamSlotBadge = {
  label: string;
  className: string;
};

export function examSlotBadge(slot: ExamCalendarUpcomingSlot): ExamSlotBadge {
  if (slot.linked_paper_id && !slot.linked_distribution_id) {
    return {
      label: "Paper ready",
      className: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    };
  }
  if (slot.linked_distribution_id) {
    return {
      label: "Distributed",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    };
  }
  return {
    label: "Planned",
    className: "bg-slate-100 text-slate-600 ring-slate-200",
  };
}

export type ExamSlotCta = {
  label: string;
  href: string;
  className: string;
};

const CTA_PRIMARY =
  "inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500";
const CTA_SECONDARY =
  "inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50";
const CTA_TEAL =
  "inline-flex shrink-0 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-800 shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-100";

export function examSlotCta(slot: ExamCalendarUpcomingSlot): ExamSlotCta {
  if (slot.linked_distribution_id) {
    return {
      label: "View tracking",
      href: `/teacher/papers/distributions/${encodeURIComponent(slot.linked_distribution_id)}`,
      className: CTA_PRIMARY,
    };
  }
  if (slot.linked_paper_id) {
    return {
      label: "Distribute",
      href: "/teacher/papers?tab=ready",
      className: CTA_PRIMARY,
    };
  }
  const needsSetup =
    !slot.exam_date ||
    !slot.chapter_summary ||
    slot.chapter_summary === "Chapters TBD";
  if (needsSetup) {
    return {
      label: "Set up",
      href: "/teacher/exam-calendar",
      className: CTA_SECONDARY,
    };
  }
  return {
    label: "Add paper",
    href: "/teacher/exam-calendar",
    className: CTA_TEAL,
  };
}
