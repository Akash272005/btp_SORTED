import { apiUrl } from "@/lib/api";
import type { SolverInputMode } from "@/components/solver/types";
import type { AuthUser } from "@/types/lms";
import {
  buildNotebookChatPayload,
  pickBestChatMessages,
  type SavedChatMessage,
} from "@/lib/notebookRecordContent";

/** Base keys — scoped per user/role via getSolverStorageScope (see below). */
export const SOLVER_SESSION_INPUT_MODE_KEY = "solver:session-input-mode";
export const SOLVER_MESSAGES_BY_MODE_KEY = "solver:messages-by-mode";
export const SOLVER_SESSION_IDS_BY_MODE_KEY = "solver:session-ids-by-mode";

/** Isolates chat history: guest vs student vs teacher (each user id gets its own bucket). */
export type SolverStorageScope =
  | "guest"
  | `student:${number}`
  | `teacher:${number}`
  | `admin:${number}`;

export function getSolverStorageScope(
  user: Pick<AuthUser, "id" | "role"> | null | undefined,
): SolverStorageScope {
  if (!user?.id) return "guest";
  return `${user.role}:${user.id}`;
}

function scopedStorageKey(base: string, scope: SolverStorageScope): string {
  return `${base}:${scope}`;
}

const SOLVER_INPUT_MODES: SolverInputMode[] = ["type", "draw", "upload"];

export type SolverMessagesByMode = Record<SolverInputMode, SolverNotebookMessage[]>;
export type SolverSessionIdsByMode = Record<SolverInputMode, string | null>;

export function emptySolverMessagesByMode(): SolverMessagesByMode {
  return { type: [], draw: [], upload: [] };
}

export function emptySolverSessionIdsByMode(): SolverSessionIdsByMode {
  return { type: null, draw: null, upload: null };
}

function parseMessagesByMode(raw: unknown): SolverMessagesByMode {
  const empty = emptySolverMessagesByMode();
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;
  for (const mode of SOLVER_INPUT_MODES) {
    const list = obj[mode];
    if (Array.isArray(list)) {
      empty[mode] = normalizeSolverMessages(
        list as Array<{ role?: string; content?: string; output_dir?: string; outputDir?: string }>,
      );
    }
  }
  return empty;
}

function parseSessionIdsByMode(raw: unknown): SolverSessionIdsByMode {
  const empty = emptySolverSessionIdsByMode();
  if (!raw || typeof raw !== "object") return empty;
  const obj = raw as Record<string, unknown>;
  for (const mode of SOLVER_INPUT_MODES) {
    const id = obj[mode];
    empty[mode] = typeof id === "string" && id.trim() ? id.trim() : null;
  }
  return empty;
}

export function readSolverMessagesByMode(
  scope: SolverStorageScope,
): SolverMessagesByMode {
  if (typeof window === "undefined") return emptySolverMessagesByMode();
  try {
    const raw = localStorage.getItem(
      scopedStorageKey(SOLVER_MESSAGES_BY_MODE_KEY, scope),
    );
    if (!raw) return emptySolverMessagesByMode();
    return parseMessagesByMode(JSON.parse(raw));
  } catch {
    return emptySolverMessagesByMode();
  }
}

export function persistSolverMessagesByMode(
  scope: SolverStorageScope,
  data: SolverMessagesByMode,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    scopedStorageKey(SOLVER_MESSAGES_BY_MODE_KEY, scope),
    JSON.stringify(data),
  );
}

export function readSolverSessionIdsByMode(
  scope: SolverStorageScope,
): SolverSessionIdsByMode {
  if (typeof window === "undefined") return emptySolverSessionIdsByMode();
  try {
    const raw = localStorage.getItem(
      scopedStorageKey(SOLVER_SESSION_IDS_BY_MODE_KEY, scope),
    );
    if (!raw) return emptySolverSessionIdsByMode();
    return parseSessionIdsByMode(JSON.parse(raw));
  } catch {
    return emptySolverSessionIdsByMode();
  }
}

export function persistSolverSessionIdsByMode(
  scope: SolverStorageScope,
  data: SolverSessionIdsByMode,
): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(
    scopedStorageKey(SOLVER_SESSION_IDS_BY_MODE_KEY, scope),
    JSON.stringify(data),
  );
}

export function clearSolverTabSessions(scope: SolverStorageScope): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(scopedStorageKey(SOLVER_MESSAGES_BY_MODE_KEY, scope));
  localStorage.removeItem(scopedStorageKey(SOLVER_SESSION_IDS_BY_MODE_KEY, scope));
  localStorage.removeItem(scopedStorageKey(SOLVER_SESSION_INPUT_MODE_KEY, scope));
}

export function readSolverSessionInputMode(
  scope: SolverStorageScope,
): SolverInputMode | null {
  if (typeof window === "undefined") return null;
  const stored = localStorage.getItem(
    scopedStorageKey(SOLVER_SESSION_INPUT_MODE_KEY, scope),
  );
  if (stored === "type" || stored === "draw" || stored === "upload") {
    return stored;
  }
  return null;
}

export function persistSolverSessionInputMode(
  scope: SolverStorageScope,
  mode: SolverInputMode,
): void {
  localStorage.setItem(scopedStorageKey(SOLVER_SESSION_INPUT_MODE_KEY, scope), mode);
}

export function clearSolverSessionInputMode(scope: SolverStorageScope): void {
  localStorage.removeItem(scopedStorageKey(SOLVER_SESSION_INPUT_MODE_KEY, scope));
}

