import { Clock, LogOut, Send } from "lucide-react";
import { studentQuizDisplayTitle } from "@/lib/studentQuizListUi";
import { studentQuizAttemptUi } from "@/lib/studentQuizAttemptUi";
import { dashboardHeader } from "@/lib/portalDashboardUi";
import StudentDashboardToolbar from "@/components/lms/student/StudentDashboardToolbar";
import type { AssignmentItem } from "@/types/lms";

function formatTimeLeft(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function StudentQuizAttemptToolbar({
  meta,
  attemptNumber,
  secondsLeft,
  onExit,
  onSubmit,
  allAnswered,
}: {
  meta: AssignmentItem;
  attemptNumber: number;
  secondsLeft: number | null;
  onExit: () => void;
  onSubmit: () => void;
  allAnswered?: boolean;
}) {
  const timerUrgent = secondsLeft !== null && secondsLeft < 300;
  const subject = meta.subject || "General";
  const title = studentQuizDisplayTitle(meta.title, subject);

  return (
    <StudentDashboardToolbar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-slate-900 sm:text-base">
          {title}
        </p>
        <p className="text-xs text-slate-500">
          {meta.marks} marks · {meta.duration_mins} min · Attempt {attemptNumber}{" "}
          of {meta.max_attempts}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {secondsLeft !== null ? (
          <div
            className={
              timerUrgent
                ? studentQuizAttemptUi.timerUrgent
                : studentQuizAttemptUi.timerOk
            }
          >
            <Clock className="h-4 w-4 shrink-0" aria-hidden />
            {formatTimeLeft(secondsLeft)} left
          </div>
        ) : null}
        <button
          type="button"
          onClick={onExit}
          className={studentQuizAttemptUi.exitBtn}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Save & exit
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className={`${dashboardHeader.primaryBtn} ${
            allAnswered ? "ring-2 ring-emerald-300/80" : ""
          }`}
        >
          <Send className="h-4 w-4" aria-hidden />
          Submit quiz
        </button>
      </div>
    </StudentDashboardToolbar>
  );
}
