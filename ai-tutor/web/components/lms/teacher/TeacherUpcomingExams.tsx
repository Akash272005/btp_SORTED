"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronUp } from "lucide-react";
import { TEACHER_PORTAL_REFRESH_EVENT } from "@/lib/teacherPortalRefresh";
import {
  examSlotBadge,
  examSlotCta,
  examSlotMetaLine,
  formatExamSlotDateBlock,
} from "@/lib/teacherDashboardExamSlot";
import { dashboardSection, upcomingExamsUi } from "@/lib/portalDashboardUi";
import {
  fetchTeacherExamCalendarUpcoming,
  type ExamCalendarUpcomingSlot,
} from "@/services/lmsApi";

const VISIBLE_COUNT = 1;

function UpcomingExamsHeader({
  actionHref,
  actionLabel,
  expanded,
  hasMore,
  totalCount,
  onToggleExpand,
}: {
  actionHref: string;
  actionLabel: string;
  expanded?: boolean;
  hasMore?: boolean;
  totalCount?: number;
  onToggleExpand?: () => void;
}) {
  return (
    <div className={dashboardSection.heading}>
      <div className="flex min-w-0 items-center gap-3">
        <span className={upcomingExamsUi.headerIcon}>
          <CalendarDays className="h-5 w-5" aria-hidden />
        </span>
        <h2 className={dashboardSection.title}>
          <span className={dashboardSection.titleRow}>
            <span
              className={`${dashboardSection.accentDot} ${dashboardSection.accent.exams}`}
              aria-hidden
            />
            Upcoming exams
          </span>
        </h2>
      </div>
      <div className={upcomingExamsUi.headerActions}>
        {hasMore && onToggleExpand ? (
          <button
            type="button"
            onClick={onToggleExpand}
            className={upcomingExamsUi.expandBtn}
            aria-expanded={expanded}
          >
            {expanded ? (
              <>
                <ChevronUp className="h-4 w-4" aria-hidden />
                Show less
              </>
            ) : (
              <>
                <ChevronDown className="h-4 w-4" aria-hidden />
                Show full
                {totalCount !== undefined ? (
                  <span className="font-normal text-teal-600/90">
                    · {totalCount} total
                  </span>
                ) : null}
              </>
            )}
          </button>
        ) : null}
        <Link href={actionHref} className={dashboardSection.action}>
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}

function ExamSlotRow({ s }: { s: ExamCalendarUpcomingSlot }) {
  const date = formatExamSlotDateBlock(s.exam_date);
  const badge = examSlotBadge(s);
  const cta = examSlotCta(s);

  return (
    <li className={upcomingExamsUi.row}>
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className={upcomingExamsUi.dateBlock}>
          <p className={upcomingExamsUi.dateDay}>{date.day}</p>
          {date.month ? (
            <p className={upcomingExamsUi.dateMonth}>{date.month}</p>
          ) : null}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-bold text-slate-900">{s.title}</p>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ring-1 ${badge.className}`}
            >
              {badge.label}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-600">{examSlotMetaLine(s)}</p>
        </div>
      </div>
      <Link href={cta.href} className={cta.className}>
        {cta.label}
      </Link>
    </li>
  );
}

export default function TeacherUpcomingExams({ classId }: { classId: string }) {
  const [slots, setSlots] = useState<ExamCalendarUpcomingSlot[]>([]);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(() => {
    fetchTeacherExamCalendarUpcoming(classId, {
      limit: 8,
      scope: "published",
    })
      .then((r) => {
        setSlots(r.slots ?? []);
        setExpanded(false);
      })
      .catch(() => setSlots([]));
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener(TEACHER_PORTAL_REFRESH_EVENT, onRefresh);
    return () =>
      window.removeEventListener(TEACHER_PORTAL_REFRESH_EVENT, onRefresh);
  }, [load]);

  const panelClass = dashboardSection.panel.exams;

  if (!slots.length) {
    return (
      <section className={dashboardSection.root}>
        <div className={panelClass}>
          <UpcomingExamsHeader
            actionHref="/teacher/exam-calendar"
            actionLabel="Build calendar →"
          />
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-8 text-center text-sm text-slate-600">
            Publish an exam calendar to see your class exam plan here.
          </p>
        </div>
      </section>
    );
  }

  const visible = slots.slice(0, VISIBLE_COUNT);
  const hidden = slots.slice(VISIBLE_COUNT);
  const hasMore = hidden.length > 0;

  return (
    <section className={dashboardSection.root}>
      <div className={panelClass}>
        <UpcomingExamsHeader
          actionHref="/teacher/exam-calendar"
          actionLabel="View full calendar →"
          expanded={expanded}
          hasMore={hasMore}
          totalCount={slots.length}
          onToggleExpand={() => setExpanded((v) => !v)}
        />
        <ul className={upcomingExamsUi.list}>
          {visible.map((s) => (
            <ExamSlotRow key={s.slot_id} s={s} />
          ))}
          {hasMore && expanded
            ? hidden.map((s) => <ExamSlotRow key={s.slot_id} s={s} />)
            : null}
        </ul>
      </div>
    </section>
  );
}
