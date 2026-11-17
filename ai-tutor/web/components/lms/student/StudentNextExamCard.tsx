"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { formatExamSlotDateBlock } from "@/lib/teacherDashboardExamSlot";
import { upcomingExamsUi } from "@/lib/portalDashboardUi";
import { fetchStudentExamCalendar, type ExamCalendarSlot } from "@/services/lmsApi";

function nextSlot(
  calendars: Awaited<ReturnType<typeof fetchStudentExamCalendar>>["calendars"],
): (ExamCalendarSlot & { subject: string }) | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let best: (ExamCalendarSlot & { subject: string }) | null = null;
  let bestTime = Infinity;
  for (const cal of calendars) {
    for (const slot of cal.slots) {
      if (!slot.exam_date) continue;
      const d = new Date(slot.exam_date);
      const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      if (day.getTime() < today.getTime()) continue;
      const t = day.getTime();
      if (t < bestTime) {
        bestTime = t;
        best = { ...slot, subject: cal.subject };
      }
    }
  }
  return best;
}

export default function StudentNextExamCard({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [slot, setSlot] = useState<
    (ExamCalendarSlot & { subject: string }) | null
  >(null);

  useEffect(() => {
    fetchStudentExamCalendar()
      .then((r) => setSlot(nextSlot(r.calendars ?? [])))
      .catch(() => setSlot(null))
      .finally(() => setLoading(false));
  }, []);

  const dateBlock = useMemo(
    () => formatExamSlotDateBlock(slot?.exam_date),
    [slot?.exam_date],
  );

  const chapterSummary = useMemo(() => {
    if (!slot?.chapters.length) return null;
    const labels = slot.chapters.map((c) => c.chapter_label).slice(0, 2);
    const extra = slot.chapters.length - labels.length;
    return extra > 0 ? `${labels.join(", ")} +${extra}` : labels.join(", ");
  }, [slot]);

  if (loading) {
    return (
      <p className="text-sm text-slate-500">Loading upcoming exams…</p>
    );
  }

  if (!slot) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
        No upcoming exams on your calendar yet.
      </p>
    );
  }

  const paperHref = slot.linked_distribution_id
    ? `/student/papers/${encodeURIComponent(slot.linked_distribution_id)}`
    : null;

  const meta = `${slot.subject}${slot.linked_distribution_id ? " · Paper ready" : slot.linked_paper_id ? " · Paper linked" : ""}`;

  const row = (
    <div className={upcomingExamsUi.row}>
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className={upcomingExamsUi.dateBlock}>
          <p className={upcomingExamsUi.dateDay}>{dateBlock.day}</p>
          {dateBlock.month ? (
            <p className={upcomingExamsUi.dateMonth}>{dateBlock.month}</p>
          ) : null}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-base font-bold text-slate-900">{slot.title}</p>
          <p className="mt-1.5 text-sm text-slate-600">{meta}</p>
          {chapterSummary ? (
            <p className="mt-1 truncate text-xs text-slate-500">{chapterSummary}</p>
          ) : null}
        </div>
      </div>
      {paperHref ? (
        <Link
          href={paperHref}
          className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
        >
          Open paper
        </Link>
      ) : null}
    </div>
  );

  if (embedded) {
    return <div className={upcomingExamsUi.list}>{row}</div>;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <span className={upcomingExamsUi.headerIcon}>
          <CalendarDays className="h-5 w-5" aria-hidden />
        </span>
        <h2 className="text-sm font-bold text-slate-900">Upcoming exam</h2>
      </div>
      <div className="p-4">{row}</div>
    </section>
  );
}
