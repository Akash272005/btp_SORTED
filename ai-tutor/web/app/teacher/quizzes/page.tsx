"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ClipboardList, FileQuestion, Plus, Users } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import LmsToast from "@/components/lms/LmsToast";
import PortalFilterTabs, {
  PortalSubFilterTabs,
} from "@/components/lms/portal/PortalFilterTabs";
import PortalListEmpty from "@/components/lms/portal/PortalListEmpty";
import PortalListError from "@/components/lms/portal/PortalListError";
import PortalListFilterPanel from "@/components/lms/portal/PortalListFilterPanel";
import PortalAssignmentPageLoading from "@/components/lms/portal/PortalAssignmentPageLoading";
import PortalListSearch from "@/components/lms/portal/PortalListSearch";
import PortalQuizHubSummaryCards from "@/components/lms/portal/PortalQuizHubSummaryCards";
import AssignmentDeleteConfirmDialog from "@/components/lms/teacher/AssignmentDeleteConfirmDialog";
import AssignmentListRow from "@/components/lms/teacher/AssignmentListRow";
import CreateAssignmentModal from "@/components/lms/teacher/CreateAssignmentModal";
import QuizDeleteConfirmDialog from "@/components/lms/teacher/QuizDeleteConfirmDialog";
import QuizListRow from "@/components/lms/teacher/QuizListRow";
import TeacherListPageShell from "@/components/lms/portal/TeacherListPageShell";
import TeacherPortalListLayout from "@/components/lms/portal/TeacherPortalListLayout";
import { clearQuizBuilderDraftForQuiz } from "@/lib/quizBuilderDraft";
import {
  assignmentTabCounts,
  formatTeacherClassLabel,
  matchesAssignmentFilterTab,
} from "@/lib/assignmentListUi";
import {
  activeAssignments,
  assignmentsByQuizId,
  completedAssignments,
  normalizeLiveFilter,
  normalizeQuizHubTab,
  normalizeReadyFilter,
  publishedQuizzes,
  quizHubSummaryCounts,
  quizHubTabCounts,
  readyNotAssignedQuizzes,
  type LiveFilter,
  type QuizHubTab,
  type ReadyFilter,
} from "@/lib/quizHubListUi";
import { dashboardHeader, dashboardPage } from "@/lib/portalDashboardUi";
import { portalList } from "@/lib/portalListUi";
import { matchesPortalListSearch } from "@/lib/portalListSearch";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import { useTeacherClassStore } from "@/store/teacherClassStore";
import { useLmsToast } from "@/hooks/useLmsToast";
import {
  deleteTeacherAssignment,
  deleteTeacherQuiz,
  fetchTeacherAssignments,
  fetchTeacherQuiz,
  fetchTeacherQuizzes,
  type AssignmentItem,
  type QuizOut,
} from "@/services/lmsApi";

const TAB_CONFIG: { id: QuizHubTab; label: string }[] = [
  { id: "draft", label: "Drafts" },
  { id: "ready", label: "Ready to assign" },
  { id: "live", label: "Live in class" },
  { id: "completed", label: "Completed" },
];

const LIVE_FILTER_TABS: { id: LiveFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "due_today", label: "Due today" },
  { id: "this_week", label: "This week" },
];

function TeacherQuizzesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const classId = useTeacherClassStore((s) => s.classId);
  const [quizzes, setQuizzes] = useState<QuizOut[]>([]);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<QuizHubTab>(() =>
    normalizeQuizHubTab(searchParams.get("tab")),
  );
  const [readyFilter, setReadyFilter] = useState<ReadyFilter>(() =>
    normalizeQuizHubTab(searchParams.get("tab")) === "ready"
      ? normalizeReadyFilter(searchParams.get("ready"))
      : "not_assigned",
  );
  const [liveFilter, setLiveFilter] = useState<LiveFilter>(() =>
    normalizeQuizHubTab(searchParams.get("tab")) === "live"
      ? normalizeLiveFilter(searchParams.get("live"))
      : "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [assignTarget, setAssignTarget] = useState<QuizOut | null>(null);
  const [prefillQuizId, setPrefillQuizId] = useState("");
  const [deleteQuizTarget, setDeleteQuizTarget] = useState<QuizOut | null>(null);
  const [deleteAssignmentTarget, setDeleteAssignmentTarget] =
    useState<AssignmentItem | null>(null);
  const [deletingQuiz, setDeletingQuiz] = useState(false);
  const [deletingAssignment, setDeletingAssignment] = useState(false);
  const { toast, showSuccess, showError } = useLmsToast();
  const userId = useAuthStore((s) => s.user?.id);
  const setNavBadges = usePortalStore((s) => s.setNavBadges);
  const notifyQuizDeleted = usePortalStore((s) => s.notifyQuizDeleted);

  const classLabel = formatTeacherClassLabel(classId);
  const highlightId = searchParams.get("highlight");
  const highlightHandledRef = useRef<string | null>(null);
  /** Prevents assign modal re-opening after create while URL still has create=1. */
  const blockedAssignAutoOpenRef = useRef<string | null>(null);

  useEffect(() => {
    const nextTab = normalizeQuizHubTab(searchParams.get("tab"));
    setTab(nextTab);
    if (nextTab === "ready") {
      setReadyFilter(normalizeReadyFilter(searchParams.get("ready")));
    }
    if (nextTab === "live") {
      setLiveFilter(normalizeLiveFilter(searchParams.get("live")));
    }
  }, [searchParams]);

  useEffect(() => {
    const qid = searchParams.get("quiz_id");
    const create = searchParams.get("create");
    if (create !== "1" || !qid) return;
    if (blockedAssignAutoOpenRef.current === qid) return;

    setPrefillQuizId(qid);
    const cached = quizzes.find((q) => q.id === qid);
    if (cached) {
      setAssignTarget(cached);
      return;
    }

    let cancelled = false;
    fetchTeacherQuiz(qid)
      .then((quiz) => {
        if (!cancelled) setAssignTarget(quiz);
      })
      .catch(() => {
        if (!cancelled) {
          showError("Could not load quiz for assignment");
          setAssignTarget(null);
          setPrefillQuizId("");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [searchParams, quizzes, showError]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    return Promise.all([fetchTeacherQuizzes(), fetchTeacherAssignments(classId)])
      .then(([q, a]) => {
        setQuizzes(q);
        setAssignments(a);
        setNavBadges({ assignments: a.length });
        return { q, a };
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Load failed");
        return { q: [] as QuizOut[], a: [] as AssignmentItem[] };
      })
      .finally(() => setLoading(false));
  }, [classId, setNavBadges]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!highlightId || loading || tab !== "live") return;
    if (!assignments.some((a) => a.id === highlightId)) return;

    if (liveFilter !== "all" || searchQuery.trim()) {
      setLiveFilter("all");
      setSearchQuery("");
      router.replace(`/teacher/quizzes?tab=live&highlight=${encodeURIComponent(highlightId)}`, {
        scroll: false,
      });
      return;
    }

    if (highlightHandledRef.current === highlightId) return;
    highlightHandledRef.current = highlightId;

    const scrollTimer = window.setTimeout(() => {
      document
        .getElementById(`assignment-row-${highlightId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);

    const clearTimer = window.setTimeout(() => {
      highlightHandledRef.current = null;
      router.replace("/teacher/quizzes?tab=live", { scroll: false });
    }, 6000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightId, loading, assignments, tab, liveFilter, searchQuery, router]);

  const byQuizId = useMemo(() => assignmentsByQuizId(assignments), [assignments]);

  const published = useMemo(() => publishedQuizzes(quizzes), [quizzes]);

  const readyNotAssigned = useMemo(
    () => readyNotAssignedQuizzes(quizzes, byQuizId),
    [quizzes, byQuizId],
  );

  const readyListQuizzes = useMemo(() => {
    if (readyFilter === "not_assigned") return readyNotAssigned;
    return published;
  }, [readyFilter, readyNotAssigned, published]);

  const liveAssignments = useMemo(
    () => activeAssignments(assignments),
    [assignments],
  );

  const completedList = useMemo(
    () => completedAssignments(assignments),
    [assignments],
  );

  const filteredQuizzes = useMemo(() => {
    if (tab === "draft") return quizzes.filter((q) => q.status === "draft");
    if (tab === "ready") return readyListQuizzes;
    return quizzes;
  }, [quizzes, tab, readyListQuizzes]);

  const filteredAssignments = useMemo(() => {
    if (tab === "live") {
      return liveAssignments.filter((a) =>
        matchesAssignmentFilterTab(a, liveFilter),
      );
    }
    if (tab === "completed") return completedList;
    return assignments;
  }, [tab, liveAssignments, completedList, assignments, liveFilter]);

  const summary = useMemo(
    () => quizHubSummaryCounts(quizzes, assignments, readyNotAssigned.length),
    [quizzes, assignments, readyNotAssigned.length],
  );

  const tabCounts = useMemo(
    () => quizHubTabCounts(quizzes, assignments, readyNotAssigned.length),
    [quizzes, assignments, readyNotAssigned.length],
  );

  const liveTabCounts = useMemo(
    () => assignmentTabCounts(liveAssignments),
    [liveAssignments],
  );

  const filterTabs = useMemo(
    () =>
      TAB_CONFIG.map((t) => ({
        ...t,
        count: tabCounts[t.id],
      })),
    [tabCounts],
  );

  const liveFilterTabs = useMemo(
    () =>
      LIVE_FILTER_TABS.map((t) => ({
        ...t,
        count: liveTabCounts[t.id],
      })),
    [liveTabCounts],
  );

  const searchedQuizzes = useMemo(
    () =>
      filteredQuizzes.filter((q) =>
        matchesPortalListSearch(searchQuery, q.title, q.subject),
      ),
    [filteredQuizzes, searchQuery],
  );

  const searchedAssignments = useMemo(
    () =>
      filteredAssignments.filter((a) =>
        matchesPortalListSearch(searchQuery, a.title, a.subject, a.due_label),
      ),
    [filteredAssignments, searchQuery],
  );

  const prefillQuiz =
    assignTarget ?? quizzes.find((q) => q.id === prefillQuizId);

  const isAssignmentTab = tab === "live" || tab === "completed";
  const listCount = isAssignmentTab
    ? filteredAssignments.length
    : filteredQuizzes.length;
  const searchedCount = isAssignmentTab
    ? searchedAssignments.length
    : searchedQuizzes.length;

  function buildUrl(next: {
    tab: QuizHubTab;
    ready?: ReadyFilter;
    live?: LiveFilter;
    highlight?: string;
    create?: boolean;
    quizId?: string;
  }) {
    const params = new URLSearchParams();
    params.set("tab", next.tab);
    if (next.tab === "ready") {
      params.set("ready", next.ready ?? readyFilter);
    }
    if (next.tab === "live" && next.live) {
      params.set("live", next.live);
    }
    if (next.highlight) params.set("highlight", next.highlight);
    if (next.create && next.quizId) {
      params.set("create", "1");
      params.set("quiz_id", next.quizId);
    }
    return `/teacher/quizzes?${params.toString()}`;
  }

  function selectTab(next: QuizHubTab) {
    setTab(next);
    setSearchQuery("");
    if (next === "ready") {
      setReadyFilter("not_assigned");
      router.replace(buildUrl({ tab: next, ready: "not_assigned" }), {
        scroll: false,
      });
    } else if (next === "live") {
      setLiveFilter("all");
      router.replace(buildUrl({ tab: next, live: "all" }), { scroll: false });
    } else {
      router.replace(buildUrl({ tab: next }), { scroll: false });
    }
  }

  function selectReadyFilter(next: ReadyFilter) {
    setReadyFilter(next);
    router.replace(buildUrl({ tab: "ready", ready: next }), { scroll: false });
  }

  function selectLiveFilter(next: LiveFilter) {
    setLiveFilter(next);
    router.replace(buildUrl({ tab: "live", live: next }), { scroll: false });
  }

  function openAssignModal(quiz: QuizOut) {
    blockedAssignAutoOpenRef.current = null;
    setAssignTarget(quiz);
    setPrefillQuizId(quiz.id);
    router.replace(
      buildUrl({ tab: "ready", ready: readyFilter, create: true, quizId: quiz.id }),
      { scroll: false },
    );
  }

  function closeAssignModal() {
    const qid = prefillQuizId || assignTarget?.id;
    if (qid) blockedAssignAutoOpenRef.current = qid;
    setAssignTarget(null);
    setPrefillQuizId("");
    router.replace(buildUrl({ tab: "ready", ready: readyFilter }), {
      scroll: false,
    });
  }

  async function handleAssignmentCreated(assignmentId: string) {
    const qid = prefillQuizId || assignTarget?.id;
    if (qid) blockedAssignAutoOpenRef.current = qid;
    setAssignTarget(null);
    setPrefillQuizId("");
    setTab("live");
    setLiveFilter("all");
    setSearchQuery("");
    router.replace(
      `/teacher/quizzes?tab=live&live=all&highlight=${encodeURIComponent(assignmentId)}`,
      { scroll: false },
    );
    await load();
    showSuccess(`Assignment created for ${classLabel}`);
  }

  async function handleDeleteQuizConfirm() {
    if (!deleteQuizTarget) return;
    setDeletingQuiz(true);
    try {
      const res = await deleteTeacherQuiz(deleteQuizTarget.id);
      clearQuizBuilderDraftForQuiz(userId, deleteQuizTarget.id);
      notifyQuizDeleted(deleteQuizTarget.id);
      setDeleteQuizTarget(null);
      load();
      const suffix =
        res.assignments_removed > 0
          ? ` · ${res.assignments_removed} assignment removed`
          : "";
      showSuccess(`Quiz deleted${suffix}`);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingQuiz(false);
    }
  }

  async function handleDeleteAssignmentConfirm() {
    if (!deleteAssignmentTarget) return;
    setDeletingAssignment(true);
    try {
      const res = await deleteTeacherAssignment(deleteAssignmentTarget.id);
      const quizId = res.quiz_id ?? deleteAssignmentTarget.quiz_id;
      if (quizId) {
        clearQuizBuilderDraftForQuiz(userId, quizId);
        notifyQuizDeleted(quizId);
      }
      setDeleteAssignmentTarget(null);
      load();
      showSuccess(
        res.quiz_deleted
          ? "Assignment and quiz removed"
          : "Assignment removed from class",
      );
    } catch (e) {
      showError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingAssignment(false);
    }
  }

  const hasAnyData = quizzes.length > 0 || assignments.length > 0;

  const toolbarFilters =
    !loading && !error ? (
      <PortalListFilterPanel variant="toolbar">
        <PortalFilterTabs
          tabs={filterTabs}
          active={tab}
          onChange={selectTab}
          ariaLabel="Quiz list filters"
          variant="toolbar"
        />
        <PortalListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={isAssignmentTab ? "Search assignments…" : "Search quizzes…"}
          resultCount={searchedCount}
          totalCount={listCount}
          variant="inline"
        />
      </PortalListFilterPanel>
    ) : null;

  function renderFilterMismatchEmpty() {
    return (
      <PortalListEmpty
        icon={isAssignmentTab ? Users : FileQuestion}
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
        </p>
      </PortalListEmpty>
    );
  }

  function renderTabContent() {
    if (isAssignmentTab) {
      if (tab === "live" && liveAssignments.length === 0) {
        return (
          <PortalListEmpty
            icon={Users}
            title="Nothing live in class yet"
            description="Publish a quiz under Ready to assign, then assign it to your class."
          >
            <button
              type="button"
              onClick={() => selectTab("ready")}
              className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Go to Ready to assign →
            </button>
          </PortalListEmpty>
        );
      }
      if (tab === "completed" && completedList.length === 0) {
        return (
          <PortalListEmpty
            icon={ClipboardList}
            title="No completed assignments yet"
            description="When every student submits, assignments move here."
          >
            <button
              type="button"
              onClick={() => selectTab("live")}
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              View live in class →
            </button>
          </PortalListEmpty>
        );
      }
      if (filteredAssignments.length === 0 && tab === "live") {
        return (
          <PortalListEmpty
            icon={Users}
            title="No assignments in this filter"
            description="Try another filter or show all live assignments."
          >
            <button
              type="button"
              onClick={() => selectLiveFilter("all")}
              className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Show all live →
            </button>
          </PortalListEmpty>
        );
      }
      if (searchedAssignments.length === 0) {
        return renderFilterMismatchEmpty();
      }
      return (
        <div className={`${portalList.listPanel} pb-1`}>
          <ul className="divide-y divide-slate-100">
            {searchedAssignments.map((a) => (
              <AssignmentListRow
                key={a.id}
                assignment={a}
                highlighted={highlightId === a.id}
                onDelete={() => setDeleteAssignmentTarget(a)}
                deleteDisabled={
                  deletingAssignment && deleteAssignmentTarget?.id === a.id
                }
              />
            ))}
          </ul>
        </div>
      );
    }

    if (filteredQuizzes.length === 0) {
      if (tab === "ready") {
        return (
          <PortalListEmpty
            icon={FileQuestion}
            title={
              readyFilter === "not_assigned"
                ? "All published quizzes are already in class"
                : "No published quizzes yet"
            }
            description={
              readyFilter === "not_assigned"
                ? "Open Live in class to track progress, or create another quiz."
                : "Publish from Quiz Builder to assign quizzes to students."
            }
          >
            {readyFilter === "not_assigned" ? (
              <button
                type="button"
                onClick={() => selectTab("live")}
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                View live in class →
              </button>
            ) : (
              <Link href="/teacher/quiz-builder" className={dashboardHeader.primaryBtn}>
                Go to Quiz Builder
              </Link>
            )}
          </PortalListEmpty>
        );
      }
      if (tab === "draft") {
        return (
          <PortalListEmpty icon={FileQuestion} title="No drafts yet">
            <Link href="/teacher/quiz-builder" className={dashboardHeader.primaryBtn}>
              Create quiz
            </Link>
          </PortalListEmpty>
        );
      }
      return (
        <PortalListEmpty icon={FileQuestion} title="No quizzes in this tab yet">
          <Link href="/teacher/quiz-builder" className={dashboardHeader.primaryBtn}>
            Create quiz
          </Link>
        </PortalListEmpty>
      );
    }

    if (searchedQuizzes.length === 0) {
      return renderFilterMismatchEmpty();
    }

    return (
      <div className={`${portalList.listPanel} pb-1`}>
        <ul className="divide-y divide-slate-100">
          {searchedQuizzes.map((q) => {
            const quizAssignments = byQuizId.get(q.id) ?? [];
            return (
              <QuizListRow
                key={q.id}
                quiz={q}
                tab={tab}
                assignedToClass={quizAssignments.length > 0}
                assignmentCount={quizAssignments.length}
                onAssign={() => openAssignModal(q)}
                onLiveTab={() => selectTab("live")}
                onDelete={() => setDeleteQuizTarget(q)}
                deleteDisabled={deletingQuiz && deleteQuizTarget?.id === q.id}
              />
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <LmsToast toast={toast} theme="light" />
      <TeacherPortalListLayout
        toolbarStart={toolbarFilters}
        toolbarEnd={
          <Link href="/teacher/quiz-builder" className={dashboardHeader.primaryBtn}>
            <Plus className="h-4 w-4" aria-hidden />
            Create quiz
          </Link>
        }
      >
        <TeacherListPageShell title="Quizzes" titleInShell>
          {loading ? (
            <PortalAssignmentPageLoading label="Loading quizzes" />
          ) : error ? (
            <PortalListError message={error} />
          ) : (
            <>
              {hasAnyData ? (
                <PortalQuizHubSummaryCards
                  counts={summary}
                  onFilterClick={selectTab}
                  activeFilterTab={tab}
                />
              ) : null}
              {tab === "ready" && published.length > 0 ? (
                <div className="mb-4">
                  <PortalSubFilterTabs
                    tabs={[
                      {
                        id: "not_assigned" as const,
                        label: `Not assigned yet (${readyNotAssigned.length})`,
                      },
                      {
                        id: "all" as const,
                        label: `All published (${published.length})`,
                      },
                    ]}
                    active={readyFilter}
                    onChange={selectReadyFilter}
                  />
                </div>
              ) : null}
              {tab === "live" && liveAssignments.length > 0 ? (
                <div className="mb-4">
                  <PortalSubFilterTabs
                    tabs={liveFilterTabs}
                    active={liveFilter}
                    onChange={selectLiveFilter}
                  />
                </div>
              ) : null}
              {renderTabContent()}
            </>
          )}
        </TeacherListPageShell>
      </TeacherPortalListLayout>

      <CreateAssignmentModal
        open={Boolean(assignTarget && prefillQuizId)}
        quizId={assignTarget?.id ?? prefillQuizId}
        defaultTitle={prefillQuiz?.title ?? "Class quiz"}
        defaultSubject={prefillQuiz?.subject ?? "General"}
        defaultMarks={prefillQuiz?.total_marks ?? 10}
        defaultDuration={prefillQuiz?.duration_mins ?? 30}
        classId={classId}
        onClose={closeAssignModal}
        onCreated={(id) => void handleAssignmentCreated(id)}
      />

      <QuizDeleteConfirmDialog
        open={Boolean(deleteQuizTarget)}
        quizTitle={deleteQuizTarget?.title ?? ""}
        isPublished={deleteQuizTarget?.status === "published"}
        deleting={deletingQuiz}
        onConfirm={() => void handleDeleteQuizConfirm()}
        onCancel={() => !deletingQuiz && setDeleteQuizTarget(null)}
      />

      <AssignmentDeleteConfirmDialog
        open={Boolean(deleteAssignmentTarget)}
        assignmentTitle={deleteAssignmentTarget?.title ?? ""}
        deleting={deletingAssignment}
        onConfirm={() => void handleDeleteAssignmentConfirm()}
        onCancel={() => !deletingAssignment && setDeleteAssignmentTarget(null)}
      />
    </ProtectedRoute>
  );
}

function TeacherQuizzesPageContent() {
  return (
    <Suspense
      fallback={
        <div className={`${dashboardPage.wrap} p-8`}>
          <PortalAssignmentPageLoading label="Loading quizzes" />
        </div>
      }
    >
      <TeacherQuizzesContent />
    </Suspense>
  );
}


export default function TeacherQuizzesPage() {
  return (
    <Suspense fallback={null}>
      <TeacherQuizzesPageContent />
    </Suspense>
  );
}
