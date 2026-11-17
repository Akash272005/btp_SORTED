"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Loader2 } from "lucide-react";
import AssignmentStudentListRow from "@/components/lms/teacher/AssignmentStudentListRow";
import AssignmentSubmissionSummaryCards from "@/components/lms/teacher/AssignmentSubmissionSummaryCards";
import { portalList } from "@/lib/portalListUi";
import {
  fetchAssignmentAttempts,
  type StudentAttemptRow,
} from "@/services/lmsApi";

type Props = {
  assignmentId: string;
  detailHref: string;
};

export default function AssignmentListSubmissionsPanel({
  assignmentId,
  detailHref,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentAttemptRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchAssignmentAttempts(assignmentId)
      .then((data) => {
        if (cancelled) return;
        setStudents(data.students);
        setError(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load submissions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  const submitted = students.filter((s) => s.status === "completed").length;
  const inProgress = students.filter((s) => s.status === "in_progress").length;
  const notStarted = students.length - submitted - inProgress;

  if (loading) {
    return (
      <div className="flex items-center gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-5 text-sm text-slate-500 sm:px-5">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-400" aria-hidden />
        Loading submissions…
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-t border-slate-100 bg-rose-50/50 px-4 py-4 text-sm text-rose-700 sm:px-5">
        {error}
      </div>
    );
  }

  if (!students.length) {
    return (
      <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-4 text-sm text-slate-500 sm:px-5">
        No students in this class yet.
      </div>
    );
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-4 sm:px-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Class submissions
        </p>
        <Link
          href={detailHref}
          className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 transition-colors hover:text-indigo-700"
        >
          Open full view
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>
      <AssignmentSubmissionSummaryCards
        counts={{ submitted, inProgress, notStarted }}
        total={students.length}
      />
      <div className={`${portalList.listPanel} pb-1 shadow-sm`}>
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
  );
}
