"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Plus, Users } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import LmsToast from "@/components/lms/LmsToast";
import PortalFilterTabs, {
  PortalSubFilterTabs,
} from "@/components/lms/portal/PortalFilterTabs";
import PortalListEmpty from "@/components/lms/portal/PortalListEmpty";
import PortalListError from "@/components/lms/portal/PortalListError";
import PortalAssignmentPageLoading from "@/components/lms/portal/PortalAssignmentPageLoading";
import PortalPaperSummaryCards from "@/components/lms/portal/PortalPaperSummaryCards";
import PortalListSearch from "@/components/lms/portal/PortalListSearch";
import PortalListFilterPanel from "@/components/lms/portal/PortalListFilterPanel";
import TeacherListPageShell from "@/components/lms/portal/TeacherListPageShell";
import TeacherPortalListLayout from "@/components/lms/portal/TeacherPortalListLayout";
import PaperDistributionListRow from "@/components/lms/teacher/PaperDistributionListRow";
import PaperListRow from "@/components/lms/teacher/PaperListRow";
import { dashboardHeader, dashboardPage } from "@/lib/portalDashboardUi";
import { portalList } from "@/lib/portalListUi";
import { matchesPortalListSearch } from "@/lib/portalListSearch";
import {
  distributionModeLabel,
  paperSummaryCounts,
  paperTabCounts,
  type PaperTab,
  type ReadyFilter,
} from "@/lib/paperListUi";
import CreatePaperDistributionModal from "@/components/lms/teacher/CreatePaperDistributionModal";
import PaperDeleteConfirmDialog from "@/components/lms/teacher/PaperDeleteConfirmDialog";
import PaperDistributionDeleteConfirmDialog from "@/components/lms/teacher/PaperDistributionDeleteConfirmDialog";
import { useLmsToast } from "@/hooks/useLmsToast";
import { apiUrl } from "@/lib/api";
import { TEACHER_PORTAL_REFRESH_EVENT } from "@/lib/teacherPortalRefresh";
import { usePortalStore } from "@/store/portalStore";
import { useTeacherClassStore } from "@/store/teacherClassStore";
import type { TeacherDashboard } from "@/types/teacher";
import {
  deletePaperDistribution,
  deleteTeacherPaper,
  fetchPaperDistributions,
  fetchTeacherDashboard,
  fetchTeacherPapers,
  regenerateTeacherPaperPdf,
  type PaperDistributionOut,
  type PaperOut,
} from "@/services/lmsApi";

const TAB_CONFIG: { id: PaperTab; label: string }[] = [
  { id: "draft", label: "Drafts" },
  { id: "ready", label: "Ready to send" },
  { id: "live", label: "Live in class" },
  { id: "grade", label: "To grade" },
];

function normalizePapersTab(value: string | null): PaperTab {
  if (value === "draft") return "draft";
  if (value === "ready" || value === "published") return "ready";
  if (value === "live" || value === "distributed") return "live";
  if (value === "grade" || value === "review") return "grade";
  return "live";
}

function normalizeReadyFilter(value: string | null): ReadyFilter {
  return value === "all" ? "all" : "not_sent";
}

function TeacherPapersContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast, showSuccess, showError } = useLmsToast();
  const setNavBadges = usePortalStore((s) => s.setNavBadges);
  const classId = useTeacherClassStore((s) => s.classId);
  const [rows, setRows] = useState<PaperOut[]>([]);
  const [distributions, setDistributions] = useState<PaperDistributionOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<PaperTab>(() =>
    normalizePapersTab(searchParams.get("tab")),
  );
  const [readyFilter, setReadyFilter] = useState<ReadyFilter>(() =>
    normalizePapersTab(searchParams.get("tab")) === "ready"
      ? normalizeReadyFilter(searchParams.get("ready"))
      : "not_sent",
  );
  const [distributeTarget, setDistributeTarget] = useState<PaperOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaperOut | null>(null);
  const [deleteDistributionTarget, setDeleteDistributionTarget] =
    useState<PaperDistributionOut | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletingDistribution, setDeletingDistribution] = useState(false);
  const [regeneratingId, setRegeneratingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const nextTab = normalizePapersTab(searchParams.get("tab"));
    setTab(nextTab);
    if (nextTab === "ready") {
      setReadyFilter(normalizeReadyFilter(searchParams.get("ready")));
    }
  }, [searchParams]);

  useEffect(() => {
    const load = () => {
      setLoading(true);
      Promise.all([
        fetchTeacherPapers(),
        fetchPaperDistributions(classId || undefined),
        fetchTeacherDashboard(classId || undefined),
      ])
        .then(([papers, dists, dashRaw]) => {
          const dash = dashRaw as TeacherDashboard;
          setRows(papers);
          setDistributions(dists);
          if (dash.nav_badges) setNavBadges(dash.nav_badges);
        })
        .catch((e) => {
          const msg = e instanceof Error ? e.message : "Failed to load papers";
          setError(msg);
          showError(msg);
        })
        .finally(() => setLoading(false));
    };
    load();
    const onRefresh = () => {
      void fetchPaperDistributions(classId || undefined)
        .then(setDistributions)
        .catch(() => {});
      void fetchTeacherDashboard(classId || undefined)
        .then((dashRaw) => {
          const dash = dashRaw as TeacherDashboard;
          if (dash.nav_badges) setNavBadges(dash.nav_badges);
        })
        .catch(() => {});
    };
    window.addEventListener(TEACHER_PORTAL_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(TEACHER_PORTAL_REFRESH_EVENT, onRefresh);
  }, [classId, showError, setNavBadges]);

  function selectTab(next: PaperTab) {
    setTab(next);
    if (next === "ready") {
      setReadyFilter("not_sent");
      router.replace("/teacher/papers?tab=ready&ready=not_sent", { scroll: false });
    } else {
      router.replace(`/teacher/papers?tab=${next}`, { scroll: false });
    }
  }

  function selectReadyFilter(next: ReadyFilter) {
    setReadyFilter(next);
    router.replace(`/teacher/papers?tab=ready&ready=${next}`, { scroll: false });
  }

  const distributionsByPaperId = useMemo(() => {
    const map = new Map<number, PaperDistributionOut[]>();
    for (const d of distributions) {
      const list = map.get(d.paper_id) || [];
      list.push(d);
      map.set(d.paper_id, list);
    }
    return map;
  }, [distributions]);

  const publishedPapers = useMemo(
    () => rows.filter((r) => r.status === "published"),
    [rows],
  );

  const readyNotSentPapers = useMemo(
    () =>
      publishedPapers.filter((p) => !(distributionsByPaperId.get(p.id)?.length ?? 0)),
    [publishedPapers, distributionsByPaperId],
  );

  const readyListPapers = useMemo(() => {
    if (readyFilter === "not_sent") return readyNotSentPapers;
    return publishedPapers;
  }, [readyFilter, readyNotSentPapers, publishedPapers]);

  const filtered = useMemo(() => {
    if (tab === "draft") return rows.filter((r) => r.status === "draft");
    if (tab === "ready") return readyListPapers;
    return rows;
  }, [rows, tab, readyListPapers]);

  const gradeCount = useMemo(
    () => distributions.filter((d) => (d.pending_grade_count ?? 0) > 0).length,
    [distributions],
  );

  const distributionsForList = useMemo(() => {
    if (tab === "grade") {
      return distributions.filter((d) => (d.pending_grade_count ?? 0) > 0);
    }
    return distributions;
  }, [distributions, tab]);

  const summary = useMemo(
    () =>
      paperSummaryCounts(rows, distributions, readyNotSentPapers.length),
    [rows, distributions, readyNotSentPapers.length],
  );

  const tabCounts = useMemo(
    () => paperTabCounts(rows, distributions, readyNotSentPapers.length),
    [rows, distributions, readyNotSentPapers.length],
  );

  const filterTabs = useMemo(
    () =>
      TAB_CONFIG.map((t) => ({
        ...t,
        count: tabCounts[t.id],
        accent: t.id === "grade" ? ("warning" as const) : ("default" as const),
      })),
    [tabCounts],
  );

  const searchedPapers = useMemo(
    () =>
      filtered.filter((p) =>
        matchesPortalListSearch(searchQuery, p.title, p.subject, p.board),
      ),
    [filtered, searchQuery],
  );

  const searchedDistributions = useMemo(() => {
    return distributionsForList.filter((d) => {
      const modeLabel = distributionModeLabel(d);
      return matchesPortalListSearch(
        searchQuery,
        d.title,
        d.class_id,
        modeLabel,
        d.due_label,
      );
    });
  }, [distributionsForList, searchQuery]);

  useEffect(() => {
    setSearchQuery("");
  }, [tab]);

  async function handleRegeneratePdf(paper: PaperOut) {
    setRegeneratingId(paper.id);
    try {
      const res = await regenerateTeacherPaperPdf(paper.id);
      showSuccess("Question paper PDF ready");
      if (res.pdf_storage_key) {
        const url = res.pdf_storage_key.startsWith("http")
          ? res.pdf_storage_key
          : apiUrl(res.pdf_storage_key);
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      showError(e instanceof Error ? e.message : "PDF regenerate failed");
    } finally {
      setRegeneratingId(null);
    }
  }

  async function confirmDeleteDistribution() {
    if (!deleteDistributionTarget) return;
    setDeletingDistribution(true);
    try {
      await deletePaperDistribution(deleteDistributionTarget.id);
      setDistributions((prev) =>
        prev.filter((d) => d.id !== deleteDistributionTarget.id),
      );
      showSuccess("Distribution removed");
      setDeleteDistributionTarget(null);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingDistribution(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteTeacherPaper(deleteTarget.id);
      const deletedPaperId = deleteTarget.id;
      setRows((prev) => prev.filter((p) => p.id !== deletedPaperId));
      setDistributions((prev) => prev.filter((d) => d.paper_id !== deletedPaperId));
      const removed = res.distributions_removed || 0;
      const suffix = removed > 0 ? ` · ${removed} distribution removed` : "";
      showSuccess(`Paper deleted${suffix}`);
      setDeleteTarget(null);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const hasAnyData = rows.length > 0 || distributions.length > 0;
  const isDistributionTab = tab === "live" || tab === "grade";
  const listCount = isDistributionTab
    ? distributionsForList.length
    : filtered.length;
  const searchedCount = isDistributionTab
    ? searchedDistributions.length
    : searchedPapers.length;

  const toolbarFilters =
    !loading && !error ? (
      <PortalListFilterPanel variant="toolbar">
        <PortalFilterTabs
          tabs={filterTabs}
          active={tab}
          onChange={selectTab}
          ariaLabel="Paper list filters"
          variant="toolbar"
        />
        <PortalListSearch
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder="Search papers…"
          resultCount={searchedCount}
          totalCount={listCount}
          variant="inline"
        />
      </PortalListFilterPanel>
    ) : null;

  function renderFilterMismatchEmpty() {
    return (
      <PortalListEmpty
        icon={isDistributionTab ? Users : FileText}
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
        </p>
      </PortalListEmpty>
    );
  }

  function renderTabContent() {
    if (isDistributionTab) {
      if (tab === "grade" && gradeCount === 0) {
        return (
          <PortalListEmpty
            icon={Users}
            title="Nothing waiting for your marks"
            description="When students submit online tests or written papers, they will appear here."
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
      if (distributionsForList.length === 0) {
        return (
          <PortalListEmpty
            icon={Users}
            title="Nothing live in class yet"
            description="Publish a paper under Ready to send, then click Distribute to send it to students."
          >
            <button
              type="button"
              onClick={() => selectTab("ready")}
              className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
            >
              Go to Ready to send →
            </button>
          </PortalListEmpty>
        );
      }
      if (searchedDistributions.length === 0) {
        return renderFilterMismatchEmpty();
      }
      return (
        <div className={`${portalList.listPanel} pb-1`}>
          <ul className="divide-y divide-slate-100">
            {searchedDistributions.map((d) => (
              <PaperDistributionListRow
                key={d.id}
                distribution={d}
                isGradeTab={tab === "grade"}
                onDelete={() => setDeleteDistributionTarget(d)}
                deleteDisabled={
                  deletingDistribution && deleteDistributionTarget?.id === d.id
                }
              />
            ))}
          </ul>
        </div>
      );
    }

    if (filtered.length === 0) {
      if (tab === "ready") {
        return (
          <PortalListEmpty
            icon={FileText}
            title={
              readyFilter === "not_sent"
                ? "All published papers are already in class"
                : "No published papers yet"
            }
            description={
              readyFilter === "not_sent"
                ? "Open Live in class to track student progress, or publish another paper."
                : "Publish from Paper Builder to send papers to students."
            }
          >
            {readyFilter === "not_sent" ? (
              <button
                type="button"
                onClick={() => selectTab("live")}
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                View live in class →
              </button>
            ) : (
              <Link
                href="/teacher/paper-builder"
                className={dashboardHeader.primaryBtn}
              >
                Go to Paper Builder
              </Link>
            )}
          </PortalListEmpty>
        );
      }
      if (tab === "draft") {
        return (
          <PortalListEmpty icon={FileText} title="No drafts yet">
            <Link href="/teacher/paper-builder" className={dashboardHeader.primaryBtn}>
              Go to Paper Builder
            </Link>
          </PortalListEmpty>
        );
      }
      return (
        <PortalListEmpty icon={FileText} title="No papers in this tab yet">
          <Link href="/teacher/paper-builder" className={dashboardHeader.primaryBtn}>
            Go to Paper Builder
          </Link>
        </PortalListEmpty>
      );
    }

    if (searchedPapers.length === 0) {
      return renderFilterMismatchEmpty();
    }

    return (
      <div className={`${portalList.listPanel} pb-1`}>
        <ul className="divide-y divide-slate-100">
          {searchedPapers.map((p) => {
            const paperDists = distributionsByPaperId.get(p.id) || [];
            return (
              <PaperListRow
                key={p.id}
                paper={p}
                tab={tab}
                sentToClass={paperDists.length > 0}
                distributionCount={paperDists.length}
                onDistribute={() => setDistributeTarget(p)}
                onLiveTab={() => selectTab("live")}
                onDelete={() => setDeleteTarget(p)}
                onRegeneratePdf={() => void handleRegeneratePdf(p)}
                regenerating={regeneratingId === p.id}
                deleteDisabled={deleting && deleteTarget?.id === p.id}
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
          <Link href="/teacher/paper-builder" className={dashboardHeader.primaryBtn}>
            <Plus className="h-4 w-4" aria-hidden />
            New paper
          </Link>
        }
      >
        <TeacherListPageShell title="Question Papers" titleInShell>
          {loading ? (
            <PortalAssignmentPageLoading label="Loading papers" />
          ) : error ? (
            <PortalListError message={error} />
          ) : (
            <>
              {hasAnyData ? (
                <PortalPaperSummaryCards
                  counts={summary}
                  onFilterClick={selectTab}
                  activeFilterTab={tab}
                />
              ) : null}
              {tab === "ready" && publishedPapers.length > 0 ? (
                <div className="mb-4">
                  <PortalSubFilterTabs
                    tabs={[
                      {
                        id: "not_sent" as const,
                        label: `Not sent yet (${readyNotSentPapers.length})`,
                      },
                      {
                        id: "all" as const,
                        label: `All published (${publishedPapers.length})`,
                      },
                    ]}
                    active={readyFilter}
                    onChange={selectReadyFilter}
                  />
                </div>
              ) : null}
              {renderTabContent()}
            </>
          )}
        </TeacherListPageShell>
      </TeacherPortalListLayout>

      <CreatePaperDistributionModal
        open={Boolean(distributeTarget)}
        paperId={distributeTarget?.id ?? 0}
        defaultTitle={distributeTarget?.title ?? ""}
        classId={classId}
        onClose={() => setDistributeTarget(null)}
        onCreated={(distributionId) => {
          showSuccess("Paper distributed to class");
          void fetchPaperDistributions(classId || undefined).then(setDistributions);
          selectTab("live");
          router.push(`/teacher/papers/distributions/${encodeURIComponent(distributionId)}`);
        }}
      />
      <PaperDeleteConfirmDialog
        open={Boolean(deleteTarget)}
        paperTitle={deleteTarget?.title ?? ""}
        isPublished={deleteTarget?.status === "published"}
        deleting={deleting}
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
      />
      <PaperDistributionDeleteConfirmDialog
        open={Boolean(deleteDistributionTarget)}
        distributionTitle={deleteDistributionTarget?.title ?? ""}
        deleting={deletingDistribution}
        onConfirm={confirmDeleteDistribution}
        onCancel={() => {
          if (!deletingDistribution) setDeleteDistributionTarget(null);
        }}
      />
    </ProtectedRoute>
  );
}

function TeacherPapersPageContent() {
  return (
    <Suspense
      fallback={
        <div className={`${dashboardPage.wrap} p-8`}>
          <PortalAssignmentPageLoading label="Loading papers" />
        </div>
      }
    >
      <TeacherPapersContent />
    </Suspense>
  );
}


export default function TeacherPapersPage() {
  return (
    <Suspense fallback={null}>
      <TeacherPapersPageContent />
    </Suspense>
  );
}
