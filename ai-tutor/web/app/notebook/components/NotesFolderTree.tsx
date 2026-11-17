"use client";

import { ChevronDown, ChevronRight, FolderOpen, LayoutList } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  FolderSelection,
  NotesClassFolder,
  NotesListFilter,
} from "@/types/studentNotes";
import { chapterFilterKey } from "@/types/studentNotes";

interface NotesFolderTreeProps {
  folders: NotesClassFolder[];
  listFilter: NotesListFilter;
  noteCounts: Record<string, number>;
  totalNoteCount: number;
  onSelectAll: () => void;
  onSelectChapter: (folder: FolderSelection) => void;
}

export default function NotesFolderTree({
  folders,
  listFilter,
  noteCounts,
  totalNoteCount,
  onSelectAll,
  onSelectChapter,
}: NotesFolderTreeProps) {
  const { t } = useTranslation();
  const [expandedClass, setExpandedClass] = useState<Set<string>>(new Set());
  const [expandedSubject, setExpandedSubject] = useState<Set<string>>(new Set());

  const toggleClass = (key: string) => {
    setExpandedClass((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSubject = (key: string) => {
    setExpandedSubject((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const allActive = listFilter.scope === "all";

  if (folders.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-slate-400">
        {t("notes.no_folders")}
      </div>
    );
  }

  return (
    <div className="space-y-1 p-2 overflow-y-auto flex-1">
      <button
        type="button"
        onClick={onSelectAll}
        className={`w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left text-sm font-semibold transition-colors mb-2 ${
          allActive
            ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-700"
            : "text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-700/50"
        }`}
      >
        <LayoutList className="w-4 h-4 shrink-0" />
        <span className="flex-1 truncate">
          {t("notes.all_notes_count").replace("{n}", String(totalNoteCount))}
        </span>
        {totalNoteCount > 0 && (
          <span
            className={`shrink-0 min-w-[1.25rem] px-1.5 py-0.5 text-[10px] font-bold rounded-full text-center ${
              allActive
                ? "bg-emerald-600 text-white"
                : "bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-200"
            }`}
          >
            {totalNoteCount}
          </span>
        )}
      </button>

      {folders.map((cls) => {
        const classOpen = expandedClass.has(cls.class_key);
        return (
          <div key={cls.class_key}>
            <button
              type="button"
              onClick={() => toggleClass(cls.class_key)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left text-sm font-semibold text-slate-800 dark:text-slate-100"
            >
              {classOpen ? (
                <ChevronDown className="w-4 h-4 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 shrink-0" />
              )}
              {cls.class_label}
            </button>
            {classOpen &&
              cls.subjects.map((subj) => {
                const subjKey = `${cls.class_key}:${subj.subject_key}`;
                const subjOpen = expandedSubject.has(subjKey);
                return (
                  <div key={subjKey} className="ml-4">
                    <button
                      type="button"
                      onClick={() => toggleSubject(subjKey)}
                      className="w-full flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 text-left text-xs font-medium text-slate-600 dark:text-slate-300"
                    >
                      {subjOpen ? (
                        <ChevronDown className="w-3.5 h-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                      )}
                      {subj.subject_label}
                    </button>
                    {subjOpen &&
                      subj.chapters.map((ch) => {
                        const countKey = chapterFilterKey(
                          cls.class_key,
                          subj.subject_key,
                          ch.chapter_key,
                        );
                        const count = noteCounts[countKey] ?? 0;
                        const active =
                          listFilter.scope === "chapter" &&
                          listFilter.class_key === cls.class_key &&
                          listFilter.subject_key === subj.subject_key &&
                          listFilter.chapter_key === ch.chapter_key;
                        return (
                          <button
                            key={ch.chapter_key}
                            type="button"
                            onClick={() =>
                              onSelectChapter({
                                class_key: cls.class_key,
                                subject_key: subj.subject_key,
                                chapter_key: ch.chapter_key,
                                chapter_label: ch.chapter_label,
                              })
                            }
                            className={`w-full ml-4 flex items-start gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors ${
                              active
                                ? "bg-indigo-50 text-indigo-800 border border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-200 dark:border-indigo-700"
                                : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-700/50"
                            }`}
                          >
                            <FolderOpen className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                            <span className="flex-1 line-clamp-2">{ch.chapter_label}</span>
                            {count > 0 && (
                              <span
                                className={`shrink-0 min-w-[1.1rem] px-1 py-0.5 text-[9px] font-bold rounded-full text-center ${
                                  active
                                    ? "bg-indigo-600 text-white"
                                    : "bg-slate-200 text-slate-600 dark:bg-slate-600 dark:text-slate-200"
                                }`}
                              >
                                {count}
                              </span>
                            )}
                          </button>
                        );
                      })}
                  </div>
                );
              })}
          </div>
        );
      })}
    </div>
  );
}
