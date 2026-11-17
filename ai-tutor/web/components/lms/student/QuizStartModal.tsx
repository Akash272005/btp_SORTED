"use client";

import { formatStudentDueDateTime } from "@/lib/lmsDue";
import type { AssignmentItem } from "@/services/lmsApi";
import PortalModal, {
  PortalModalActions,
} from "@/components/lms/portal/PortalModal";

/**
 * Pre-start popup (PDF flow): shows quiz meta + teacher instructions before API start.
 */
export default function QuizStartModal({
  assignment,
  onStart,
  onClose,
}: {
  assignment: AssignmentItem;
  onStart: () => void;
  onClose: () => void;
}) {
  const attemptsLeft = Math.max(
    0,
    assignment.max_attempts - assignment.attempts_used,
  );

  return (
    <PortalModal
      open
      onClose={onClose}
      title={assignment.title}
      size="sm"
      titleId="quiz-start-title"
      footer={
        <PortalModalActions
          onCancel={onClose}
          cancelLabel="Back"
          primaryLabel="Start quiz"
          onPrimary={onStart}
        />
      }
    >
      <p className="text-sm text-slate-600">
        Teacher: <span className="font-medium">{assignment.teacher_name}</span>
      </p>
      <ul className="space-y-1 text-sm text-slate-500">
        <li>
          {assignment.due_label}
          {assignment.due_at
            ? ` · ${formatStudentDueDateTime(assignment.due_at)}`
            : ""}
        </li>
        <li>
          {assignment.marks} marks · {assignment.duration_mins} min
        </li>
        <li>
          Attempts: {assignment.attempts_used} of {assignment.max_attempts} used
          {attemptsLeft > 0 ? ` (${attemptsLeft} left)` : ""}
        </li>
      </ul>

      {assignment.instructions ? (
        <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Instructions
          </p>
          <p className="mt-1 text-sm text-slate-700">{assignment.instructions}</p>
        </div>
      ) : null}
    </PortalModal>
  );
}
