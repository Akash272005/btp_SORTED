"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import LmsToast from "@/components/lms/LmsToast";
import PortalGradeLayout, {
  PortalGradeStudentHeader,
} from "@/components/lms/portal/PortalGradeLayout";
import QuizAttemptReviewView from "@/components/lms/teacher/QuizAttemptReviewView";
import { useLmsToast } from "@/hooks/useLmsToast";
import {
  assignmentDisplayTitle,
  formatTeacherClassLabel,
} from "@/lib/assignmentListUi";
import {
  fetchTeacherQuizAttemptDetail,
  type TeacherQuizAttemptDetail,
} from "@/services/lmsApi";

export default function TeacherQuizAttemptReviewPage() {
  const params = useParams();
  const assignmentId = String(params.assignmentId ?? "");
  const attemptId = Number(params.attemptId ?? 0);
  const [data, setData] = useState<TeacherQuizAttemptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast, showError } = useLmsToast();

  const load = useCallback(async () => {
    if (!assignmentId || !attemptId) return;
    setLoading(true);
    try {
      const row = await fetchTeacherQuizAttemptDetail(assignmentId, attemptId);
      setData(row);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load attempt");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [assignmentId, attemptId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const subjectLabel = data?.subject || "General";
  const displayTitle = data
    ? assignmentDisplayTitle(data.title, subjectLabel)
    : "Quiz review";

  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <LmsToast toast={toast} theme="light" />
      <PortalGradeLayout
        backHref={`/teacher/assignments/${encodeURIComponent(assignmentId)}`}
        backLabel="Back to submissions"
        loading={loading}
        loadingLabel="Loading student attempt…"
        header={
          data ? (
            <PortalGradeStudentHeader
              studentName={data.student_name}
              distributionTitle={displayTitle}
              modeHint={`${formatTeacherClassLabel(data.class_id)} · ${subjectLabel}`}
              scoreLine={
                <>
                  Score:{" "}
                  <span className="font-bold tabular-nums">
                    {data.score ?? 0} / {data.max_score ?? 0}
                  </span>
                  {data.percentage != null ? (
                    <span className="ml-2 text-slate-600">
                      ({data.percentage}%)
                    </span>
                  ) : null}
                  {data.roll_no ? (
                    <span className="ml-2 text-slate-500">
                      · Roll {data.roll_no}
                    </span>
                  ) : null}
                </>
              }
              statusLine={
                data.status === "completed"
                  ? "Submitted"
                  : data.status === "in_progress"
                    ? "In progress"
                    : data.status
              }
            />
          ) : null
        }
      >
        {data && !loading ? <QuizAttemptReviewView detail={data} /> : null}
        {!loading && !data ? (
          <p className="text-sm text-slate-500">
            Could not load this attempt. It may have been removed.
          </p>
        ) : null}
      </PortalGradeLayout>
    </ProtectedRoute>
  );
}
