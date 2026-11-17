"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import LmsToast from "@/components/lms/LmsToast";
import PaperModeBadge from "@/components/lms/PaperModeBadge";
import PortalListEmpty from "@/components/lms/portal/PortalListEmpty";
import PortalListError from "@/components/lms/portal/PortalListError";
import PortalListLoading from "@/components/lms/portal/PortalListLoading";
import PortalRefreshButton from "@/components/lms/portal/PortalRefreshButton";
import PortalSummaryMetrics from "@/components/lms/portal/PortalSummaryMetrics";
import PortalStudentTable, {
  PortalTableRow,
  PortalTableTd,
  PortalTableTh,
} from "@/components/lms/portal/PortalStudentTable";
import TeacherDetailPageShell from "@/components/lms/portal/TeacherDetailPageShell";
import { portalDetail } from "@/lib/portalDetailUi";
import { useLmsToast } from "@/hooks/useLmsToast";
import {
  fetchPaperDistributionDetail,
  type PaperDistributionDetail,
  type PaperDistributionStudentRow,
} from "@/services/lmsApi";
import { Users } from "lucide-react";

function scoreLabel(s: PaperDistributionStudentRow): string {
  if (s.exam_submitted && s.score != null) {
    const tag =
      s.grading_status === "teacher_finalized" ? "final" : "AI";
    return `${s.score} / ${s.max_score ?? "—"} (${tag})`;
  }
  if (s.written_submitted) {
    if (s.grading_status === "graded" && s.score != null) {
      return `${s.score} / ${s.max_score ?? "—"}`;
    }
    return "—";
  }
  if (s.practice_submitted && s.score != null) {
    return `${s.score} / ${s.max_score ?? "—"}`;
  }
  return "—";
}

export default function PaperDistributionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const distributionId = String(params.distributionId ?? "");
  const [data, setData] = useState<PaperDistributionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const reqRef = useRef(0);
  const { toast, showSuccess, showError } = useLmsToast();

  const load = useCallback(
    async (manual = false) => {
      if (!distributionId) return;
      const req = ++reqRef.current;
      if (manual) setRefreshing(true);
      setError(null);
      try {
        const res = await fetchPaperDistributionDetail(distributionId);
        if (req !== reqRef.current) return;
        setData(res);
        setLastUpdated(new Date());
        if (manual) showSuccess("Distribution updated");
      } catch (e) {
        if (req !== reqRef.current) return;
        const msg = e instanceof Error ? e.message : "Load failed";
        setError(msg);
        if (manual) showError(msg);
      } finally {
        if (req === reqRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [distributionId, showError, showSuccess],
  );

  useEffect(() => {
    if (!distributionId) return;
    setLoading(true);
    void load(false);
  }, [distributionId, load]);

  const students = data?.students || [];
  const summary = data?.summary;

  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <LmsToast toast={toast} theme="light" />
      <TeacherDetailPageShell
        backHref="/teacher/papers?tab=live"
        backLabel="Question Papers · Live in class"
        title={data?.distribution.title || "Distribution detail"}
        badge={
          summary ? (
            <PaperModeBadge
              mode={summary.distribution_mode}
              label={summary.distribution_mode_label}
              variant="light"
            />
          ) : null
        }
        subtitle={
          summary ? (
            <>
              {summary.viewed_count}/{summary.student_count} viewed ·{" "}
              {summary.downloaded_count} downloaded · {summary.submitted_count}{" "}
              submitted · {summary.graded_count} graded
              {summary.pending_grade_count > 0
                ? ` · ${summary.pending_grade_count} awaiting your review`
                : null}
            </>
          ) : (
            `${students.length} students`
          )
        }
        actions={
          <>
            <PortalRefreshButton
              refreshing={refreshing}
              disabled={!distributionId}
              onClick={() => void load(true)}
            />
            {lastUpdated ? (
              <p className="text-xs text-slate-500">
                Updated {lastUpdated.toLocaleTimeString()}
              </p>
            ) : null}
          </>
        }
      >
        {error ? (
          <div className="mb-4">
            <PortalListError message={error} />
            <button
              type="button"
              onClick={() => void load(true)}
              className="mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Retry
            </button>
          </div>
        ) : null}

        {loading && !data ? (
          <PortalListLoading rows={6} label="Loading distribution" />
        ) : null}

        {data ? (
          <>
            {summary ? (
              <PortalSummaryMetrics
                items={[
                  { label: "Viewed", value: summary.viewed_count },
                  { label: "Downloaded", value: summary.downloaded_count },
                  { label: "Submitted", value: summary.submitted_count },
                  { label: "Graded", value: summary.graded_count },
                ]}
              />
            ) : null}

            <div className={`mb-4 ${portalDetail.infoCard}`}>
              <p>
                Class:{" "}
                <span className="font-medium text-slate-900">
                  {data.distribution.class_id}
                </span>
              </p>
              <p className="mt-1">
                Due:{" "}
                <span className="font-medium text-slate-900">
                  {new Date(data.distribution.due_at).toLocaleString()}
                </span>
              </p>
            </div>

            {students.length === 0 ? (
              <PortalListEmpty
                icon={Users}
                title="No students in this class yet"
              />
            ) : (
              <PortalStudentTable
                minWidth="860px"
                columns={
                  <>
                    <PortalTableTh>Student</PortalTableTh>
                    <PortalTableTh>Progress</PortalTableTh>
                    <PortalTableTh>Score</PortalTableTh>
                    <PortalTableTh>Action</PortalTableTh>
                  </>
                }
              >
                {students.map((s) => (
                  <PortalTableRow key={s.student_id}>
                    <PortalTableTd>
                      <p className="font-medium text-slate-900">{s.full_name}</p>
                      <p className="text-xs text-slate-500">{s.roll_no || "—"}</p>
                    </PortalTableTd>
                    <PortalTableTd className="text-slate-600">
                      {s.progress_label || "—"}
                    </PortalTableTd>
                    <PortalTableTd className="text-slate-600">
                      {scoreLabel(s)}
                    </PortalTableTd>
                    <PortalTableTd>
                      <div className="flex flex-col items-start gap-1">
                        {s.practice_submitted && s.practice_attempt_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/teacher/papers/practice-attempts/${encodeURIComponent(s.practice_attempt_id!)}/review`,
                              )
                            }
                            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
                          >
                            View answers (practice)
                          </button>
                        ) : null}
                        {s.exam_submitted && s.attempt_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/teacher/papers/exam-attempts/${encodeURIComponent(s.attempt_id!)}/grade`,
                              )
                            }
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                          >
                            View answers (exam)
                          </button>
                        ) : null}
                        {s.written_submitted && s.written_submission_id ? (
                          <button
                            type="button"
                            onClick={() =>
                              router.push(
                                `/teacher/papers/written-submissions/${encodeURIComponent(s.written_submission_id!)}/grade`,
                              )
                            }
                            className="text-xs font-semibold text-amber-600 hover:text-amber-700"
                          >
                            View answers (written)
                          </button>
                        ) : null}
                        {!s.practice_submitted &&
                        !s.exam_submitted &&
                        !s.written_submitted ? (
                          <span className="text-slate-400">—</span>
                        ) : null}
                      </div>
                    </PortalTableTd>
                  </PortalTableRow>
                ))}
              </PortalStudentTable>
            )}
          </>
        ) : null}
      </TeacherDetailPageShell>
    </ProtectedRoute>
  );
}
