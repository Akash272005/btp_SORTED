"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import {
  attemptStatusBadgeClass,
  attemptStatusLabel,
  studentAttemptRowStyles,
  studentInitials,
} from "@/lib/assignmentDetailUi";
import type { StudentAttemptRow } from "@/services/lmsApi";

function RowContent({ student }: { student: StudentAttemptRow }) {
  const styles = studentAttemptRowStyles(student.status);
  const hasScore =
    student.status === "completed" && student.score != null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-sm font-bold tracking-tight ${styles.iconWrap}`}
        >
          {studentInitials(student.full_name)}
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold text-slate-900">
            {student.full_name}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {student.roll_no ? `Roll ${student.roll_no}` : "No roll number"}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2.5 sm:gap-3">
        <span
          className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${attemptStatusBadgeClass(student.status)}`}
        >
          {attemptStatusLabel(student.status)}
        </span>
        <span
          className={`min-w-[5.5rem] rounded-lg px-2 py-1 text-right text-sm font-bold tabular-nums ${
            hasScore
              ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
              : "text-slate-300"
          }`}
        >
          {hasScore
            ? `${student.score} / ${student.max_score ?? "—"}`
            : "—"}
        </span>
        {student.status === "completed" && student.attempt_id ? (
          <ChevronRight
            className="hidden h-5 w-5 shrink-0 text-indigo-400 sm:block"
            aria-hidden
          />
        ) : null}
      </div>
    </div>
  );
}

export default function AssignmentStudentListRow({
  assignmentId,
  student,
}: {
  assignmentId: string;
  student: StudentAttemptRow;
}) {
  const styles = studentAttemptRowStyles(student.status);
  const reviewHref =
    student.status === "completed" && student.attempt_id
      ? `/teacher/assignments/${encodeURIComponent(assignmentId)}/attempts/${student.attempt_id}`
      : null;

  if (reviewHref) {
    return (
      <li className={`${styles.rowAccent}`}>
        <Link
          href={reviewHref}
          className={`block px-4 py-4 transition-colors sm:px-5 ${styles.rowHover} hover:bg-indigo-50/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500`}
        >
          <RowContent student={student} />
        </Link>
      </li>
    );
  }

  return (
    <li
      className={`px-4 py-4 sm:px-5 ${styles.rowAccent} ${styles.rowHover}`}
    >
      <RowContent student={student} />
    </li>
  );
}
