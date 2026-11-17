"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import LmsToast from "@/components/lms/LmsToast";
import PortalGradeLayout, {
  PortalGradeStudentHeader,
} from "@/components/lms/portal/PortalGradeLayout";
import { portalDetail } from "@/lib/portalDetailUi";
import { useLmsToast } from "@/hooks/useLmsToast";
import { apiUrl } from "@/lib/api";
import { notifyTeacherPortalRefresh } from "@/lib/teacherPortalRefresh";
import {
  fetchTeacherWrittenSubmission,
  gradeTeacherWrittenSubmission,
  type PaperExamGradeItem,
  type TeacherWrittenSubmissionDetail,
} from "@/services/lmsApi";

export default function TeacherWrittenGradePage() {
  const params = useParams();
  const submissionId = String(params.submissionId ?? "");
  const [data, setData] = useState<TeacherWrittenSubmissionDetail | null>(null);
  const [drafts, setDrafts] = useState<
    Record<string, { teacher_marks: string; teacher_comment: string }>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast, showSuccess, showError } = useLmsToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const row = await fetchTeacherWrittenSubmission(submissionId);
      setData(row);
      const next: Record<string, { teacher_marks: string; teacher_comment: string }> =
        {};
      row.items.forEach((item) => {
        const tm =
          item.teacher_marks != null
            ? String(item.teacher_marks)
            : item.final_marks != null
              ? String(item.final_marks)
              : "";
        next[item.question_id] = {
          teacher_marks: tm,
          teacher_comment: item.teacher_comment || "",
        };
      });
      setDrafts(next);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load submission");
    } finally {
      setLoading(false);
    }
  }, [submissionId, showError]);

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
      await gradeTeacherWrittenSubmission(submissionId, { items, finalize });
      showSuccess(finalize ? "Final marks saved for student" : "Draft marks saved");
      notifyTeacherPortalRefresh();
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
              modeHint="Written submission — answer sheets and per-question marks"
              scoreLine={
                data.teacher_score != null
                  ? `Final: ${data.teacher_score} / ${data.max_score ?? "—"}`
                  : `Pending marks · max ${data.max_score ?? "—"}`
              }
              statusLine={data.status}
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
          <>
            {data.files.length > 0 ? (
              <div className="mb-4 rounded-xl border border-amber-100 bg-amber-50/80 p-4">
                <h2 className="text-sm font-semibold text-amber-900">
                  Uploaded answer sheets
                </h2>
                <ul className="mt-2 space-y-2">
                  {data.files.map((f) => (
                    <li key={f.url}>
                      <a
                        href={f.url.startsWith("http") ? f.url : apiUrl(f.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                        {f.filename}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

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
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div>
                        <label className={portalDetail.label}>Marks</label>
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
          </>
        ) : null}
      </PortalGradeLayout>
    </ProtectedRoute>
  );
}