export function getSolverInputModeFromMetadata(
  metadata: Record<string, unknown> | undefined,
): SolverInputMode | null {
  if (!metadata) return null;
  const raw = metadata.input_mode ?? metadata.session_input_mode;
  if (raw === "type" || raw === "draw" || raw === "upload") {
    return raw;
  }
  return null;
}

export interface SolverNotebookMessage {
  role: "user" | "assistant";
  content: string;
  outputDir?: string;
}

export interface SolverNotebookRecordInput {
  title: string;
  userQuery: string;
  output: string;
  metadata: Record<string, unknown>;
}

function normalizeSolverMessages(
  raw: Array<{ role?: string; content?: string; output_dir?: string; outputDir?: string }>,
): SolverNotebookMessage[] {
  const mapped: (SolverNotebookMessage | null)[] = raw.map((msg) => {
    const role = msg.role === "assistant" ? "assistant" : "user";
    const content = String(msg.content ?? "").trim();
    if (!content) return null;
    return {
      role,
      content,
      outputDir:
        typeof msg.outputDir === "string"
          ? msg.outputDir
          : typeof msg.output_dir === "string"
            ? msg.output_dir
            : undefined,
    } satisfies SolverNotebookMessage;
  });
  return mapped.filter((m): m is SolverNotebookMessage => m !== null);
}

/** Prefer whichever source has more messages (UI may be ahead of server session). */
export async function fetchSolverMessagesForNotebook(
  sessionId: string | null | undefined,
  fallback: SolverNotebookMessage[],
): Promise<SolverNotebookMessage[]> {
  const local = normalizeSolverMessages(fallback);
  if (!sessionId?.trim()) return local;

  try {
    const res = await fetch(apiUrl(`/api/v1/solve/sessions/${sessionId.trim()}`));
    if (!res.ok) return local;
    const session = await res.json();
    const fromServer = normalizeSolverMessages(session.messages ?? []);
    const picked = pickBestChatMessages(
      local as SavedChatMessage[],
      fromServer as SavedChatMessage[],
    );
    return picked.map((m) => ({ role: m.role, content: m.content }));
  } catch {
    return local;
  }
}

/** Build one notebook record for the full Smart Solver conversation. */
export function buildSolverNotebookPayload(
  messages: SolverNotebookMessage[],
  ctx: {
    sessionId: string | null;
    selectedKb: string;
    inputMode?: SolverInputMode | null;
  },
  titleFallback = "Smart Solver Session",
): SolverNotebookRecordInput | null {
  const saved: SavedChatMessage[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));
  const chat = buildNotebookChatPayload(saved, titleFallback);
  if (!chat.title || chat.messages.length === 0) return null;

  const title = chat.title.replace(/^Chat:\s*/i, "Solver: ");

  return {
    title,
    userQuery: chat.userQuery,
    output: chat.output,
    metadata: {
      ...(ctx.sessionId ? { session_id: ctx.sessionId } : {}),
      solver_messages: messages,
      chat_messages: chat.messages,
      kb_name: ctx.selectedKb,
      ...(ctx.inputMode ? { input_mode: ctx.inputMode } : {}),
    },
  };
}

/** Session id stored when saving a solver turn to the notebook. */
export function getSolverSessionId(
  metadata: Record<string, unknown> | undefined,
): string | null {
  if (!metadata) return null;
  const id = metadata.session_id ?? metadata.solver_session_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export function messagesFromSolverMetadata(
  metadata: Record<string, unknown> | undefined,
): SolverNotebookMessage[] {
  const raw = metadata?.solver_messages;
  if (Array.isArray(raw) && raw.length > 0) {
    return normalizeSolverMessages(
      raw as Array<{
        role?: string;
        content?: string;
        output_dir?: string;
        outputDir?: string;
      }>,
    );
  }

  const chatRaw = metadata?.chat_messages;
  if (Array.isArray(chatRaw) && chatRaw.length > 0) {
    return normalizeSolverMessages(
      chatRaw as Array<{ role?: string; content?: string }>,
    );
  }

  return [];
}

/** Build solver messages from a single-turn notebook save. */
export function messagesFromSolverRecord(record: {
  user_query: string;
  output: string;
}): SolverNotebookMessage[] {
  const user = record.user_query?.trim() ?? "";
  const assistant = record.output?.trim() ?? "";
  if (!user && !assistant) return [];
  const messages: SolverNotebookMessage[] = [];
  if (user) messages.push({ role: "user", content: user });
  if (assistant) messages.push({ role: "assistant", content: assistant });
  return messages;
}

export function parseNotebookRecordToSolverLoad(record: {
  user_query: string;
  output: string;
  metadata?: Record<string, unknown>;
  kb_name?: string;
}): {
  messages: SolverNotebookMessage[];
  selectedKb: string;
  sessionId: string | null;
  inputMode: SolverInputMode;
} | null {
  const fromMeta = messagesFromSolverMetadata(record.metadata);
  const messages =
    fromMeta.length > 0
      ? fromMeta
      : messagesFromSolverRecord(record);
  if (messages.length === 0) return null;

  const meta = record.metadata ?? {};
  const selectedKb =
    (typeof meta.kb_name === "string" ? meta.kb_name : "") ||
    record.kb_name ||
    "";
  const inputMode = getSolverInputModeFromMetadata(meta) ?? "type";

  return {
    messages,
    selectedKb,
    sessionId: getSolverSessionId(record.metadata),
    inputMode,
  };
}
