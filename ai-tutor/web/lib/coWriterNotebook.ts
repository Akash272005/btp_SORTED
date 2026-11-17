/** Co-Writer notebook load/save helpers. */

import type { CoWriterContext } from "@/lib/ncertJourney";

const LOAD_STORAGE_KEY = "vidyasetu-co-writer-load";

export interface CoWriterCitation {
  snippet: string;
  kb_name?: string | null;
  score?: number | null;
  source_file?: string | null;
  url?: string | null;
  source_type?: string | null;
}

export interface CoWriterLoadPayload {
  content: string;
  title?: string;
  metadata?: Record<string, unknown>;
  kb_name?: string;
  context?: Partial<CoWriterContext>;
}

export function stashCoWriterLoad(payload: CoWriterLoadPayload): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LOAD_STORAGE_KEY, JSON.stringify(payload));
}

export function consumeCoWriterLoad(): CoWriterLoadPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LOAD_STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(LOAD_STORAGE_KEY);
    return JSON.parse(raw) as CoWriterLoadPayload;
  } catch {
    return null;
  }
}

export function parseNotebookRecordToCoWriterLoad(record: {
  user_query?: string;
  output: string;
  metadata?: Record<string, unknown>;
  kb_name?: string;
  title?: string;
}): CoWriterLoadPayload {
  const meta = record.metadata || {};
  return {
    content: record.output || "",
    title: record.title,
    kb_name:
      (typeof meta.kb_name === "string" ? meta.kb_name : undefined) ||
      record.kb_name,
    metadata: meta,
    context: {
      v: 2,
      classKey:
        typeof meta.class_key === "string" ? meta.class_key : "class-8",
      subjectKey:
        typeof meta.subject_key === "string" ? meta.subject_key : "science",
      medium: "English",
      chapterLabel:
        typeof meta.chapter_label === "string"
          ? meta.chapter_label
          : undefined,
      ragEnabled: true,
      webSearchEnabled: false,
      thinkingEnabled: false,
    },
  };
}

export function resolveCoWriterSource(
  ctx: CoWriterContext | null,
  manual?: "rag" | "web" | null,
): "rag" | "web" | "both" | null {
  if (manual === "rag" || manual === "web") {
    if (ctx?.ragEnabled && ctx?.webSearchEnabled && manual === "rag") return "both";
    return manual;
  }
  if (!ctx) return null;
  if (ctx.ragEnabled && ctx.webSearchEnabled) return "both";
  if (ctx.ragEnabled) return "rag";
  if (ctx.webSearchEnabled) return "web";
  return null;
}

export function buildCoWriterNotebookMetadata(ctx: {
  classKey: string;
  subjectKey: string;
  chapterLabel?: string;
  kbName: string;
  template?: string;
}): Record<string, unknown> {
  return {
    class_key: ctx.classKey,
    subject_key: ctx.subjectKey,
    chapter_label: ctx.chapterLabel,
    kb_name: ctx.kbName,
    template: ctx.template,
    perspective: "teacher",
  };
}
