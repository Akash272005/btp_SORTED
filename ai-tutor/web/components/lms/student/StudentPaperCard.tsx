"use client";

import Link from "next/link";
import { Clock, FileText, User } from "lucide-react";
import { formatStudentDueDateTime } from "@/lib/lmsDue";
import type { StudentPaperItem } from "@/services/lmsApi";

const SUBJECT_COLORS: Record<string, string> = {
  Science: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  Physics: "bg-violet-100 text-violet-700 ring-violet-200",
  Chemistry: "bg-cyan-100 text-cyan-700 ring-cyan-200",
  Biology: "bg-green-100 text-green-700 ring-green-200",
  Mathematics: "bg-blue-100 text-blue-700 ring-blue-200",
  Maths: "bg-blue-100 text-blue-700 ring-blue-200",
};

function subjectBadgeClass(subject?: string | null): string {
  if (subject && SUBJECT_COLORS[subject]) return SUBJECT_COLORS[subject];
  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function statusBadge(paper: StudentPaperItem): { text: string; className: string } {
  if (paper.status === "completed") {
    return {
      text: "Submitted",
      className: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    };
  }
  if (paper.status === "overdue") {
    return { text: "Overdue", className: "bg-rose-50 text-rose-700 ring-rose-100" };
  }
  if (paper.status === "downloaded") {
    return { text: "In progress", className: "bg-amber-50 text-amber-700 ring-amber-100" };
  }
  return { text: "Pending", className: "bg-indigo-50 text-indigo-700 ring-indigo-100" };
}

function primaryActionLabel(paper: StudentPaperItem): string {
  if (paper.status === "completed") return "Open";
  if (paper.allow_online_exam) return "Take test";
  if (paper.allow_written_submission) return "Submit answers";
  if (paper.allow_online_practice) return "Practice MCQs";
  return "Open paper";
}

/** Question paper list card — mirrors StudentQuizCard layout (My Quizzes). */
export default function StudentPaperCard({
  paper,
  embedded = false,
}: {
  paper: StudentPaperItem;
  /** Softer row styling for dashboard panels (matches teacher exam rows). */
  embedded?: boolean;
}) {
  const urgent = paper.due_label.toLowerCase().includes("tomorrow");
  const dueClass = urgent
    ? "text-red-600"
    : paper.due_label.toLowerCase().includes("today") || paper.status === "overdue"
      ? "text-orange-600"
      : "text-slate-500";
  const badge = statusBadge(paper);
  const subject = paper.subject || "General";
  const dueDateTime = formatStudentDueDateTime(paper.due_at);
  const showScore =
    paper.last_score != null && paper.last_max_score != null && paper.status === "completed";

  const detailHref = `/student/papers/${encodeURIComponent(paper.distribution_id)}`;
  const resultHref = `${detailHref}/result`;

  return (
    <article
      className={
        embedded
          ? "rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 transition-all duration-200 hover:border-teal-200/90 hover:bg-teal-50/50 hover:shadow-sm sm:p-5"
          : "rounded-2xl border border-slate-100/80 bg-white p-5 shadow-sm transition-all hover:border-slate-200/90 hover:shadow-md"
      }
    >
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
          {paper.submission_mode_label ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
              {paper.submission_mode_label}
            </span>
          ) : null}
        </div>
        <div className={`shrink-0 text-right text-sm font-semibold ${dueClass}`}>
          <p>{paper.due_label}</p>
          {dueDateTime ? (
            <p className="mt-0.5 text-xs font-medium text-slate-500">{dueDateTime}</p>
          ) : null}
        </div>
      </div>
      <div className="mt-2 min-w-0">
          <h3 className="text-lg font-semibold text-slate-900">{paper.title}</h3>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {paper.teacher_name ? (
              <span className="inline-flex items-center gap-1">
                <User className="h-3.5 w-3.5" />
                {paper.teacher_name}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {paper.duration_mins} min · {paper.total_marks} marks
            </span>
            {paper.chapter_label ? (
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3.5 w-3.5" />
                {paper.chapter_label}
              </span>
            ) : null}
          </p>
          {showScore ? (
            <p className="mt-2 text-sm font-medium text-emerald-700">
              Score {paper.last_score}/{paper.last_max_score}
              {paper.last_percentage != null ? ` (${paper.last_percentage}%)` : ""}
            </p>
          ) : paper.progress_label && paper.status !== "completed" ? (
            <p className="mt-2 text-sm text-slate-600">{paper.progress_label}</p>
          ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {paper.status !== "completed" ? (
          <Link
            href={detailHref}
            className="inline-flex rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
          >
            {primaryActionLabel(paper)}
          </Link>
        ) : null}
        {paper.status === "completed" ? (
          <>
            <Link
              href={resultHref}
              className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              View result
            </Link>
            <Link
              href={detailHref}
              className="inline-flex rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              Open paper
            </Link>
          </>
        ) : (
          <Link
            href={detailHref}
            className="inline-flex rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            View details
          </Link>
        )}
      </div>
    </article>
  );
}
