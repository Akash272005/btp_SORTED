"use client";

import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, Loader2, FolderOpen } from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";
import { useTranslation } from "react-i18next";
import { useRouter } from "next/navigation";
import { createNote, fetchNotesFolders } from "@/lib/notesApi";
import { markdownToNoteHtml } from "@/lib/notesContent";
import type { FolderSelection, NotesClassFolder } from "@/types/studentNotes";

export interface SaveToNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  body: string;
  asMarkdown?: boolean;
  defaultFolder?: Partial<FolderSelection>;
  source?: string;
}

export default function SaveToNotesModal({
  isOpen,
  onClose,
  title,
  body,
  asMarkdown = true,
  defaultFolder,
  source = "ai_import",
}: SaveToNotesModalProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [folders, setFolders] = useState<NotesClassFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [selected, setSelected] = useState<FolderSelection | null>(null);
  const [noteTitle, setNoteTitle] = useState(title);

  useEffect(() => {
    if (!isOpen) return;
    setNoteTitle(title);
    setSuccess(false);
    setLoading(true);
    fetchNotesFolders()
      .then((tree) => {
        setFolders(tree);
        if (
          defaultFolder?.class_key &&
          defaultFolder?.subject_key &&
          defaultFolder?.chapter_key
        ) {
          setSelected({
            class_key: defaultFolder.class_key,
            subject_key: defaultFolder.subject_key,
            chapter_key: defaultFolder.chapter_key,
            chapter_label:
              defaultFolder.chapter_label || defaultFolder.chapter_key,
          });
          setExpandedClass(defaultFolder.class_key);
          setExpandedSubject(
            `${defaultFolder.class_key}:${defaultFolder.subject_key}`,
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [isOpen, title, defaultFolder]);

  const contentHtml = useMemo(
    () =>
      asMarkdown
        ? markdownToNoteHtml(body)
        : `<p>${body.replace(/</g, "&lt;")}</p>`,
    [body, asMarkdown],
  );

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const note = await createNote({
        title: noteTitle.trim() || title,
        class_key: selected.class_key,
        subject_key: selected.subject_key,
        chapter_key: selected.chapter_key,
        chapter_label: selected.chapter_label,
        content_html: contentHtml,
        source,
      });
      setSuccess(true);
      setTimeout(() => {
        onClose();
        router.push(`/notebook?tab=notes&noteId=${note.id}`);
      }, 800);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[520px] max-h-[85vh] flex flex-col">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 rounded-t-2xl">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            {t("notes.save_to_notes")}
          </h3>
          <ModalCloseButton onClick={onClose} absolute={false} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {success ? (
            <div className="py-12 text-center">
              <div className="w-14 h-14 bg-green-100 dark:bg-green-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                <Check className="w-7 h-7 text-green-600" />
              </div>
              <p className="font-semibold">{t("notes.saved_to_my_notes")}</p>
            </div>
          ) : loading ? (
            <div className="py-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase">
                  {t("Name")}
                </label>
                <input
                  type="text"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm dark:bg-slate-700"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">
                  {t("notes.pick_chapter_folder")}
                </label>
                <div className="max-h-48 overflow-y-auto border border-slate-200 dark:border-slate-600 rounded-xl p-2">
                  {folders.map((cls) => (
                    <div key={cls.class_key}>
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedClass((c) =>
                            c === cls.class_key ? null : cls.class_key,
                          )
                        }
                        className="w-full text-left text-xs font-semibold px-2 py-1 hover:bg-slate-50 dark:hover:bg-slate-700 rounded"
                      >
                        {cls.class_label}
                      </button>
                      {expandedClass === cls.class_key &&
                        cls.subjects.map((subj) => {
                          const sk = `${cls.class_key}:${subj.subject_key}`;
                          return (
                            <div key={sk} className="ml-3">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedSubject((s) => (s === sk ? null : sk))
                                }
                                className="w-full text-left text-xs px-2 py-1"
                              >
                                {subj.subject_label}
                              </button>
                              {expandedSubject === sk &&
                                subj.chapters.map((ch) => {
                                  const active =
                                    selected?.chapter_key === ch.chapter_key &&
                                    selected.class_key === cls.class_key &&
                                    selected.subject_key === subj.subject_key;
                                  return (
                                    <button
                                      key={ch.chapter_key}
                                      type="button"
                                      onClick={() =>
                                        setSelected({
                                          class_key: cls.class_key,
                                          subject_key: subj.subject_key,
                                          chapter_key: ch.chapter_key,
                                          chapter_label: ch.chapter_label,
                                        })
                                      }
                                      className={`w-full ml-3 flex gap-2 text-left text-xs px-2 py-1.5 rounded-lg ${
                                        active
                                          ? "bg-emerald-50 border border-emerald-200 dark:bg-emerald-900/30"
                                          : "hover:bg-slate-50 dark:hover:bg-slate-700"
                                      }`}
                                    >
                                      <FolderOpen className="w-3 h-3 shrink-0" />
                                      {ch.chapter_label}
                                    </button>
                                  );
                                })}
                            </div>
                          );
                        })}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {!success && !loading && (
          <div className="p-4 border-t flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg hover:bg-slate-100">
              {t("Cancel")}
            </button>
            <button
              type="button"
              disabled={!selected || saving}
              onClick={() => void handleSave()}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <BookOpen className="w-4 h-4" />}
              {t("notes.save_to_notes")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
