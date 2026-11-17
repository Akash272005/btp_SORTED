"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import PortalFilterTabs from "@/components/lms/portal/PortalFilterTabs";
import PortalListEmpty from "@/components/lms/portal/PortalListEmpty";
import PortalListError from "@/components/lms/portal/PortalListError";
import PortalListFilterPanel from "@/components/lms/portal/PortalListFilterPanel";
import PortalListSearch from "@/components/lms/portal/PortalListSearch";
import StudentListPageShell from "@/components/lms/student/StudentListPageShell";
import StudentPortalListLayout from "@/components/lms/student/StudentPortalListLayout";
import StudentQuizListRow from "@/components/lms/student/StudentQuizListRow";
import StudentQuizPageLoading from "@/components/lms/student/StudentQuizPageLoading";
import StudentQuizSummaryCards from "@/components/lms/student/StudentQuizSummaryCards";
import { DASHBOARD_REFRESH_EVENT } from "@/lib/studentQuizSession";
import {
  matchesStudentQuizFilterTab,
  studentQuizSummaryCounts,
  studentQuizTabCounts,
  type StudentQuizFilterTab,
} from "@/lib/studentQuizListUi";
import { dashboardHeader, dashboardPage } from "@/lib/portalDashboardUi";
import { portalList } from "@/lib/portalListUi";
import { matchesPortalListSearch } from "@/lib/portalListSearch";
import { fetchStudentAssignments } from "@/services/lmsApi";
import type { AssignmentItem } from "@/types/lms";

const FILTER_TABS: { id: StudentQuizFilterTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "submitted", label: "Submitted" },
  { id: "overdue", label: "Overdue" },
];

function StudentQuizzesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterTab, setFilterTab] = useState<StudentQuizFilterTab>("pending");

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return fetchStudentAssignments()
      .then((list) => {
        setItems(list);
        return list;
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Could not load quizzes");
        return [] as AssignmentItem[];
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const handler = () => load();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, handler);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, handler);
  }, [load]);

  useEffect(() => {
    const id = searchParams.get("assignment");
    if (id) router.replace(`/student/quizzes/${id}/attempt`);
  }, [searchParams, router]);

  const summary = useMemo(() => studentQuizSummaryCounts(items), [items]);
  const tabCounts = useMemo(() => studentQuizTabCounts(items), [items]);

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
      (a) =>
        matchesStudentQuizFilterTab(a, filterTab) &&
        matchesPortalListSearch(
          searchQuery,
          a.title,
          a.subject,
          a.teacher_name,
          a.due_label,
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
          ariaLabel="Quiz filters"
          variant="toolbar"
        />
        <PortalListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search quizzes…"
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
        title="My Quizzes"
        subtitle="Quizzes assigned to your class by your teachers."
        titleInShell
      >
        {loading ? (
          <StudentQuizPageLoading label="Loading your quizzes" />
        ) : error ? (
          <PortalListError message={error} />
        ) : items.length === 0 ? (
          <PortalListEmpty
            icon={ClipboardList}
            title="No quizzes yet"
            description="Your teacher has not assigned any quizzes yet. Check back later or ask your teacher."
          />
        ) : (
          <>
            <StudentQuizSummaryCards
              counts={summary}
              onFilterClick={setFilterTab}
              activeFilterTab={filterTab}
            />
            {filtered.length === 0 ? (
              <PortalListEmpty
                icon={ClipboardList}
                title="No quizzes match"
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
                  {filtered.map((a) => (
                    <StudentQuizListRow key={a.id} assignment={a} />
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

function StudentQuizzesPageContent() {
  return (
    <ProtectedRoute roles={["student"]}>
      <Suspense
        fallback={
          <div className={`${dashboardPage.wrap} p-8`}>
            <StudentQuizPageLoading label="Loading…" />
          </div>
        }
      >
        <StudentQuizzesContent />
      </Suspense>
    </ProtectedRoute>
  );
}


export default function StudentQuizzesPage() {
  return (
    <Suspense fallback={null}>
      <StudentQuizzesPageContent />
    </Suspense>
  );
}
