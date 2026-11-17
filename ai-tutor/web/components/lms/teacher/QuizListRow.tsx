"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FileQuestion, MoreVertical, Pencil, Send, Trash2, Users } from "lucide-react";
import {
  quizDisplayTitle,
  quizRowMetaLine,
  quizRowStyles,
  quizSubjectBadgeClass,
} from "@/lib/quizListUi";
import {
  quizHubStatusPillClass,
  quizHubStatusPillLabel,
  type QuizHubTab,
} from "@/lib/quizHubListUi";
import type { QuizOut } from "@/services/lmsApi";

type Props = {
  quiz: QuizOut;
  tab: QuizHubTab;
  assignedToClass: boolean;
  assignmentCount: number;
  onAssign: () => void;
  onLiveTab: () => void;
  onDelete: () => void;
  deleteDisabled?: boolean;
};

export default function QuizListRow({
  quiz,
  tab,
  assignedToClass,
  assignmentCount,
  onAssign,
  onLiveTab,
  onDelete,
  deleteDisabled,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const styles = quizRowStyles(quiz);
  const subject = quiz.subject || "General";
  const displayTitle = quizDisplayTitle(quiz.title, subject);
  const isPublished = quiz.status === "published";
  const editHref = `/teacher/quiz-builder?quiz_id=${encodeURIComponent(quiz.id)}`;
  const readyToAssign = isPublished;

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

  return (
    <li
      id={`quiz-row-${quiz.id}`}
      className={`group transition-all duration-500 ${styles.rowAccent} ${styles.rowHover}`}
    >
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex min-w-0 flex-1 gap-4">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}
          >
            <FileQuestion className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={editHref}
                className="font-semibold text-slate-900 transition-colors hover:text-indigo-700"
              >
                {displayTitle}
              </Link>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${quizSubjectBadgeClass(subject)}`}
              >
                {subject}
              </span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {quizRowMetaLine(quiz)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${quizHubStatusPillClass(quiz, tab, assignedToClass)}`}
          >
            {quizHubStatusPillLabel(quiz, tab, assignedToClass)}
          </span>
          <Link
            href={editHref}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98] lg:opacity-90 lg:group-hover:opacity-100"
          >
            <Pencil className="h-4 w-4" aria-hidden />
            Edit
          </Link>
          {assignedToClass ? (
            <button
              type="button"
              onClick={onLiveTab}
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-800 active:scale-[0.98] lg:opacity-90 lg:group-hover:opacity-100"
            >
              <Users className="h-4 w-4" aria-hidden />
              Live in class
              {assignmentCount > 1 ? ` (${assignmentCount})` : ""}
            </button>
          ) : null}
          {readyToAssign && !assignedToClass ? (
            <button
              type="button"
              onClick={onAssign}
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-[0.98] lg:opacity-90 lg:group-hover:opacity-100"
            >
              <Send className="h-4 w-4" aria-hidden />
              Assign
            </button>
          ) : null}
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-700 active:scale-[0.98]"
              aria-label={`More actions for ${quiz.title}`}
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
