import { apiUrl } from "@/lib/api";

export interface SavedChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** Unique delimiter — must not appear inside normal chat text (unlike `---`). */
export const NOTEBOOK_CHAT_BOUNDARY = "<<<BIXY_CHAT_MSG>>>";

export interface NotebookChatPayload {
  title: string;
  userQuery: string;
  output: string;
  /** Full structured transcript stored in notebook metadata for reliable display. */
  messages: SavedChatMessage[];
}

function normalizeChatMessages(
  raw: Array<{ role?: string; content?: string }>,
): SavedChatMessage[] {
  return raw
    .map((msg) => ({
      role: msg.role === "assistant" ? ("assistant" as const) : ("user" as const),
      content: String(msg.content ?? ""),
    }))
    .filter((m) => m.content.trim());
}

/** Prefer whichever source has more messages (screen often ahead of stale server session). */
export function pickBestChatMessages(
  local: SavedChatMessage[],
  server: SavedChatMessage[],
): SavedChatMessage[] {
  const a = normalizeChatMessages(local);
  const b = normalizeChatMessages(server);
  if (b.length >= a.length) return b;
  return a;
}

/** Read chat transcript from metadata JSON or fall back to parsing output text. */
export function getChatMessagesFromRecord(record: {
  output: string;
  type?: string;
  metadata?: Record<string, unknown>;
}): SavedChatMessage[] | null {
  const raw = record.metadata?.chat_messages;
  if (Array.isArray(raw) && raw.length > 0) {
    const fromMeta = normalizeChatMessages(
      raw as Array<{ role?: string; content?: string }>,
    );
    if (fromMeta.length > 0) return fromMeta;
  }
  return parseSavedChatTranscript(record.output);
}

/** True when saved output is a full HTML document (e.g. Guided Learning lesson). */
export function isHtmlDocument(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  if (/^<!DOCTYPE\s+html/i.test(trimmed)) return true;
  if (/^<html[\s>]/i.test(trimmed)) return true;
  return (
    trimmed.startsWith("<") &&
    /<\/(html|body|head|style|div|section|article)>/i.test(trimmed)
  );
}

function roleFromHeaderLine(line: string): "user" | "assistant" | null {
  const h = line.trim();
  if (!h.startsWith("###")) return null;

  if (/👤/u.test(h) || /\buser\b/i.test(h) || /उपयोगकर्ता/u.test(h)) {
    return "user";
  }
  if (/🤖/u.test(h) || /\bassistant\b/i.test(h) || /सहायक/u.test(h)) {
    return "assistant";
  }

  const bare = h.replace(/^###\s*/i, "").replace(/\*+/g, "").trim().toLowerCase();
  if (bare === "user" || bare.startsWith("user ")) return "user";
  if (bare === "assistant" || bare.startsWith("assistant ")) return "assistant";

  return null;
}

function splitTranscriptBlocks(text: string): string[] {
  if (text.includes(NOTEBOOK_CHAT_BOUNDARY)) {
    return text
      .split(NOTEBOOK_CHAT_BOUNDARY)
      .map((b) => b.trim())
      .filter(Boolean);
  }
  return text
    .split(/\n+---\n+/)
    .map((b) => b.trim())
    .filter(Boolean);
}

/**
 * Parse notebook chat export (### user / ### assistant blocks from home chat save).
 * Supports legacy `---` separators and the safe <<<BIXY_CHAT_MSG>>> boundary.
 */
export function parseSavedChatTranscript(
  output: string,
): SavedChatMessage[] | null {
  const text = output.trim();
  if (!text) return null;

  const blocks = splitTranscriptBlocks(text);
  if (blocks.length === 0) return null;

  const messages: SavedChatMessage[] = [];

  for (const block of blocks) {
    const firstNewline = block.indexOf("\n");
    const headerLine = firstNewline === -1 ? block : block.slice(0, firstNewline);
    const role = roleFromHeaderLine(headerLine);
    if (!role) continue;

    const content =
      firstNewline === -1
        ? ""
        : block
            .slice(firstNewline + 1)
            .replace(/^\s+/, "")
            .trim();
    if (content) messages.push({ role, content });
  }

  return messages.length > 0 ? messages : null;
}

export function buildNotebookChatPayload(
  messages: SavedChatMessage[],
  titleFallback = "Chat Session",
): NotebookChatPayload {
  const nonEmpty = messages.filter((m) => (m.content ?? "").trim());
  if (nonEmpty.length === 0) {
    return { title: "", userQuery: "", output: "", messages: [] };
  }

  const firstUser = nonEmpty.find((m) => m.role === "user");
  const titleText = firstUser?.content.trim() ?? "";
  const title = titleText
    ? `Chat: ${titleText.slice(0, 50)}${titleText.length > 50 ? "..." : ""}`
    : `Chat: ${titleFallback}`;

  const output = nonEmpty
    .map((m) => `### ${m.role}\n\n${m.content.trim()}`)
    .join(`\n\n${NOTEBOOK_CHAT_BOUNDARY}\n\n`);

  const userQuery = nonEmpty
    .filter((m) => m.role === "user")
    .map((m) => m.content.trim())
    .join("\n\n");

  return { title, userQuery, output, messages: nonEmpty };
}

/** Load full chat history from the server when a session id exists. */
export async function fetchChatMessagesForNotebook(
  sessionId: string | null | undefined,
  fallback: SavedChatMessage[],
): Promise<SavedChatMessage[]> {
  const local = normalizeChatMessages(fallback);
  if (!sessionId?.trim()) return local;

  try {
    const res = await fetch(apiUrl(`/api/v1/chat/sessions/${sessionId.trim()}`));
    if (!res.ok) return local;
    const session = await res.json();
    const fromServer = normalizeChatMessages(session.messages ?? []);
    return pickBestChatMessages(local, fromServer);
  } catch {
    return local;
  }
}

/** Keep metadata.chat_messages in sync when the user edits the chat transcript output. */
export function metadataAfterChatOutputEdit(
  recordMetadata: Record<string, unknown> | undefined,
  output: string,
): Record<string, unknown> {
  const base = { ...(recordMetadata || {}) };
  const parsed = parseSavedChatTranscript(output.trim());
  if (parsed && parsed.length > 0) {
    return { ...base, chat_messages: parsed };
  }
  return { ...base, chat_messages: [] };
}

export function getNotebookSessionId(
  metadata: Record<string, unknown> | undefined,
): string | null {
  if (!metadata) return null;
  const id = metadata.session_id ?? metadata.chat_session_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}
