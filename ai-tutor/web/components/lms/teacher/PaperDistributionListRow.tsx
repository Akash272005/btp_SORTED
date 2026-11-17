"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MoreVertical, Trash2, Users } from "lucide-react";
import {
  distributionRowMetaLine,
  distributionRowStyles,
} from "@/lib/paperListUi";
import type { PaperDistributionOut } from "@/services/lmsApi";

type Props = {
  distribution: PaperDistributionOut;
  isGradeTab: boolean;
  onDelete: () => void;
  deleteDisabled?: boolean;
};

export default function PaperDistributionListRow({
  distribution,
  isGradeTab,
  onDelete,
  deleteDisabled,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const styles = distributionRowStyles(isGradeTab);
  const pending = distribution.pending_grade_count ?? 0;
  const detailHref = `/teacher/papers/distributions/${encodeURIComponent(distribution.id)}`;

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
      id={`paper-distribution-row-${distribution.id}`}
      className={`group transition-all duration-500 ${styles.rowAccent} ${styles.rowHover}`}
    >
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:gap-6">
        <div className="flex min-w-0 flex-1 gap-4">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}
          >
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <Link
              href={detailHref}
              className="font-semibold text-slate-900 transition-colors hover:text-indigo-700"
            >
              {distribution.title}
            </Link>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {distributionRowMetaLine(distribution)}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {pending > 0 ? (
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${styles.pill}`}
            >
              {pending} awaiting grade
            </span>
          ) : null}
          <Link
            href={detailHref}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold shadow-sm transition-all active:scale-[0.98] lg:opacity-90 lg:group-hover:opacity-100 ${
              isGradeTab
                ? "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100"
                : "border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 hover:bg-indigo-100 hover:text-indigo-800"
            }`}
          >
            <Users className="h-4 w-4" aria-hidden />
            {isGradeTab ? "Grade submissions" : "Track students"}
          </Link>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-all hover:bg-slate-50 hover:text-slate-700 active:scale-[0.98]"
              aria-label={`More actions for ${distribution.title}`}
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
