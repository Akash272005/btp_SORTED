"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { ClipboardList, Download, Trash2 } from "lucide-react";
import LmsToast from "@/components/lms/LmsToast";
import AssignmentDeleteConfirmDialog from "@/components/lms/teacher/AssignmentDeleteConfirmDialog";
import AssignmentStudentListRow from "@/components/lms/teacher/AssignmentStudentListRow";
import AssignmentSubmissionSummaryCards from "@/components/lms/teacher/AssignmentSubmissionSummaryCards";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import AssignmentDetailPageLoading from "@/components/lms/portal/AssignmentDetailPageLoading";
import PortalListEmpty from "@/components/lms/portal/PortalListEmpty";
import PortalListError from "@/components/lms/portal/PortalListError";
import PortalRefreshButton from "@/components/lms/portal/PortalRefreshButton";
import TeacherPortalListLayout from "@/components/lms/portal/TeacherPortalListLayout";
import {
  assignmentRefreshContentFlash,
  assignmentRefreshTimestampFlash,
  dueLabelPillClass,
} from "@/lib/assignmentDetailUi";
import {
  assignmentSubjectBadgeClass,
  assignmentDisplayTitle,
  formatTeacherClassLabel,
} from "@/lib/assignmentListUi";
import { portalList } from "@/lib/portalListUi";
import { clearQuizBuilderDraftForQuiz } from "@/lib/quizBuilderDraft";
import { useAuthStore } from "@/store/authStore";
import { useTeacherClassStore } from "@/store/teacherClassStore";
import { useLmsToast } from "@/hooks/useLmsToast";
import { usePortalStore } from "@/store/portalStore";
import {
  deleteTeacherAssignment,
  downloadAssignmentScoresCsv,
  fetchAssignmentAttempts,
  fetchTeacherAssignments,
  type StudentAttemptRow,
} from "@/services/lmsApi";

