import Link from "next/link";
import { CalendarDays } from "lucide-react";
import {
  examSlotMetaLine,
  examSlotRowStyles,
  examSlotStatusPillLabel,
  examSlotSubjectBadgeClass,
  formatExamDate,
  type FlatExamSlot,
} from "@/lib/studentExamCalendarListUi";

export default function StudentExamCalendarListRow({
  slot,
}: {
  slot: FlatExamSlot;
}) {
  const styles = examSlotRowStyles(slot);
  const subject = slot.subject || "General";

  return (
    <li className={`group transition-colors ${styles.rowAccent}`}>
      <div
        className={`flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:gap-6 ${styles.rowHover}`}
      >
        <div className="flex min-w-0 flex-1 gap-4">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}
          >
            <CalendarDays className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">{slot.title}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${examSlotSubjectBadgeClass(subject)}`}
              >
                {subject}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {examSlotMetaLine(slot)}
            </p>
            {slot.exam_date ? (
              <p className="mt-1 text-xs font-medium text-slate-600">
                {formatExamDate(slot.exam_date)}
              </p>
            ) : null}
            {slot.chapters.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {slot.chapters.map((ch) => (
                  <span
                    key={ch.chapter_key}
                    className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-indigo-100"
                  >
                    {ch.chapter_label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${styles.pill}`}
          >
            {examSlotStatusPillLabel(slot)}
          </span>
          {slot.linked_distribution_id ? (
            <>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-100">
                Paper assigned
              </span>
              <Link
                href={`/student/papers/${encodeURIComponent(slot.linked_distribution_id)}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-100 active:scale-[0.98]"
              >
                Open paper
              </Link>
            </>
          ) : slot.linked_paper_id ? (
            <span className="text-xs text-slate-500">
              Paper ready — not distributed yet
            </span>
          ) : (
            <span className="text-xs text-slate-500">Paper not assigned yet</span>
          )}
        </div>
      </div>
    </li>
  );
}
