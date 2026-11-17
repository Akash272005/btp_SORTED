import Link from "next/link";
import { FileText, Play } from "lucide-react";
import {
  isStudentPaperSubmitted,
  studentPaperPrimaryActionLabel,
  studentPaperRowMetaLine,
  studentPaperRowStyles,
  studentPaperStatusPillLabel,
  studentPaperSubjectBadgeClass,
} from "@/lib/studentPaperListUi";
import type { StudentPaperItem } from "@/services/lmsApi";

export default function StudentPaperListRow({ paper }: { paper: StudentPaperItem }) {
  const styles = studentPaperRowStyles(paper);
  const subject = paper.subject || "General";
  const submitted = isStudentPaperSubmitted(paper);
  const showScore =
    paper.last_score != null &&
    paper.last_max_score != null &&
    paper.status === "completed";

  const detailHref = `/student/papers/${encodeURIComponent(paper.distribution_id)}`;
  const resultHref = `${detailHref}/result`;

  return (
    <li className={`group transition-colors ${styles.rowAccent}`}>
      <div
        className={`flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:gap-6 ${styles.rowHover}`}
      >
        <div className="flex min-w-0 flex-1 gap-4">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}
          >
            <FileText className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-slate-900">{paper.title}</p>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${studentPaperSubjectBadgeClass(subject)}`}
              >
                {subject}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {studentPaperRowMetaLine(paper)}
            </p>
            {paper.chapter_label ? (
              <p className="mt-1 line-clamp-1 text-xs text-slate-500">
                {paper.chapter_label}
              </p>
            ) : null}
            {showScore ? (
              <p className="mt-1 text-xs font-medium text-emerald-600">
                Score {paper.last_score}/{paper.last_max_score}
                {paper.last_percentage != null
                  ? ` (${paper.last_percentage}%)`
                  : ""}
              </p>
            ) : paper.progress_label && !submitted ? (
              <p className="mt-1 text-xs text-slate-600">{paper.progress_label}</p>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${styles.pill}`}
          >
            {studentPaperStatusPillLabel(paper)}
          </span>
          {!submitted ? (
            <Link
              href={detailHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-800 active:scale-[0.98] lg:opacity-90 lg:group-hover:opacity-100"
            >
              <Play className="h-4 w-4" aria-hidden />
              {studentPaperPrimaryActionLabel(paper)}
            </Link>
          ) : null}
          {submitted ? (
            <>
              <Link
                href={resultHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
              >
                View result
              </Link>
              <Link
                href={detailHref}
                className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-100 active:scale-[0.98]"
              >
                Open paper
              </Link>
            </>
          ) : (
            <Link
              href={detailHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
            >
              View details
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}
