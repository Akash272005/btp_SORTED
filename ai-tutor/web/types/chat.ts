// Chat-specific types for home page chat

/** Ordered pipeline steps emitted by the backend during Thinking mode (real phases). */
export type ThinkingPhaseId =
  | "understand"
  | "retrieve"
  | "structure"
  | "write";

export interface ThinkingTraceStep {
  phase: ThinkingPhaseId;
  status: "pending" | "active" | "done";
  /** Timestamp (ms) when this phase became active */
  startedAt?: number;
  /** How long the phase took in ms (set when status becomes done) */
  elapsedMs?: number;
}

/**
 * Source references for chat messages
 */
export interface ChatSource {
  rag?: Array<{ kb_name: string; content: string }>;
  web?: Array<{ url: string; title?: string; snippet?: string; type?: string }>;
  videos?: Array<{ url: string; title?: string; snippet?: string; type?: string }>;
}

/**
 * Chat message with sources and streaming state
 */
export interface ChatMessageAttachment {
  url: string;
  name: string;
  kind: "pdf" | "image" | "document";
}

export interface HomeChatMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: ChatMessageAttachment[];
  sources?: ChatSource;
  isStreaming?: boolean;
  /** True when this assistant message was generated in Thinking Mode — persists after streaming ends. */
  isThinking?: boolean;
  suggestWebsearch?: boolean;
  imageUrl?: string;
  imageTitle?: string;
  imageDescription?: string;
  imageSourceUrl?: string;
  /** LLM concept map (Mermaid), locale-aligned with Related Visuals */
  relatedDiagramMermaid?: string;
  relatedDiagramTitle?: string;
  /** Web images fetched from AI response keywords (Wikimedia) */
  webImages?: Array<{
    url: string;
    title: string;
    description: string;
    source_url: string;
    keyword: string;
  }>;
  /** Content with images placed inline by the Composer Agent */
  composedContent?: string;
  /** Local RAG images used in composed content */
  ragImages?: Array<{
    url: string;
    caption: string;
    source: "local" | "web";
    chapter?: string;
    page?: number;
  }>;
}

/**
 * Chat state
 */
export interface ChatState {
  sessionId: string | null;
  messages: HomeChatMessage[];
  isLoading: boolean;
  selectedKb: string;
  selectedPdfUrl?: string;
  /** Display chapter title from the NCERT / source dropdown; drives inferred YouTube topic. */
  selectedPdfTopicLabel?: string;
  enableRag: boolean;
  enableWebSearch: boolean;
  /** Reasoning style for the assistant (home chat). */
  enableThinking: boolean;
  /** General mode: free-form AI answers from model knowledge, no retrieval. Mutually exclusive with enableThinking. */
  enableGeneral: boolean;
  currentStage: string | null;
  /** Live pipeline trace when Thinking mode is on (not persisted). */
  thinkingTrace: ThinkingTraceStep[];
  /** Extra PDFs/images queued for the next send (student workspace attachments). */
  pendingAttachments: ChatMessageAttachment[];
}

/**
 * Initial chat state
 */
export const INITIAL_CHAT_STATE: ChatState = {
  sessionId: null,
  messages: [],
  isLoading: false,
  selectedKb: "",
  selectedPdfUrl: "",
  selectedPdfTopicLabel: "",
  enableRag: true,
  enableWebSearch: false,
  enableThinking: false,
  enableGeneral: false,
  currentStage: null,
  thinkingTrace: [],
  pendingAttachments: [],
};
