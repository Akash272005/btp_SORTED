import Link from "next/link";
import { FileText, FlaskConical, Microscope } from "lucide-react";
import { formatStudentDueDateTime } from "@/lib/lmsDue";
import type { AssignmentItem } from "@/types/lms";

const ICONS = [FileText, FlaskConical, Microscope] as const;

/** Pick a stable icon from assignment id for visual variety on the dashboard. */
function assignmentIcon(id: string) {
  const idx = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % ICONS.length;
  return ICONS[idx];
}

interface AssignmentCardProps {
  assignment: AssignmentItem;
  compact?: boolean;
}

/**
 * Dashboard "Assigned to Me" card — shows score after completion (Phase C).
 */
export default function AssignmentCard({
  assignment,
  compact = false,
}: AssignmentCardProps) {
  const urgent = assignment.due_label.toLowerCase().includes("tomorrow");
  const badgeClass = urgent
    ? "bg-red-50 text-red-600 ring-1 ring-red-100"
    : "bg-blue-50 text-blue-600 ring-1 ring-blue-100";
  const Icon = assignmentIcon(assignment.id);
  const iconBg = urgent
    ? "bg-red-50 text-red-500"
    : "bg-indigo-50 text-indigo-500";
  const dueDateTime = formatStudentDueDateTime(assignment.due_at);

  const completed =
    assignment.status === "completed" &&
    assignment.last_score != null &&
    !assignment.can_attempt;

  const attemptHref = `/student/quizzes/${assignment.id}/attempt`;
  const resultHref = `/student/quizzes/${assignment.id}/result`;

  if (compact) {
    return (
      <div className="flex gap-4 border-b border-slate-100 px-5 py-4 last:border-b-0">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-slate-900">{assignment.title}</h3>
              <p className="mt-0.5 text-xs text-slate-500">
                {assignment.teacher_name} · {assignment.marks} marks ·{" "}
                {assignment.duration_mins} min
              </p>
              {completed ? (
                <p className="mt-1 text-xs font-medium text-emerald-600">
                  Completed · Score {assignment.last_score}/
                  {assignment.last_max_score ?? assignment.marks}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}
              >
                {completed ? "Completed" : assignment.due_label}
              </span>
              {!completed && dueDateTime ? (
                <p className="mt-1 text-[10px] font-medium text-slate-500">{dueDateTime}</p>
              ) : null}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Attempts: {assignment.attempts_used} of {assignment.max_attempts}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {assignment.can_attempt ? (
              <Link
                href={attemptHref}
                className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                {assignment.attempts_used > 0 ? "Reattempt" : "Attempt Now"}
              </Link>
            ) : null}
            {completed || assignment.last_percentage != null ? (
              <Link
                href={resultHref}
                className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                View Result
              </Link>
            ) : null}
            {!assignment.can_attempt && !completed ? (
              <span className="text-xs font-medium text-slate-400">
                No attempts left
              </span>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="flex gap-4">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${iconBg}`}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h3 className="font-semibold text-slate-900">{assignment.title}</h3>
              <p className="text-sm text-slate-500">{assignment.teacher_name}</p>
            </div>
            <div className="text-right">
              <span
                className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}
              >
                {assignment.due_label}
              </span>
              {dueDateTime ? (
                <p className="mt-1 text-[10px] font-medium text-slate-500">{dueDateTime}</p>
              ) : null}
            </div>
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {assignment.marks} marks · {assignment.duration_mins} min
          </p>
          <div className="mt-3">
            {assignment.can_attempt ? (
              <Link
                href={attemptHref}
                className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                {assignment.attempts_used > 0 ? "Reattempt" : "Attempt Now"}
              </Link>
            ) : (
              <span className="text-sm text-slate-400">No attempts left</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
