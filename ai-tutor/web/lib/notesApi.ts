import { apiUrl } from "@/lib/api";
import type {
  FolderSelection,
  NotesClassFolder,
  StudentNote,
  StudentNoteSummary,
} from "@/types/studentNotes";

export async function fetchNotesFolders(): Promise<NotesClassFolder[]> {
  const res = await fetch(apiUrl("/api/v1/student-notes/folders"));
  if (!res.ok) throw new Error("Failed to load folders");
  const data = await res.json();
  return data.folders || [];
}

export async function fetchNotesList(
  folder?: Partial<FolderSelection>,
): Promise<StudentNoteSummary[]> {
  const params = new URLSearchParams();
  if (folder?.class_key) params.set("class_key", folder.class_key);
  if (folder?.subject_key) params.set("subject_key", folder.subject_key);
  if (folder?.chapter_key) params.set("chapter_key", folder.chapter_key);
  const qs = params.toString();
  const res = await fetch(
    apiUrl(`/api/v1/student-notes/list${qs ? `?${qs}` : ""}`),
  );
  if (!res.ok) throw new Error("Failed to load notes");
  const data = await res.json();
  return data.notes || [];
}

export async function searchNotes(
  query: string,
): Promise<
  Array<
    StudentNoteSummary & {
      snippet?: string;
    }
  >
> {
  const res = await fetch(
    apiUrl(`/api/v1/student-notes/search?q=${encodeURIComponent(query)}`),
  );
  if (!res.ok) throw new Error("Failed to search notes");
  const data = await res.json();
  return data.results || [];
}

export async function fetchNote(id: string): Promise<StudentNote> {
  const res = await fetch(apiUrl(`/api/v1/student-notes/${id}`));
  if (!res.ok) throw new Error("Note not found");
  return res.json();
}

export async function createNote(payload: {
  title?: string;
  class_key?: string;
  subject_key?: string;
  chapter_key?: string;
  chapter_label?: string;
  content_html?: string;
  source?: string;
  source_metadata?: Record<string, unknown>;
}): Promise<StudentNote> {
  const res = await fetch(apiUrl("/api/v1/student-notes/create"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.detail || "Create failed");
  return data.note;
}

export async function updateNote(
  id: string,
  payload: {
    title?: string;
    content_html?: string;
    class_key?: string;
    subject_key?: string;
    chapter_key?: string;
    chapter_label?: string;
  },
): Promise<StudentNote> {
  const res = await fetch(apiUrl(`/api/v1/student-notes/${id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.detail || "Update failed");
  return data.note;
}

export async function deleteNote(id: string): Promise<void> {
  const res = await fetch(apiUrl(`/api/v1/student-notes/${id}`), {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Delete failed");
}

export async function createNoteFromSession(payload: {
  summary: string;
  session_title?: string;
  class_key?: string;
  subject_key?: string;
  chapter_key?: string;
  chapter_label?: string;
}): Promise<StudentNote> {
  const res = await fetch(apiUrl("/api/v1/student-notes/from-session"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data.detail || "Failed");
  return data.note;
}
