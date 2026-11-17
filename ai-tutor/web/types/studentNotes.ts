export interface NotesChapter {
  chapter_key: string;
  chapter_label: string;
  url?: string;
}

export interface NotesSubject {
  subject_key: string;
  subject_label: string;
  chapters: NotesChapter[];
}

export interface NotesClassFolder {
  class_key: string;
  class_label: string;
  subjects: NotesSubject[];
}

export interface StudentNoteSummary {
  id: string;
  title: string;
  class_key: string;
  subject_key: string;
  chapter_key: string;
  chapter_label: string;
  source?: string;
  created_at: number;
  updated_at: number;
}

export interface StudentNote extends StudentNoteSummary {
  content_html: string;
  content_json?: Record<string, unknown> | null;
  source_metadata?: Record<string, unknown>;
}

export interface FolderSelection {
  class_key: string;
  subject_key: string;
  chapter_key: string;
  chapter_label: string;
}

/** List filter: all notes across chapters, or one chapter folder. */
export type NotesListFilter =
  | { scope: "all" }
  | ({ scope: "chapter" } & FolderSelection);

export const ALL_NOTES_FILTER: NotesListFilter = { scope: "all" };

export function chapterFilterKey(
  class_key: string,
  subject_key: string,
  chapter_key: string,
): string {
  return `${class_key}:${subject_key}:${chapter_key}`;
}
