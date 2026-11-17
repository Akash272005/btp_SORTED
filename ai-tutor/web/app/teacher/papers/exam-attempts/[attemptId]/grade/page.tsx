"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import LmsToast from "@/components/lms/LmsToast";
import PortalGradeLayout, {
  PortalGradeStudentHeader,
} from "@/components/lms/portal/PortalGradeLayout";
import { portalDetail } from "@/lib/portalDetailUi";
import { useLmsToast } from "@/hooks/useLmsToast";
import { notifyTeacherPortalRefresh } from "@/lib/teacherPortalRefresh";
import {
  fetchTeacherExamAttempt,
  gradeTeacherExamAttempt,
  type PaperExamGradeItem,
  type TeacherExamAttemptDetail,
} from "@/services/lmsApi";

export default function TeacherExamGradePage() {
  const params = useParams();
  const attemptId = String(params.attemptId ?? "");
  const [data, setData] = useState<TeacherExamAttemptDetail | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { teacher_marks: string; teacher_comment: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast, showSuccess, showError } = useLmsToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await fetchTeacherExamAttempt(attemptId);
      setData(row);
      const next: Record<string, { teacher_marks: string; teacher_comment: string }> =
        {};
      row.items.forEach((item) => {
        const tm =
          item.teacher_marks != null
            ? String(item.teacher_marks)
            : item.ai_marks != null
              ? String(item.ai_marks)
              : "";
        next[item.question_id] = {
          teacher_marks: tm,
          teacher_comment: item.teacher_comment || "",
        };
      });
      setDrafts(next);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load attempt");
    } finally {
      setLoading(false);
    }
  }, [attemptId, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(finalize: boolean) {
    if (!data) return;
    setSaving(true);
    try {
      const items = data.items.map((item) => {
        const d = drafts[item.question_id] || {
          teacher_marks: "",
          teacher_comment: "",
        };
        const marks =
          d.teacher_marks.trim() === "" ? null : Number.parseFloat(d.teacher_marks);
        return {
          question_id: item.question_id,
          teacher_marks: Number.isFinite(marks as number) ? marks : null,
          teacher_comment: d.teacher_comment.trim() || null,
        };
      });
      await gradeTeacherExamAttempt(attemptId, { items, finalize });
      showSuccess(finalize ? "Final marks saved for student" : "Draft marks saved");
      if (finalize) notifyTeacherPortalRefresh();
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const backHref = data?.distribution_id
    ? `/teacher/papers/distributions/${encodeURIComponent(data.distribution_id)}`
    : "/teacher/papers";

  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <LmsToast toast={toast} theme="light" />
      <PortalGradeLayout
        backHref={backHref}
        loading={loading}
        loadingLabel="Loading submission…"
        header={
          data ? (
            <PortalGradeStudentHeader
              studentName={data.student_name}
              distributionTitle={data.distribution_title}
              modeHint="Online exam — review and adjust marks below"
              scoreLine={
                <>
                  AI: {data.ai_score ?? "—"} / {data.max_score ?? "—"}
                  {data.teacher_score != null
                    ? ` · Final: ${data.teacher_score} / ${data.max_score ?? "—"}`
                    : null}
                </>
              }
              statusLine={data.grading_status ?? undefined}
            />
          ) : null
        }
        footer={
          data ? (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(false)}
                className={portalDetail.actionGhost}
              >
                Save draft
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save(true)}
                className={portalDetail.actionPrimary}
              >
                {saving ? "Saving…" : "Finalize & publish to student"}
              </button>
            </>
          ) : null
        }
      >
        {data ? (
          <div className="space-y-4">
            {data.items.map((item: PaperExamGradeItem, idx) => {
              const d = drafts[item.question_id] || {
                teacher_marks: "",
                teacher_comment: "",
              };
              return (
                <div key={item.question_id} className={portalDetail.gradeCard}>
                  <p className="text-xs font-medium text-slate-500">
                    Q{idx + 1} · Section {item.section_id || "—"} · {item.type || "—"}{" "}
                    · max {item.max_marks ?? "—"}
                  </p>
                  {item.question_text ? (
                    <p className="mt-2 text-sm text-slate-800">{item.question_text}</p>
                  ) : null}
                  <p className="mt-2 text-sm font-medium text-slate-900">
                    Student: {item.student_answer || "(no answer)"}
                  </p>
                  {item.correct_answer ? (
                    <p className="mt-1 text-sm text-violet-700">
                      Correct: {item.correct_answer}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-violet-600">
                    AI: {item.ai_marks ?? "—"} — {item.ai_feedback || "—"}
                  </p>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <label className={portalDetail.label}>Your marks</label>
                      <input
                        type="number"
                        step="0.5"
                        min={0}
                        max={item.max_marks || 100}
                        value={d.teacher_marks}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.question_id]: {
                              ...d,
                              teacher_marks: e.target.value,
                            },
                          }))
                        }
                        className={portalDetail.input}
                      />
                    </div>
                    <div>
                      <label className={portalDetail.label}>Comment</label>
                      <input
                        value={d.teacher_comment}
                        onChange={(e) =>
                          setDrafts((prev) => ({
                            ...prev,
                            [item.question_id]: {
                              ...d,
                              teacher_comment: e.target.value,
                            },
                          }))
                        }
                        className={portalDetail.input}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}
      </PortalGradeLayout>
    </ProtectedRoute>
  );
}
