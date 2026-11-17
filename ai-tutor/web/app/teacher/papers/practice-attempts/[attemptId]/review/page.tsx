"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import LmsToast from "@/components/lms/LmsToast";
import PortalGradeLayout, {
  PortalGradeStudentHeader,
} from "@/components/lms/portal/PortalGradeLayout";
import { portalDetail } from "@/lib/portalDetailUi";
import { useLmsToast } from "@/hooks/useLmsToast";
import {
  fetchTeacherPracticeAttempt,
  type PaperPracticeReviewItem,
  type TeacherPracticeAttemptDetail,
} from "@/services/lmsApi";

export default function TeacherPracticeReviewPage() {
  const params = useParams();
  const attemptId = String(params.attemptId ?? "");
  const [data, setData] = useState<TeacherPracticeAttemptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast, showError } = useLmsToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await fetchTeacherPracticeAttempt(attemptId);
      setData(row);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load practice submission");
    } finally {
      setLoading(false);
    }
  }, [attemptId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const backHref = data?.distribution_id
    ? `/teacher/papers/distributions/${encodeURIComponent(data.distribution_id)}`
    : "/teacher/papers";

  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <LmsToast toast={toast} theme="light" />
      <PortalGradeLayout
        backHref={backHref}
        loading={loading}
        loadingLabel="Loading answers…"
        header={
          data ? (
            <PortalGradeStudentHeader
              studentName={data.student_name}
              distributionTitle={data.distribution_title}
              modeHint="MCQ practice — auto-graded responses"
              scoreLine={
                <>
                  Score: {data.score ?? "—"} / {data.max_score ?? "—"}
                  {data.percentage != null ? ` (${data.percentage}%)` : null}
                  {data.submitted_at ? (
                    <span className="block text-xs font-normal text-slate-500">
                      Submitted {new Date(data.submitted_at).toLocaleString()}
                    </span>
                  ) : null}
                </>
              }
            />
          ) : null
        }
      >
        {data ? (
          <div className="space-y-4">
            {data.items.map((item: PaperPracticeReviewItem, idx) => (
              <div
                key={item.question_id}
                className={`${portalDetail.gradeCard} ${
                  item.is_correct
                    ? portalDetail.gradeCardCorrect
                    : portalDetail.gradeCardWrong
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-slate-500">
                    Q{idx + 1} · Section {item.section_id || "—"} · max{" "}
                    {item.max_marks ?? "—"} · awarded {item.marks_awarded ?? 0}
                  </p>
                  {item.is_correct ? (
                    <CheckCircle2
                      className="h-4 w-4 shrink-0 text-emerald-600"
                      aria-hidden
                    />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-rose-600" aria-hidden />
                  )}
                </div>
                {item.question_text ? (
                  <p className="mt-2 text-sm text-slate-800">{item.question_text}</p>
                ) : null}
                <p className="mt-2 text-sm font-medium text-slate-900">
                  Student: {item.student_answer}
                </p>
                {item.correct_answer ? (
                  <p className="mt-1 text-sm text-violet-700">
                    Correct: {item.correct_answer}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-slate-500">{item.feedback}</p>
              </div>
            ))}
          </div>
        ) : null}
      </PortalGradeLayout>
    </ProtectedRoute>
  );
}
