"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ClipboardList, MoreVertical, Trash2, Users } from "lucide-react";
import {
  assignmentDisplayTitle,
  assignmentProgressBarClass,
  assignmentProgressPercent,
  assignmentRowMetaLine,
  assignmentRowStyles,
  assignmentStatusPillLabel,
  assignmentSubjectBadgeClass,
  assignmentSubmissionsTooltip,
} from "@/lib/assignmentListUi";
import type { AssignmentItem } from "@/services/lmsApi";

type Props = {
  assignment: AssignmentItem;
  onDelete: () => void;
  deleteDisabled?: boolean;
  highlighted?: boolean;
};

export default function AssignmentListRow({
  assignment,
  onDelete,
  deleteDisabled,
  highlighted = false,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLLIElement>(null);
  const styles = assignmentRowStyles(assignment);
  const total = assignment.student_count ?? 0;
  const done = assignment.submitted_count ?? 0;
  const progress = assignmentProgressPercent(assignment);
  const showProgress = total > 0;
  const subject = assignment.subject || "General";
  const displayTitle = assignmentDisplayTitle(assignment.title, subject);
  const detailHref = `/teacher/assignments/${assignment.id}`;
  const submissionsTip = assignmentSubmissionsTooltip(assignment);

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!highlighted || !rowRef.current) return;
    rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlighted]);

  return (
    <li
      ref={rowRef}
      id={`assignment-row-${assignment.id}`}
      className={`group transition-all duration-500 ${styles.rowAccent} ${
        highlighted ? "bg-indigo-50/90 ring-2 ring-inset ring-indigo-400 shadow-sm" : ""
      }`}
    >
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
              <Link
                href={detailHref}
                className="font-semibold text-slate-900 transition-colors hover:text-indigo-700"
              >
                {displayTitle}
              </Link>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${assignmentSubjectBadgeClass(subject)}`}
              >
                {subject}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {assignmentRowMetaLine(assignment)}
            </p>
          </div>
        </div>

        {showProgress ? (
          <div className="w-full min-w-[140px] max-w-[200px] lg:w-48">
            <p className="text-right text-xs font-medium text-slate-500 tabular-nums">
              {done}/{total} submitted
              <span className="text-slate-400"> · </span>
              {progress}%
            </p>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${done} of ${total} students submitted`}
            >
              <div
                className={`h-full rounded-full transition-all ${assignmentProgressBarClass(assignment, progress)}`}
                style={{ width: `${Math.max(progress, progress === 0 ? 0 : 4)}%` }}
              />
            </div>
          </div>
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${styles.pill}`}
          >
            {assignmentStatusPillLabel(assignment)}
          </span>
          <Link
            href={detailHref}
            title={submissionsTip}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-800 active:scale-[0.98] lg:opacity-90 lg:group-hover:opacity-100"
          >
            <Users className="h-4 w-4" aria-hidden />
            Submissions
          </Link>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-700 active:scale-[0.98]"
              aria-label={`More actions for ${assignment.title}`}
              aria-expanded={menuOpen}
            >
              <MoreVertical className="h-4 w-4" />
            </button>
            {menuOpen ? (
              <div
                className="absolute right-0 top-full z-10 mt-1 min-w-[10rem] rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  disabled={deleteDisabled}
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  Delete
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}
