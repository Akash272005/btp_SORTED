import Dexie, { type Table } from "dexie";
import type { StudentNote } from "@/types/studentNotes";
import { updateNote } from "@/lib/notesApi";

export interface CachedNote extends StudentNote {
  syncStatus: "synced" | "pending" | "error";
}

class NotesDatabase extends Dexie {
  notes!: Table<CachedNote, string>;

  constructor() {
    super("bixy_student_notes");
    this.version(1).stores({
      notes: "id, updated_at, class_key, subject_key, chapter_key, syncStatus",
    });
  }
}

export const notesDb = typeof window !== "undefined" ? new NotesDatabase() : null;

export async function cacheNote(
  note: StudentNote,
  syncStatus: CachedNote["syncStatus"] = "synced",
) {
  if (!notesDb) return;
  await notesDb.notes.put({ ...note, syncStatus });
}

export async function getCachedNote(id: string): Promise<CachedNote | undefined> {
  if (!notesDb) return undefined;
  return notesDb.notes.get(id);
}

export async function listCachedNotesForFolder(
  class_key: string,
  subject_key: string,
  chapter_key: string,
): Promise<CachedNote[]> {
  if (!notesDb) return [];
  const all = await notesDb.notes
    .where("class_key")
    .equals(class_key)
    .toArray();
  return all
    .filter(
      (n) => n.subject_key === subject_key && n.chapter_key === chapter_key,
    )
    .sort((a, b) => b.updated_at - a.updated_at);
}

export async function countPendingNotes(): Promise<number> {
  if (!notesDb) return 0;
  return notesDb.notes.where("syncStatus").equals("pending").count();
}

/** Queue local copy when server save fails or user is offline. */
export async function queuePendingNote(
  note: StudentNote,
  title: string,
  content_html: string,
) {
  if (!notesDb) return;
  const updated = {
    ...note,
    title,
    content_html,
    updated_at: Date.now() / 1000,
  };
  await notesDb.notes.put({ ...updated, syncStatus: "pending" });
}

/** Push pending notes to server when back online. */
export async function flushPendingNotes(): Promise<number> {
  if (!notesDb || typeof navigator === "undefined" || !navigator.onLine) {
    return 0;
  }
  const pending = await notesDb.notes
    .where("syncStatus")
    .equals("pending")
    .toArray();
  let synced = 0;
  for (const local of pending) {
    try {
      const server = await updateNote(local.id, {
        title: local.title,
        content_html: local.content_html,
      });
      await cacheNote(server, "synced");
      synced += 1;
    } catch {
      await notesDb.notes.update(local.id, { syncStatus: "error" });
    }
  }
  return synced;
}

export function parseNcertFromPdfUrl(
  pdfUrl: string,
): { class_key: string; subject_key: string; chapter_key: string } {
  try {
    const path = new URL(pdfUrl, window.location.origin).pathname;
    const parts = path.split("/").filter(Boolean);
    const ncertIdx = parts.indexOf("ncert");
    if (ncertIdx >= 0 && parts.length > ncertIdx + 3) {
      const filename = parts[ncertIdx + 3] || "";
      return {
        class_key: parts[ncertIdx + 1] || "",
        subject_key: parts[ncertIdx + 2] || "",
        chapter_key: filename.replace(/\.pdf$/i, ""),
      };
    }
  } catch {
    /* ignore */
  }
  return { class_key: "", subject_key: "", chapter_key: "" };
}
