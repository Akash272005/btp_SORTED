import { Bookmark, Send } from "lucide-react";
import { dashboardHeader } from "@/lib/portalDashboardUi";

export function StudentQuizSubmitFooter({
  onSubmit,
  allAnswered,
  answeredCount,
  totalCount,
}: {
  onSubmit: () => void;
  allAnswered?: boolean;
  answeredCount: number;
  totalCount: number;
}) {
  return (
    <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-4 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          {allAnswered
            ? "All questions answered — ready to submit."
            : `${answeredCount} of ${totalCount} answered — you can still submit.`}
        </p>
        <button
          type="button"
          onClick={onSubmit}
          className={`${dashboardHeader.primaryBtn} w-full shrink-0 justify-center sm:w-auto ${
            allAnswered ? "ring-2 ring-emerald-300/80" : ""
          }`}
        >
          <Send className="h-4 w-4 shrink-0" aria-hidden />
          Submit quiz
        </button>
      </div>
    </div>
  );
}

export function StudentQuizMarkReviewButton({
  marked,
  onToggle,
}: {
  marked: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
        marked
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200/90 bg-white text-slate-600 hover:border-amber-200 hover:bg-amber-50/60"
      }`}
    >
      <Bookmark className="h-3.5 w-3.5" aria-hidden />
      {marked ? "Marked for review" : "Mark for review"}
    </button>
  );
}
