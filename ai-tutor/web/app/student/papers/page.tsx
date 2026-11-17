"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import PortalFilterTabs from "@/components/lms/portal/PortalFilterTabs";
import PortalListEmpty from "@/components/lms/portal/PortalListEmpty";
import PortalListError from "@/components/lms/portal/PortalListError";
import PortalListFilterPanel from "@/components/lms/portal/PortalListFilterPanel";
import PortalListSearch from "@/components/lms/portal/PortalListSearch";
import StudentListPageShell from "@/components/lms/student/StudentListPageShell";
import StudentPaperListRow from "@/components/lms/student/StudentPaperListRow";
import StudentPaperSummaryCards from "@/components/lms/student/StudentPaperSummaryCards";
import StudentPortalListLayout from "@/components/lms/student/StudentPortalListLayout";
import StudentQuizPageLoading from "@/components/lms/student/StudentQuizPageLoading";
import { DASHBOARD_REFRESH_EVENT } from "@/lib/studentQuizSession";
import {
  matchesStudentPaperFilterTab,
  studentPaperSummaryCounts,
  studentPaperTabCounts,
  type StudentPaperFilterTab,
} from "@/lib/studentPaperListUi";
import { dashboardHeader, dashboardPage } from "@/lib/portalDashboardUi";
import { portalList } from "@/lib/portalListUi";
import { matchesPortalListSearch } from "@/lib/portalListSearch";
import { fetchStudentPapers, type StudentPaperItem } from "@/services/lmsApi";
import { usePortalStore } from "@/store/portalStore";

const FILTER_TABS: { id: StudentPaperFilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "submitted", label: "Submitted" },
  { id: "overdue", label: "Overdue" },
];

function StudentPapersContent() {
  const [items, setItems] = useState<StudentPaperItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<StudentPaperFilterTab>("pending");
  const setNavBadges = usePortalStore((s) => s.setNavBadges);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetchStudentPapers()
      .then((list) => {
        setItems(list);
        const pendingCount = list.filter((p) =>
          matchesStudentPaperFilterTab(p, "pending"),
        ).length;
        setNavBadges({ papers: pendingCount });
        return list;
      })
      .catch((e) => {
        setError(
          e instanceof Error ? e.message : "Could not load question papers",
        );
        return [] as StudentPaperItem[];
      })
      .finally(() => setLoading(false));
  }, [setNavBadges]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, handler);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, handler);
  }, [load]);

  const summary = useMemo(() => studentPaperSummaryCounts(items), [items]);
  const tabCounts = useMemo(() => studentPaperTabCounts(items), [items]);

  const filterTabs = useMemo(
    () =>
      FILTER_TABS.map((t) => ({
        ...t,
        count: tabCounts[t.id],
      })),
    [tabCounts],
  );

  const filtered = useMemo(() => {
    return items.filter(
      (p) =>
        matchesStudentPaperFilterTab(p, filterTab) &&
        matchesPortalListSearch(
          searchQuery,
          p.title,
          p.subject,
          p.teacher_name,
          p.due_label,
          p.chapter_label,
          p.submission_mode_label,
        ),
    );
  }, [items, filterTab, searchQuery]);

  const toolbarFilters =
    !loading && !error && items.length > 0 ? (
      <PortalListFilterPanel variant="toolbar">
        <PortalFilterTabs
          tabs={filterTabs}
          active={filterTab}
          onChange={setFilterTab}
          ariaLabel="Paper filters"
          variant="toolbar"
        />
        <PortalListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search papers…"
          resultCount={filtered.length}
          totalCount={items.length}
          variant="inline"
        />
      </PortalListFilterPanel>
    ) : null;

  return (
    <StudentPortalListLayout
      toolbarStart={toolbarFilters}
      toolbarEnd={
        <Link href="/student/chat" className={dashboardHeader.primaryBtn}>
          Ask AI Tutor
        </Link>
      }
    >
      <StudentListPageShell
        title="Question Papers"
        subtitle="Papers assigned to your class — download, take online tests, or upload written answers."
        titleInShell
      >
        {loading ? (
          <StudentQuizPageLoading label="Loading your papers" />
        ) : error ? (
          <PortalListError message={error} />
        ) : items.length === 0 ? (
          <PortalListEmpty
            icon={FileText}
            title="No papers yet"
            description="Your teacher has not assigned any question papers yet. Check back later."
          />
        ) : (
          <>
            <StudentPaperSummaryCards
              counts={summary}
              onFilterClick={setFilterTab}
              activeFilterTab={filterTab}
            />
            {filtered.length === 0 ? (
              <PortalListEmpty
                icon={FileText}
                title="No papers match"
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
                <ul className="divide-y divide-slate-100">
                  {filtered.map((p) => (
                    <StudentPaperListRow
                      key={p.distribution_id}
                      paper={p}
                    />
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </StudentListPageShell>
    </StudentPortalListLayout>
  );
}

export default function StudentPapersPage() {
  return (
    <ProtectedRoute roles={["student"]}>
      <Suspense
        fallback={
          <div className={`${dashboardPage.wrap} p-8`}>
            <StudentQuizPageLoading label="Loading…" />
          </div>
        }
      >
        <StudentPapersContent />
      </Suspense>
    </ProtectedRoute>
  );
}
