import Link from "next/link";
import { ClipboardList, Play } from "lucide-react";
import {
  isStudentQuizSubmitted,
  studentQuizAttemptPercent,
  studentQuizDisplayTitle,
  studentQuizPrimaryActionLabel,
  studentQuizProgressBarClass,
  studentQuizRowMetaLine,
  studentQuizRowStyles,
  studentQuizStatusPillLabel,
  studentQuizSubjectBadgeClass,
} from "@/lib/studentQuizListUi";
import type { AssignmentItem } from "@/types/lms";

export default function StudentQuizListRow({
  assignment,
}: {
  assignment: AssignmentItem;
}) {
  const styles = studentQuizRowStyles(assignment);
  const subject = assignment.subject || "General";
  const displayTitle = studentQuizDisplayTitle(assignment.title, subject);
  const attemptHref = `/student/quizzes/${assignment.id}/attempt`;
  const resultHref = `/student/quizzes/${assignment.id}/result`;
  const submitted = isStudentQuizSubmitted(assignment);
  const showScore =
    assignment.last_score != null && assignment.last_max_score != null;
  const progress = studentQuizAttemptPercent(assignment);
  const maxAttempts = assignment.max_attempts;

  return (
    <li className={`group transition-colors ${styles.rowAccent}`}>
      <div
        className={`flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:gap-6 ${styles.rowHover}`}
      >
        <div className="flex min-w-0 flex-1 gap-4">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}
          >
            <ClipboardList className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">{displayTitle}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${studentQuizSubjectBadgeClass(subject)}`}
              >
                {subject}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {studentQuizRowMetaLine(assignment)}
            </p>
            {showScore ? (
              <p className="mt-1 text-xs font-medium text-emerald-600">
                Score {assignment.last_score}/{assignment.last_max_score}
                {assignment.last_percentage != null
                  ? ` (${assignment.last_percentage}%)`
                  : ""}
              </p>
            ) : null}
          </div>
        </div>

        {maxAttempts > 0 ? (
          <div className="w-full min-w-[140px] max-w-[200px] lg:w-48">
            <p className="text-right text-xs font-medium text-slate-500 tabular-nums">
              {assignment.attempts_used}/{maxAttempts} attempts
              <span className="text-slate-400"> · </span>
              {progress}%
            </p>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${assignment.attempts_used} of ${maxAttempts} attempts used`}
            >
              <div
                className={`h-full rounded-full transition-all ${studentQuizProgressBarClass(assignment, progress)}`}
                style={{
                  width: `${Math.max(progress, progress === 0 ? 0 : 4)}%`,
                }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${styles.pill}`}
          >
            {studentQuizStatusPillLabel(assignment)}
          </span>
          {assignment.can_attempt ? (
            <Link
              href={attemptHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-800 active:scale-[0.98] lg:opacity-90 lg:group-hover:opacity-100"
            >
              <Play className="h-4 w-4" aria-hidden />
              {studentQuizPrimaryActionLabel(assignment)}
            </Link>
          ) : null}
          {submitted || showScore ? (
            <Link
              href={resultHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
            >
              View result
            </Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}
