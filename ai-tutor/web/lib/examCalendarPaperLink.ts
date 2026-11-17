import type { ExamCalendarSlot } from "@/services/lmsApi";

const VALID_EXAM_TYPES = new Set([
  "chapter_test",
  "unit_test",
  "half_yearly",
  "annual",
  "mcq_only",
  "practice_worksheet",
]);

export function slotToPaperExamType(slotType: string): string {
  if (slotType === "half_yearly") return "half_yearly";
  if (slotType === "annual") return "annual";
  if (slotType === "chapter_test") return "chapter_test";
  return "unit_test";
}

export function buildPaperBuilderHref(opts: {
  slot: Pick<
    ExamCalendarSlot,
    "id" | "title" | "slot_type" | "chapters" | "marks" | "duration_mins"
  >;
  calendarId: string;
  subject: string;
  ncertClassDigits: string;
  linkedPaperId?: number | null;
}): string {
  if (opts.linkedPaperId) {
    return `/teacher/paper-builder?paper_id=${opts.linkedPaperId}`;
  }
  const params = new URLSearchParams();
  params.set("from_slot", opts.slot.id);
  params.set("calendar_id", opts.calendarId);
  params.set("exam_type", slotToPaperExamType(opts.slot.slot_type));
  params.set("subject", opts.subject);
  if (opts.ncertClassDigits) params.set("ncert_class", opts.ncertClassDigits);
  const labels = opts.slot.chapters.map((c) => c.chapter_label).filter(Boolean);
  if (labels.length) params.set("chapter_label", labels.join(", "));
  const pdf = opts.slot.chapters.find((c) => c.pdf_url)?.pdf_url;
  if (pdf) params.set("pdf_url", pdf);
  params.set("title", `${opts.slot.title} — ${opts.subject}`);
  if (opts.slot.duration_mins) {
    params.set("duration_mins", String(opts.slot.duration_mins));
  }
  if (opts.slot.marks) params.set("total_marks", String(opts.slot.marks));
  return `/teacher/paper-builder?${params.toString()}`;
}

export function parseExamCalendarPaperParams(
  searchParams: URLSearchParams,
): {
  fromSlotId: string | null;
  calendarId: string | null;
  examType: string | null;
  subject: string | null;
  ncertClass: string | null;
  chapterLabel: string | null;
  pdfUrl: string | null;
  title: string | null;
  durationMins: number | null;
  totalMarks: number | null;
} {
  const exam = searchParams.get("exam_type")?.trim() || null;
  const dur = searchParams.get("duration_mins");
  const marks = searchParams.get("total_marks");
  return {
    fromSlotId: searchParams.get("from_slot")?.trim() || null,
    calendarId: searchParams.get("calendar_id")?.trim() || null,
    examType: exam && VALID_EXAM_TYPES.has(exam) ? exam : null,
    subject: searchParams.get("subject")?.trim() || null,
    ncertClass: searchParams.get("ncert_class")?.trim() || null,
    chapterLabel: searchParams.get("chapter_label")?.trim() || null,
    pdfUrl: searchParams.get("pdf_url")?.trim() || null,
    title: searchParams.get("title")?.trim() || null,
    durationMins: dur ? Number(dur) : null,
    totalMarks: marks ? Number(marks) : null,
  };
}
