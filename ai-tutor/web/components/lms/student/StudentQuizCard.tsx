import Link from "next/link";
import { Clock, User } from "lucide-react";
import { formatStudentDueDateTime } from "@/lib/lmsDue";
import type { AssignmentItem } from "@/services/lmsApi";

const SUBJECT_COLORS: Record<string, string> = {
  Physics: "bg-violet-100 text-violet-700 ring-violet-200",
  Chemistry: "bg-cyan-100 text-cyan-700 ring-cyan-200",
  Biology: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  Mathematics: "bg-blue-100 text-blue-700 ring-blue-200",
};

function subjectBadgeClass(subject?: string | null): string {
  if (subject && SUBJECT_COLORS[subject]) return SUBJECT_COLORS[subject];
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function statusLabel(a: AssignmentItem): { text: string; className: string } {
  if (a.last_percentage != null && a.status === "completed") {
    return {
      text: "Completed",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    };
  }
  if (a.status === "in_progress") {
    return { text: "In progress", className: "bg-amber-50 text-amber-700 ring-amber-100" };
  }
  if (a.can_attempt) {
    return { text: "Pending", className: "bg-indigo-50 text-indigo-700 ring-indigo-100" };
  }
  return { text: "Closed", className: "bg-slate-100 text-slate-600 ring-slate-200" };
}

/** Quiz list card used on /student/quizzes with tab filtering. */
export default function StudentQuizCard({ assignment }: { assignment: AssignmentItem }) {
  const urgent = assignment.due_label.toLowerCase().includes("tomorrow");
  const dueClass = urgent
    ? "text-red-600"
    : assignment.due_label.toLowerCase().includes("today")
      ? "text-orange-600"
      : "text-slate-500";
  const badge = statusLabel(assignment);
  const subject = assignment.subject || "General";
  const showScore =
    assignment.last_score != null && assignment.last_max_score != null;
  const dueDateTime = formatStudentDueDateTime(assignment.due_at);

  const attemptHref = `/student/quizzes/${assignment.id}/attempt`;
  const resultHref = `/student/quizzes/${assignment.id}/result`;

  return (
    <article className="rounded-2xl border border-slate-100/80 bg-white p-5 shadow-sm transition-all hover:border-slate-200/90 hover:shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${subjectBadgeClass(subject)}`}
          >
            {subject}
          </span>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${badge.className}`}
          >
            {badge.text}
          </span>
        </div>
        <div className={`shrink-0 text-right text-sm font-semibold ${dueClass}`}>
          <p>{assignment.due_label}</p>
          {dueDateTime ? (
            <p className="mt-0.5 text-xs font-medium text-slate-500">{dueDateTime}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 min-w-0">
          <h3 className="text-lg font-semibold text-slate-900">{assignment.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5" />
              {assignment.teacher_name}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {assignment.duration_mins} min · {assignment.marks} marks
            </span>
          </p>
          {showScore ? (
            <p className="mt-2 text-sm font-medium text-emerald-700">
              Score {assignment.last_score}/{assignment.last_max_score}
              {assignment.last_percentage != null
                ? ` (${assignment.last_percentage}%)`
                : ""}
            </p>
          ) : null}
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Attempts: {assignment.attempts_used} of {assignment.max_attempts}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        {assignment.can_attempt ? (
          <Link
            href={attemptHref}
            className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            {assignment.status === "in_progress"
              ? "Continue"
              : assignment.attempts_used > 0
                ? "Reattempt"
                : "Start"}
          </Link>
        ) : null}
        {(showScore || assignment.status === "completed") && (
          <Link
            href={resultHref}
            className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View result
          </Link>
        )}
        {!assignment.can_attempt && !showScore ? (
          <span className="text-sm text-slate-400">No attempts left</span>
        ) : null}
      </div>
    </article>
  );
}
