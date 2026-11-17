"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, List, Printer } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import PortalFilterTabs from "@/components/lms/portal/PortalFilterTabs";
import PortalListEmpty from "@/components/lms/portal/PortalListEmpty";
import PortalListError from "@/components/lms/portal/PortalListError";
import PortalListFilterPanel from "@/components/lms/portal/PortalListFilterPanel";
import PortalListSearch from "@/components/lms/portal/PortalListSearch";
import ExamCalendarMonthView from "@/components/lms/teacher/ExamCalendarMonthView";
import StudentExamCalendarListRow from "@/components/lms/student/StudentExamCalendarListRow";
import StudentExamCalendarSummaryCards from "@/components/lms/student/StudentExamCalendarSummaryCards";
import StudentListPageShell from "@/components/lms/student/StudentListPageShell";
import StudentPortalListLayout from "@/components/lms/student/StudentPortalListLayout";
import StudentQuizPageLoading from "@/components/lms/student/StudentQuizPageLoading";
import {
  flattenExamSlots,
  matchesExamCalendarFilterTab,
  studentExamCalendarSummaryCounts,
  studentExamCalendarTabCounts,
  type StudentExamCalendarFilterTab,
} from "@/lib/studentExamCalendarListUi";
import { dashboardHeader } from "@/lib/portalDashboardUi";
import { portalList } from "@/lib/portalListUi";
import { matchesPortalListSearch } from "@/lib/portalListSearch";
import {
  fetchStudentExamCalendar,
  type ExamCalendar,
} from "@/services/lmsApi";

const FILTER_TABS: { id: StudentExamCalendarFilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past" },
];

export default function StudentExamCalendarPage() {
  const [calendars, setCalendars] = useState<ExamCalendar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "month">("list");
  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [filterTab, setFilterTab] =
    useState<StudentExamCalendarFilterTab>("upcoming");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchStudentExamCalendar()
      .then((r) => setCalendars(r.calendars ?? []))
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Could not load exam calendar"),
      )
      .finally(() => setLoading(false));
  }, []);

  const subjects = useMemo(
    () => [...new Set(calendars.map((c) => c.subject))].sort(),
    [calendars],
  );

  const filteredCalendars = useMemo(() => {
    if (subjectFilter === "all") return calendars;
    return calendars.filter((c) => c.subject === subjectFilter);
  }, [calendars, subjectFilter]);

  const slots = useMemo(
    () => flattenExamSlots(filteredCalendars),
    [filteredCalendars],
  );

  const summary = useMemo(() => studentExamCalendarSummaryCounts(slots), [slots]);
  const tabCounts = useMemo(() => studentExamCalendarTabCounts(slots), [slots]);

  const filterTabs = useMemo(
    () =>
      FILTER_TABS.map((t) => ({
        ...t,
        count: tabCounts[t.id],
      })),
    [tabCounts],
  );

  const filtered = useMemo(() => {
    return slots.filter(
      (slot) =>
        matchesExamCalendarFilterTab(slot, filterTab) &&
        matchesPortalListSearch(
          searchQuery,
          slot.title,
          slot.subject,
          slot.year,
          slot.slot_type,
          ...slot.chapters.map((c) => c.chapter_label),
        ),
    );
  }, [slots, filterTab, searchQuery]);

  const toolbarFilters =
    !loading && !error && calendars.length > 0 ? (
      <PortalListFilterPanel variant="toolbar">
        <PortalFilterTabs
          tabs={filterTabs}
          active={filterTab}
          onChange={setFilterTab}
          ariaLabel="Exam calendar filters"
          variant="toolbar"
        />
        <PortalListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search exams…"
          resultCount={filtered.length}
          totalCount={slots.length}
          variant="inline"
        />
        {subjects.length > 1 ? (
          <select
            value={subjectFilter}
            onChange={(e) => setSubjectFilter(e.target.value)}
            className={`${dashboardHeader.select} shrink-0 py-1.5 text-xs`}
            aria-label="Filter by subject"
          >
            <option value="all">All subjects</option>
            {subjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : null}
      </PortalListFilterPanel>
    ) : null;

  const toolbarActions =
    !loading && !error && calendars.length > 0 ? (
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div
          className="flex gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1"
          role="tablist"
          aria-label="Calendar view"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "list"}
            onClick={() => setViewMode("list")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-all ${
              viewMode === "list"
                ? "text-indigo-800"
                : "text-slate-900 hover:bg-white/60"
            }`}
          >
            <List className="h-4 w-4" />
            List
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "month"}
            onClick={() => setViewMode("month")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-bold transition-all ${
              viewMode === "month"
                ? "text-indigo-800"
                : "text-slate-900 hover:bg-white/60"
            }`}
          >
            <CalendarDays className="h-4 w-4" />
            Month
          </button>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className={dashboardHeader.secondaryBtn}
        >
          <Printer className="h-4 w-4" />
          Print schedule
        </button>
      </div>
    ) : null;

  return (
    <ProtectedRoute roles={["student"]}>
      <div className="exam-schedule-print min-h-full print:bg-white">
        <StudentPortalListLayout
          toolbarStart={toolbarFilters}
          toolbarEnd={toolbarActions}
        >
          <StudentListPageShell title="Exam Calendar" titleInShell>
            {loading ? (
              <StudentQuizPageLoading label="Loading your exam schedule" />
            ) : error ? (
              <PortalListError message={error} />
            ) : calendars.length === 0 ? (
              <PortalListEmpty
                icon={CalendarDays}
                title="No exam plan yet"
                description="When your teacher publishes the yearly exam calendar, unit tests and finals will appear here with dates and chapters."
              />
            ) : (
              <>
                <StudentExamCalendarSummaryCards
                  counts={summary}
                  onFilterClick={setFilterTab}
                  activeFilterTab={filterTab}
                />
                {viewMode === "month" ? (
                  <div className={`${portalList.listPanel} p-4 print:border-0 print:p-0`}>
                    <ExamCalendarMonthView slots={filtered} theme="light" />
                  </div>
                ) : filtered.length === 0 ? (
                  <PortalListEmpty
                    icon={CalendarDays}
                    title="No exams match"
                    description="Try another filter or clear your search."
                    iconWrapClassName="bg-indigo-50"
                    iconClassName="text-indigo-400"
                  >
                    <p className="text-sm text-slate-500">
                      {searchQuery.trim() ? (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="font-semibold text-indigo-600 transition-colors hover:text-indigo-700"
                        >
                          Clear search
                        </button>
                      ) : null}
                      {searchQuery.trim() && filterTab !== "all" ? (
                        <span className="text-slate-400"> · </span>
                      ) : null}
                      {filterTab !== "all" ? (
                        <button
                          type="button"
                          onClick={() => setFilterTab("all")}
                          className="font-semibold text-indigo-600 transition-colors hover:text-indigo-700"
                        >
                          Show all
                        </button>
                      ) : null}
                    </p>
                  </PortalListEmpty>
                ) : (
                  <div className={`${portalList.listPanel} pb-1`}>
                    <ul className="divide-y-2 divide-slate-300">
                      {filtered.map((slot) => (
                        <StudentExamCalendarListRow
                          key={`${slot.calendarId}-${slot.id}`}
                          slot={slot}
                        />
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </StudentListPageShell>
        </StudentPortalListLayout>
      </div>
    </ProtectedRoute>
  );
}
