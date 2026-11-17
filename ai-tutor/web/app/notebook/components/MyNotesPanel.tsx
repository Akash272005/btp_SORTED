"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  Search,
  Pencil,
  Check,
  X,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "next/navigation";
import NotesFolderTree from "./NotesFolderTree";
import NotesEditor from "@/components/notes/NotesEditor";
import SaveToNotesModal from "@/components/SaveToNotesModal";
import {
  createNote,
  deleteNote,
  fetchNote,
  fetchNotesFolders,
  fetchNotesList,
  searchNotes,
  updateNote,
} from "@/lib/notesApi";
import { appendHtmlFragment } from "@/lib/notesContent";
import { cacheNote, getCachedNote, queuePendingNote } from "@/lib/notesDb";
import { exportNoteToDocx, exportNoteToPdf } from "@/lib/notesExport";
import { debounce } from "@/lib/debounce";
import { useNotesOfflineSync } from "@/hooks/useNotesOfflineSync";
import {
  ALL_NOTES_FILTER,
  chapterFilterKey,
  type FolderSelection,
  type NotesListFilter,
  type StudentNote,
  type StudentNoteSummary,
} from "@/types/studentNotes";

export default function MyNotesPanel() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const editorWrapRef = useRef<HTMLDivElement>(null);
  const { isOnline, pendingCount, refreshPending } = useNotesOfflineSync();

  const [folders, setFolders] = useState<Awaited<ReturnType<typeof fetchNotesFolders>>>([]);
  const [foldersLoading, setFoldersLoading] = useState(true);
  const [listFilter, setListFilter] = useState<NotesListFilter>(ALL_NOTES_FILTER);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});
  const [totalNoteCount, setTotalNoteCount] = useState(0);
  const [notesList, setNotesList] = useState<StudentNoteSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedNote, setSelectedNote] = useState<StudentNote | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [contentDraft, setContentDraft] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error" | "offline">("idle");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [middleCollapsed, setMiddleCollapsed] = useState(false);
  const [snippetModalOpen, setSnippetModalOpen] = useState(false);
  const [pendingSnippet, setPendingSnippet] = useState<{ html: string; text: string } | null>(null);
  const [renamingNoteId, setRenamingNoteId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [pdfExporting, setPdfExporting] = useState(false);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const noteIdFromUrl = searchParams.get("noteId");
  const appendSnippet = searchParams.get("append");
  const savedViewFromUrl = searchParams.get("view") === "saved";

  const refreshNoteCounts = useCallback(async () => {
    try {
      const all = await fetchNotesList();
      const counts: Record<string, number> = {};
      for (const n of all) {
        const key = chapterFilterKey(n.class_key, n.subject_key, n.chapter_key);
        counts[key] = (counts[key] ?? 0) + 1;
      }
      setNoteCounts(counts);
      setTotalNoteCount(all.length);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    fetchNotesFolders()
      .then(setFolders)
      .catch(console.error)
      .finally(() => setFoldersLoading(false));
    void refreshNoteCounts();
  }, [refreshNoteCounts]);

  const loadNotesList = useCallback(
    async (filter: NotesListFilter) => {
      setListLoading(true);
      try {
        if (searchTerm.trim()) {
          const results = await searchNotes(searchTerm.trim());
          setNotesList(results);
        } else if (filter.scope === "all") {
          const list = await fetchNotesList();
          setNotesList(list);
        } else {
          const list = await fetchNotesList(filter);
          setNotesList(list);
        }
      } catch (err) {
        console.error(err);
        setNotesList([]);
      } finally {
        setListLoading(false);
      }
    },
    [searchTerm],
  );

  useEffect(() => {
    void loadNotesList(listFilter);
  }, [listFilter, loadNotesList]);

  const showSavedNotes = useCallback(() => {
    setListFilter(ALL_NOTES_FILTER);
    setSearchTerm("");
    void loadNotesList(ALL_NOTES_FILTER);
  }, [loadNotesList]);

  useEffect(() => {
    if (savedViewFromUrl) {
      setListFilter(ALL_NOTES_FILTER);
      setSearchTerm("");
    }
  }, [savedViewFromUrl]);

  const openNote = useCallback(async (id: string) => {
    try {
      const note = await fetchNote(id);
      setSelectedNote(note);
      setTitleDraft(note.title);
      setContentDraft(note.content_html || "<p></p>");
      await cacheNote(note, "synced");
    } catch {
      const cached = await getCachedNote(id);
      if (cached) {
        setSelectedNote(cached);
        setTitleDraft(cached.title);
        setContentDraft(cached.content_html || "<p></p>");
        setSaveStatus(cached.syncStatus === "pending" ? "offline" : "idle");
      }
    }
  }, []);

  useEffect(() => {
    if (noteIdFromUrl) void openNote(noteIdFromUrl);
  }, [noteIdFromUrl, openNote]);

  const selectedNoteRef = useRef<StudentNote | null>(null);
  const listFilterRef = useRef<NotesListFilter>(ALL_NOTES_FILTER);
  const loadNotesListRef = useRef(loadNotesList);
  const refreshNoteCountsRef = useRef(refreshNoteCounts);
  useEffect(() => {
    selectedNoteRef.current = selectedNote;
  }, [selectedNote]);
  useEffect(() => {
    listFilterRef.current = listFilter;
  }, [listFilter]);
  useEffect(() => {
    loadNotesListRef.current = loadNotesList;
    refreshNoteCountsRef.current = refreshNoteCounts;
  }, [listFilter, loadNotesList, refreshNoteCounts]);

  const persistNoteRef = useRef(
    debounce(async (id: string, title: string, html: string) => {
      const current = selectedNoteRef.current;
      if (!navigator.onLine) {
        if (current) {
          await queuePendingNote({ ...current, title, content_html: html }, title, html);
          setSaveStatus("offline");
          void refreshPending();
        }
        return;
      }
      setSaveStatus("saving");
      try {
        const updated = await updateNote(id, { title, content_html: html });
        setSelectedNote(updated);
        await cacheNote(updated, "synced");
        setSaveStatus("saved");
        void refreshPending();
        void loadNotesListRef.current(listFilterRef.current);
        void refreshNoteCountsRef.current();
      } catch {
        if (current) {
          await queuePendingNote({ ...current, title, content_html: html }, title, html);
          setSaveStatus("offline");
          void refreshPending();
        } else {
          setSaveStatus("error");
        }
      }
    }, 1200),
  );

  const persistNote = persistNoteRef.current;

  useEffect(() => {
    if (appendSnippet && selectedNote) {
      const decoded = decodeURIComponent(appendSnippet);
      const next = appendHtmlFragment(contentDraft, decoded);
      setContentDraft(next);
      persistNote(selectedNote.id, titleDraft, next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appendSnippet, selectedNote?.id]);

  const handleTitleChange = (value: string) => {
    setTitleDraft(value);
    if (selectedNote) persistNote(selectedNote.id, value, contentDraft);
  };

  const handleContentChange = (html: string) => {
    setContentDraft(html);
    if (selectedNote) persistNote(selectedNote.id, titleDraft, html);
  };

  const handleNewNote = async () => {
    if (listFilter.scope !== "chapter") return;
    const folder = listFilter;
    try {
      const note = await createNote({
        title: t("notes.untitled"),
        class_key: folder.class_key,
        subject_key: folder.subject_key,
        chapter_key: folder.chapter_key,
        chapter_label: folder.chapter_label,
        content_html: "<p></p>",
      });
      await cacheNote(note, "synced");
      await loadNotesList(listFilter);
      void refreshNoteCounts();
      await openNote(note.id);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteNote = async (noteId?: string) => {
    const id = noteId ?? selectedNote?.id;
    if (!id) return;
    const title =
      notesList.find((n) => n.id === id)?.title ?? selectedNote?.title ?? "";
    if (!confirm(t("notes.delete_confirm_named").replace("{title}", title))) return;
    try {
      await deleteNote(id);
      if (selectedNote?.id === id) {
        setSelectedNote(null);
        setTitleDraft("");
        setContentDraft("");
      }
      if (renamingNoteId === id) {
        setRenamingNoteId(null);
        setRenameDraft("");
      }
      void loadNotesList(listFilter);
      void refreshNoteCounts();
    } catch (err) {
      console.error(err);
    }
  };

  const startRename = (note: StudentNoteSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingNoteId(note.id);
    setRenameDraft(note.title);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const cancelRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setRenamingNoteId(null);
    setRenameDraft("");
  };

  const commitRename = async (noteId: string, e?: React.SyntheticEvent) => {
    e?.stopPropagation();
    const trimmed = renameDraft.trim();
    if (!trimmed) return;
    const existing = notesList.find((n) => n.id === noteId);
    if (existing && existing.title === trimmed) {
      cancelRename();
      return;
    }
    setRenameSaving(true);
    try {
      const updated = await updateNote(noteId, { title: trimmed });
      await cacheNote(updated, "synced");
      if (selectedNote?.id === noteId) {
        setSelectedNote(updated);
        setTitleDraft(trimmed);
      }
      setRenamingNoteId(null);
      setRenameDraft("");
      void loadNotesList(listFilter);
      void refreshNoteCounts();
    } catch (err) {
      console.error(err);
    } finally {
      setRenameSaving(false);
    }
  };

  useEffect(() => {
    if (renamingNoteId) renameInputRef.current?.focus();
  }, [renamingNoteId]);

  const handleExportPdf = async () => {
    if (!selectedNote) return;
    setPdfExporting(true);
    try {
      await exportNoteToPdf(
        titleDraft || selectedNote.title,
        contentDraft || selectedNote.content_html || "<p></p>",
      );
    } catch (err) {
      console.error("PDF export failed:", err);
      window.alert(t("notes.pdf_export_failed"));
    } finally {
      setPdfExporting(false);
    }
  };

  const handleExportDocx = async () => {
    if (!selectedNote) return;
    await exportNoteToDocx(titleDraft || selectedNote.title, contentDraft);
  };

  return (
    <div className="flex-1 flex gap-4 min-h-0 h-full animate-fade-in">
      <div
        className={`flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-all flex-shrink-0 ${
          leftCollapsed ? "w-0 min-w-0 opacity-0" : "w-72 min-w-[288px]"
        }`}
      >
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-emerald-600" />
              {t("notes.folders_title")}
            </h2>
            <button
              type="button"
              onClick={() => setLeftCollapsed(true)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
        {foldersLoading ? (
          <div className="p-8 text-center text-slate-400 text-sm">{t("Loading")}</div>
        ) : (
          <NotesFolderTree
            folders={folders}
            listFilter={listFilter}
            noteCounts={noteCounts}
            totalNoteCount={totalNoteCount}
            onSelectAll={() => setListFilter(ALL_NOTES_FILTER)}
            onSelectChapter={(folder) =>
              setListFilter({ scope: "chapter", ...folder })
            }
          />
        )}
      </div>
      {leftCollapsed && (
        <button
          type="button"
          onClick={() => setLeftCollapsed(false)}
          className="p-2 self-start mt-4 bg-white dark:bg-slate-800 border rounded-lg"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      <div
        className={`flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden transition-all flex-shrink-0 ${
          middleCollapsed ? "w-0 min-w-0 opacity-0" : "w-80 min-w-[320px]"
        }`}
      >
        <div className="p-4 border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2 mb-3 min-w-0">
            <p className="flex-1 min-w-0 text-sm font-semibold truncate">
              {listFilter.scope === "all"
                ? t("notes.all_notes_count").replace("{n}", String(totalNoteCount))
                : listFilter.chapter_label}
            </p>
            <button
              type="button"
              onClick={showSavedNotes}
              title={t("notes.saved_notes_btn")}
              className={`shrink-0 flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg border transition-all ${
                listFilter.scope === "all"
                  ? "bg-teal-600 text-white border-teal-600"
                  : "bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100 dark:bg-teal-900/30 dark:text-teal-200 dark:border-teal-700"
              }`}
            >
              <Bookmark className="w-3 h-3" />
              <span className="hidden sm:inline">{t("notes.saved_notes_btn")}</span>
              {totalNoteCount > 0 && (
                <span
                  className={`min-w-[1rem] px-1 py-0.5 text-[9px] font-bold rounded-full leading-none ${
                    listFilter.scope === "all"
                      ? "bg-white/25 text-white"
                      : "bg-teal-200 text-teal-900 dark:bg-teal-800 dark:text-teal-100"
                  }`}
                >
                  {totalNoteCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMiddleCollapsed(true)}
              className="shrink-0 p-1.5 rounded-lg border border-slate-200 dark:border-slate-600"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void loadNotesList(listFilter)}
              placeholder={t("notes.search_placeholder")}
              className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg dark:bg-slate-700"
            />
          </div>
          <button
            type="button"
            disabled={listFilter.scope !== "chapter"}
            title={
              listFilter.scope !== "chapter"
                ? t("notes.new_note_pick_chapter")
                : undefined
            }
            onClick={() => void handleNewNote()}
            className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            {t("notes.new_note")}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {listLoading ? (
            <div className="p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
            </div>
          ) : notesList.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">
              {listFilter.scope === "all"
                ? t("notes.empty_all")
                : t("notes.empty_list")}
            </p>
          ) : (
            notesList.map((n) => (
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (renamingNoteId === n.id) return;
                  void openNote(n.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && renamingNoteId !== n.id) void openNote(n.id);
                }}
                className={`w-full text-left p-3 mb-2 rounded-xl border group transition-colors cursor-pointer ${
                  selectedNote?.id === n.id
                    ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-900/30 dark:border-emerald-700"
                    : "border-transparent hover:bg-slate-50 dark:hover:bg-slate-700/50 hover:border-slate-200 dark:hover:border-slate-600"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    {renamingNoteId === n.id ? (
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          ref={renameInputRef}
                          type="text"
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void commitRename(n.id, e);
                            if (e.key === "Escape") cancelRename();
                          }}
                          disabled={renameSaving}
                          className="flex-1 min-w-0 px-2 py-1 text-sm font-medium border border-emerald-300 dark:border-emerald-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          disabled={renameSaving || !renameDraft.trim()}
                          onClick={(e) => void commitRename(n.id, e)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg disabled:opacity-40"
                          title={t("Save")}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelRename}
                          className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
                          title={t("Cancel")}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <p className="font-medium text-sm line-clamp-1 text-slate-900 dark:text-slate-100">
                          {n.title}
                        </p>
                        <p className="text-[10px] text-slate-400 mt-1">
                          {listFilter.scope === "all" && n.chapter_label ? (
                            <span className="block line-clamp-1 text-indigo-600/80 dark:text-indigo-300/80">
                              {n.chapter_label}
                            </span>
                          ) : null}
                          {new Date(n.updated_at * 1000).toLocaleString()}
                        </p>
                      </>
                    )}
                  </div>
                  {renamingNoteId !== n.id && (
                    <div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={(e) => startRename(n, e)}
                        className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg"
                        title={t("notes.rename")}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDeleteNote(n.id);
                        }}
                        className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                        title={t("Delete")}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      {middleCollapsed && (
        <button type="button" onClick={() => setMiddleCollapsed(false)} className="p-2 self-start mt-4 border rounded-lg bg-white dark:bg-slate-800">
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {selectedNote ? (
          <>
            <div className="p-4 border-b flex flex-wrap items-center gap-2 shrink-0">
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="flex-1 min-w-[120px] font-bold bg-transparent outline-none border-b border-transparent focus:border-emerald-400"
              />
              <span className="text-[10px] text-slate-400 uppercase flex items-center gap-1">
                {!isOnline ? (
                  <WifiOff className="w-3 h-3 text-amber-500" />
                ) : (
                  <Wifi className="w-3 h-3 text-emerald-500" />
                )}
                {saveStatus === "saving" && t("notes.saving")}
                {saveStatus === "saved" && t("notes.saved")}
                {saveStatus === "offline" &&
                  t("notes.offline_pending").replace("{n}", String(pendingCount))}
                {saveStatus === "error" && t("notes.save_error")}
              </span>
              <button
                type="button"
                disabled={pdfExporting}
                onClick={() => void handleExportPdf()}
                className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                {pdfExporting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                PDF
              </button>
              <button type="button" onClick={() => void handleExportDocx()} className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg hover:bg-slate-100">
                <Download className="w-3.5 h-3.5" /> DOCX
              </button>
              <button
                type="button"
                onClick={() => void handleDeleteNote()}
                className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg"
                title={t("Delete")}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div ref={editorWrapRef} className="flex-1 flex flex-col min-h-0">
              <NotesEditor contentHtml={contentDraft} onChange={handleContentChange} />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 p-8 text-center">
            <BookOpen className="w-14 h-14 mb-4 opacity-30" />
            <p className="text-sm">{t("notes.select_or_create")}</p>
          </div>
        )}
      </div>

      {pendingSnippet && (
        <SaveToNotesModal
          isOpen={snippetModalOpen}
          onClose={() => {
            setSnippetModalOpen(false);
            setPendingSnippet(null);
          }}
          title={pendingSnippet.text.slice(0, 80)}
          body={pendingSnippet.html}
          asMarkdown={false}
          defaultFolder={
            listFilter.scope === "chapter" ? listFilter : undefined
          }
          source="selection"
        />
      )}
    </div>
  );
}
