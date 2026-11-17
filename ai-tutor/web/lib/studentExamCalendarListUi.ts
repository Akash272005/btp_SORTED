import type { ExamCalendar, ExamCalendarSlot } from "@/services/lmsApi";

export type FlatExamSlot = ExamCalendarSlot & {
  subject: string;
  year: string;
  calendarId: string;
};

export type StudentExamCalendarFilterTab = "all" | "today" | "upcoming" | "past";

export type ExamSlotBucket = "today" | "upcoming" | "past" | "nodate";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function examSlotBucket(
  examDate: string | null | undefined,
): ExamSlotBucket {
  if (!examDate) return "nodate";
  const examDay = startOfLocalDay(new Date(examDate));
  const today = startOfLocalDay(new Date());
  const diff = (examDay.getTime() - today.getTime()) / 86400000;
  if (diff < 0) return "past";
  if (diff === 0) return "today";
  return "upcoming";
}

export function examSlotDayDelta(examDate: string): number {
  const examDay = startOfLocalDay(new Date(examDate));
  const today = startOfLocalDay(new Date());
  return Math.round((examDay.getTime() - today.getTime()) / 86400000);
}

export function formatExamDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function flattenExamSlots(calendars: ExamCalendar[]): FlatExamSlot[] {
  const rows: FlatExamSlot[] = [];
  for (const cal of calendars) {
    for (const slot of cal.slots) {
      rows.push({
        ...slot,
        subject: cal.subject,
        year: cal.academic_year,
        calendarId: cal.id,
      });
    }
  }
  return rows.sort((a, b) => {
    if (!a.exam_date && !b.exam_date) return a.sort_order - b.sort_order;
    if (!a.exam_date) return 1;
    if (!b.exam_date) return -1;
    return new Date(a.exam_date).getTime() - new Date(b.exam_date).getTime();
  });
}

export function matchesExamCalendarFilterTab(
  slot: FlatExamSlot,
  tab: StudentExamCalendarFilterTab,
): boolean {
  const bucket = examSlotBucket(slot.exam_date);
  switch (tab) {
    case "all":
      return true;
    case "today":
      return bucket === "today";
    case "upcoming":
      return bucket === "upcoming" || bucket === "nodate";
    case "past":
      return bucket === "past";
    default:
      return true;
  }
}

export function studentExamCalendarTabCounts(slots: FlatExamSlot[]) {
  return {
    all: slots.length,
    today: slots.filter((s) => matchesExamCalendarFilterTab(s, "today")).length,
    upcoming: slots.filter((s) => matchesExamCalendarFilterTab(s, "upcoming"))
      .length,
    past: slots.filter((s) => matchesExamCalendarFilterTab(s, "past")).length,
  };
}

export function studentExamCalendarSummaryCounts(slots: FlatExamSlot[]) {
  let today = 0;
  let thisWeek = 0;
  let upcoming = 0;
  for (const slot of slots) {
    const bucket = examSlotBucket(slot.exam_date);
    if (bucket === "today") today += 1;
    if (bucket === "upcoming" || bucket === "nodate") {
      upcoming += 1;
      if (
        slot.exam_date &&
        examSlotDayDelta(slot.exam_date) >= 0 &&
        examSlotDayDelta(slot.exam_date) <= 7
      ) {
        thisWeek += 1;
      }
    }
  }
  return { today, thisWeek, upcoming };
}

export type ExamSlotUrgency = "urgent" | "soon" | "done" | "neutral";

export function examSlotUrgency(slot: FlatExamSlot): ExamSlotUrgency {
  const bucket = examSlotBucket(slot.exam_date);
  if (bucket === "past") return "done";
  if (bucket === "today") return "urgent";
  if (bucket === "upcoming") {
    if (slot.exam_date && examSlotDayDelta(slot.exam_date) <= 7) return "soon";
    return "neutral";
  }
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

export function examSlotSubjectBadgeClass(subject?: string | null): string {
  if (subject && SUBJECT_BADGE[subject]) return SUBJECT_BADGE[subject];
  return "bg-indigo-100 text-indigo-800 ring-2 ring-indigo-200/80";
}

const URGENCY_STYLES: Record<
  ExamSlotUrgency,
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
    pill: "bg-slate-100 text-slate-600 ring-slate-200",
    iconWrap: "bg-slate-100 text-slate-500",
    rowHover: "hover:bg-slate-50/90",
    rowAccent: "border-l-[3px] border-l-transparent",
  },
  neutral: {
    pill: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    iconWrap: "bg-indigo-50 text-indigo-600",
    rowHover: "hover:bg-slate-50/90",
    rowAccent: "border-l-[3px] border-l-transparent",
  },
};

export function examSlotRowStyles(slot: FlatExamSlot) {
  return URGENCY_STYLES[examSlotUrgency(slot)];
}

export function examSlotStatusPillLabel(slot: FlatExamSlot): string {
  const bucket = examSlotBucket(slot.exam_date);
  if (bucket === "today") return "Today";
  if (bucket === "past") return "Past";
  if (bucket === "nodate") return "Date TBD";
  if (slot.exam_date && examSlotDayDelta(slot.exam_date) <= 7) {
    return "This week";
  }
  return "Upcoming";
}

export function examSlotMetaLine(slot: FlatExamSlot): string {
  const parts = [slot.subject, slot.year];
  if (slot.marks != null && slot.marks > 0) parts.push(`${slot.marks} marks`);
  if (slot.duration_mins != null && slot.duration_mins > 0) {
    parts.push(`${slot.duration_mins} min`);
  }
  return parts.filter(Boolean).join(" · ");
}