export default function TeacherAssignmentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const assignmentId = String(params.assignmentId ?? "");
  const classId = useTeacherClassStore((s) => s.classId);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState<string | null>(null);
  const [marks, setMarks] = useState<number | null>(null);
  const [durationMins, setDurationMins] = useState<number | null>(null);
  const [dueLabel, setDueLabel] = useState("");
  const [assignmentClassId, setAssignmentClassId] = useState("");
  const [students, setStudents] = useState<StudentAttemptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showRefreshFlash, setShowRefreshFlash] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requestIdRef = useRef(0);
  const refreshFlashTimerRef = useRef<number | null>(null);
  const { toast, showSuccess, showError } = useLmsToast();
  const userId = useAuthStore((s) => s.user?.id);
  const setNavBadges = usePortalStore((s) => s.setNavBadges);
  const notifyQuizDeleted = usePortalStore((s) => s.notifyQuizDeleted);

  const load = useCallback(
    async (opts?: { manual?: boolean }) => {
      if (!assignmentId) return;
      const requestId = ++requestIdRef.current;
      if (opts?.manual) setRefreshing(true);
      setError(null);
      try {
        const data = await fetchAssignmentAttempts(assignmentId);
        if (requestId !== requestIdRef.current) return;
        setTitle(data.title);
        setSubject(data.subject ?? null);
        setMarks(data.marks ?? null);
        setDurationMins(data.duration_mins ?? null);
        setDueLabel(data.due_label ?? "");
        setAssignmentClassId(data.class_id);
        setStudents(data.students);
        setLastUpdated(new Date());
        if (opts?.manual) {
          setShowRefreshFlash(true);
          showSuccess("Submissions refreshed");
        }
      } catch (e) {
        if (requestId !== requestIdRef.current) return;
        const msg = e instanceof Error ? e.message : "Load failed";
        setError(msg);
        if (opts?.manual) showError(msg);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [assignmentId, showSuccess, showError],
  );

  useEffect(() => {
    if (!assignmentId) return;
    setLoading(true);
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [assignmentId, load]);

  useEffect(() => {
    if (!showRefreshFlash) return;
    if (refreshFlashTimerRef.current) {
      window.clearTimeout(refreshFlashTimerRef.current);
    }
    refreshFlashTimerRef.current = window.setTimeout(() => {
      setShowRefreshFlash(false);
      refreshFlashTimerRef.current = null;
    }, 1800);
    return () => {
      if (refreshFlashTimerRef.current) {
        window.clearTimeout(refreshFlashTimerRef.current);
        refreshFlashTimerRef.current = null;
      }
    };
  }, [showRefreshFlash]);

  const submitted = students.filter((s) => s.status === "completed").length;
  const inProgress = students.filter((s) => s.status === "in_progress").length;
  const notStarted = students.length - submitted - inProgress;
  const subjectLabel = subject || "General";
  const classLabel = formatTeacherClassLabel(
    assignmentClassId || classId,
  );
  const displayTitle = assignmentDisplayTitle(title, subjectLabel);

  const handleExportCsv = async () => {
    if (!assignmentId) return;
    setExporting(true);
    try {
      await downloadAssignmentScoresCsv(assignmentId);
      showSuccess("Scores exported");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!assignmentId) return;
    setDeleting(true);
    try {
      const res = await deleteTeacherAssignment(assignmentId);
      if (res.quiz_id) {
        clearQuizBuilderDraftForQuiz(userId, res.quiz_id);
        notifyQuizDeleted(res.quiz_id);
      }
      const remaining = await fetchTeacherAssignments(classId).catch(() => []);
      setNavBadges({ assignments: remaining.length });
      showSuccess(
        res.quiz_deleted
          ? "Assignment and quiz removed from Quizzes"
          : "Assignment removed from class",
      );
      router.push("/teacher/quizzes?tab=live");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
      setShowDelete(false);
    }
  };

  const metaParts = [
    classLabel,
    marks != null ? `${marks} marks` : null,
    durationMins != null && durationMins > 0 ? `${durationMins} min` : null,
  ].filter(Boolean);

  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <LmsToast toast={toast} theme="light" />
      <TeacherPortalListLayout
        toolbarStart={
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
                {displayTitle || "Assignment"}
              </h1>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${assignmentSubjectBadgeClass(subject)}`}
              >
                {subjectLabel}
              </span>
              {dueLabel ? (
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${dueLabelPillClass(dueLabel)}`}
                >
                  {dueLabel}
                </span>
              ) : null}
            </div>
            {metaParts.length > 0 ? (
              <p className="mt-1.5 text-sm font-medium text-slate-500">
                {metaParts.join(" · ")}
              </p>
            ) : null}
          </div>
        }
        toolbarEnd={
          <div className="flex flex-wrap items-center gap-2">
            {lastUpdated ? (
              <span
                className={`hidden text-xs font-medium sm:inline ${
                  showRefreshFlash
                    ? assignmentRefreshTimestampFlash
                    : "text-slate-500"
                }`}
              >
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            ) : null}
            <PortalRefreshButton
              refreshing={refreshing}
              disabled={!assignmentId}
              onClick={() => void load({ manual: true })}
            />
            <button
              type="button"
              disabled={exporting}
              onClick={() => void handleExportCsv()}
              className={portalList.actionIndigo}
            >
              <Download className="h-4 w-4" aria-hidden />
              {exporting ? "Exporting…" : "Export CSV"}
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => setShowDelete(true)}
              className={portalList.deleteBtn}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              Delete
            </button>
          </div>
        }
      >
        {error ? <PortalListError message={error} /> : null}

        {loading && !students.length ? (
          <AssignmentDetailPageLoading label="Loading submissions" />
        ) : students.length ? (
          <div
            className={`space-y-0 transition-all duration-500 ${
              showRefreshFlash ? assignmentRefreshContentFlash : ""
            }`}
          >
            <AssignmentSubmissionSummaryCards
              counts={{ submitted, inProgress, notStarted }}
              total={students.length}
            />
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <p className="text-sm text-slate-600">
                Click a <span className="font-semibold text-emerald-700">Completed</span>{" "}
                student to review their answers.
              </p>
              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleExportCsv()}
                className={portalList.actionIndigo}
              >
                <Download className="h-4 w-4" aria-hidden />
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            </div>
            <div className={`${portalList.listPanel} pb-1 shadow-md shadow-indigo-100/30`}>
              <ul className="divide-y divide-slate-100">
                {students.map((s) => (
                  <AssignmentStudentListRow
                    key={s.student_id}
                    assignmentId={assignmentId}
                    student={s}
                  />
                ))}
              </ul>
            </div>
          </div>
        ) : !loading ? (
          <PortalListEmpty
            icon={ClipboardList}
            title="No students in this class"
            description="Students will appear here once they are enrolled in this class."
            iconWrapClassName="bg-indigo-50"
            iconClassName="text-indigo-400"
          />
        ) : null}
      </TeacherPortalListLayout>

      <AssignmentDeleteConfirmDialog
        open={showDelete}
        assignmentTitle={title || "Assignment"}
        deleting={deleting}
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => !deleting && setShowDelete(false)}
      />
    </ProtectedRoute>
  );
}
