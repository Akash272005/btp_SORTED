"use client";

import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import type { ChatState, ThinkingTraceStep } from "@/types/chat";
import {
  Send,
  Loader2,
  Square,
  Bot,
  User,
  Database,
  Globe,
  Calculator,
  FileText,
  Microscope,
  Lightbulb,
  Plus,
  X,
  ExternalLink,
  BookOpen,
  Sparkles,
  Edit3,
  GraduationCap,
  PenTool,
  Save,
  Mic,
  MicOff,
  Check,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useGlobal } from "@/context/GlobalContext";
import { apiUrl } from "@/lib/api";
import { deriveHomeYoutubeTopic } from "@/lib/homeYoutubeTopic";
import { processLatexContent } from "@/lib/latex";
import AddToNotebookModal from "@/components/AddToNotebookModal";
import { useTranslation } from "react-i18next";
import NCERTRagDropdown from "@/components/NCERTRagDropdown";
import StudentChatJourney from "@/components/lms/StudentChatJourney";
import StudentChapterWorkspace from "@/components/lms/StudentChapterWorkspace";
import { loadPdfUrlRemap } from "@/lib/examCalendarBulkChapters";
import {
  clearStudentChatContext,
  isNcertKb,
  isKbEquivalent,
  kbNameForClass,
  kbNameForClassSubject,
  loadStudentChatContext,
  normalizeStudentChatContext,
  saveStudentChatContext,
  buildChapterContext,
  type StudentChatContext,
} from "@/lib/ncertJourney";
import { ChatSourceVideos } from "@/components/ChatSourceVideos";
import AvatarNarrator from "@/components/AvatarNarrator";
import ConceptSummary from "@/components/ConceptSummary";
import { HomeYoutubeSuggestions } from "@/components/HomeYoutubeSuggestions";
import { HomeRelatedDiagram } from "@/components/HomeRelatedDiagram";

interface KnowledgeBase {
  name: string;
  is_default?: boolean;
  statistics?: {
    status?: string;
    rag_initialized?: boolean;
    [key: string]: unknown;
  };
}

/** KBs still indexing / failed should not appear on Home (avoids broken RAG picks). */
function kbReadyForHomeSource(kb: KnowledgeBase): boolean {
  const st = kb.statistics?.status;
  if (st === "initializing" || st === "processing" || st === "error") return false;
  return true;
}

/** ChatGPT-style “Thinking” label: gradient sweep on transparent text (Think mode, before first tokens). */
function ThinkingShimmerLabel({ text }: { text: string }) {
  return (
    <span
      className="text-[15px] font-medium tracking-tight select-none inline-block bg-gradient-to-r from-slate-500 from-[18%] via-slate-100 via-1/2 to-slate-600 to-[82%] bg-[length:220%_100%] bg-clip-text text-transparent animate-thinking-shimmer"
    >
      {text}
    </span>
  );
}

/** Format elapsed ms as a readable duration string. */
function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Real pipeline steps for Thinking mode (status from WebSocket `thinking_phase`). */
function ThinkingTraceList({
  steps,
  t,
}: {
  steps: ThinkingTraceStep[];
  t: (key: string) => string;
}) {
  return (
    <ul className="mb-0 space-y-2.5 text-left">
      {steps.map((row) => (
        <li
          key={row.phase}
          className="flex items-start gap-2.5 text-[13px] leading-snug"
        >
          {row.status === "done" ? (
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
              strokeWidth={2.5}
              aria-hidden
            />
          ) : row.status === "active" ? (
            <Loader2
              className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-100"
              aria-hidden
            />
          ) : (
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full border border-slate-400/90"
              aria-hidden
            />
          )}
          <span className="flex items-baseline gap-2 min-w-0">
            <span
              className={
                row.status === "pending" ? "text-slate-300" : "text-slate-100"
              }
            >
              {t(`thinking.trace.${row.phase}`)}
            </span>
            {row.status === "done" && row.elapsedMs !== undefined && (
              <span className="text-[11px] text-slate-400 shrink-0">
                {formatElapsed(row.elapsedMs)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

type ComposerVariant = "welcome" | "thread";

/** Selected thinking mode chip in the composer toolbar (ChatGPT-style). */
function ThinkingModeChip({
  onRemove,
  variant,
  t,
}: {
  onRemove: () => void;
  variant: ComposerVariant;
  t: (key: string) => string;
}) {
  const size =
    variant === "welcome" ? "text-sm px-2.5 py-1.5" : "text-xs px-2 py-1";
  return (
    <span
      className={`inline-flex max-w-[min(100%,14rem)] items-center gap-1.5 rounded-full border border-sky-300/90 bg-sky-50 font-medium text-sky-700 shadow-sm dark:border-sky-500/35 dark:bg-sky-500/15 dark:text-sky-300 ${size}`}
    >
      <Lightbulb className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span className="truncate">{t("Think")}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 shrink-0 rounded-full p-0.5 text-sky-700 transition-colors hover:bg-sky-200/80 dark:text-sky-200 dark:hover:bg-sky-400/25"
        aria-label={t("home.turnOffThinking")}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </button>
    </span>
  );
}

/** Selected general mode chip in the composer toolbar. */
function GeneralModeChip({
  onRemove,
  variant,
  t,
}: {
  onRemove: () => void;
  variant: ComposerVariant;
  t: (key: string) => string;
}) {
  const size =
    variant === "welcome" ? "text-sm px-2.5 py-1.5" : "text-xs px-2 py-1";
  return (
    <span
      className={`inline-flex max-w-[min(100%,14rem)] items-center gap-1.5 rounded-full border border-emerald-300/90 bg-emerald-50 font-medium text-emerald-700 shadow-sm dark:border-emerald-500/35 dark:bg-emerald-500/15 dark:text-emerald-300 ${size}`}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
      <span className="truncate">{t("General")}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 shrink-0 rounded-full p-0.5 text-emerald-700 transition-colors hover:bg-emerald-200/80 dark:text-emerald-200 dark:hover:bg-emerald-400/25"
        aria-label={t("home.turnOffGeneral")}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
      </button>
    </span>
  );
}

/** Bottom toolbar: +, thinking/general chip, mic, send (inside search bar pill). */
function ComposerBottomToolbar({
  variant,
  plusMenuOpen,
  setPlusMenuOpen,
  enableThinking,
  onClearThinking,
  enableGeneral,
  onClearGeneral,
  handleVoiceToggle,
  isListening,
  onSend,
  onStop,
  sendDisabled,
  isLoading,
  t,
}: {
  variant: ComposerVariant;
  plusMenuOpen: boolean;
  setPlusMenuOpen: (open: boolean) => void;
  enableThinking: boolean;
  onClearThinking: () => void;
  enableGeneral: boolean;
  onClearGeneral: () => void;
  handleVoiceToggle: () => void;
  isListening: boolean;
  onSend: () => void;
  onStop: () => void;
  sendDisabled: boolean;
  isLoading: boolean;
  t: (key: string) => string;
}) {
  const sq = variant === "welcome" ? "h-9 w-9 rounded-xl" : "h-9 w-9 rounded-lg";
  const plusBase =
    variant === "welcome"
      ? "bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600"
      : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700";
  const listeningMic =
    variant === "welcome"
      ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-700"
      : "bg-red-500 text-white border-red-600 animate-pulse";
  const idleMic =
    variant === "welcome"
      ? "bg-slate-100 dark:bg-slate-700/80 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-200 dark:hover:bg-slate-600"
      : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700";
  const sendRound = variant === "welcome" ? "rounded-xl" : "rounded-lg";

  return (
    <div className="flex items-center gap-1.5 px-2 pb-2 pt-1 sm:gap-2 sm:px-3">
      <button
        type="button"
        onClick={() => setPlusMenuOpen(!plusMenuOpen)}
        className={`inline-flex ${sq} shrink-0 items-center justify-center border transition-colors ${plusBase} ${
          plusMenuOpen
            ? "ring-2 ring-indigo-400/50 border-indigo-300 dark:border-indigo-600"
            : ""
        }`}
        aria-expanded={plusMenuOpen}
        aria-haspopup="menu"
        title={t("home.moreOptions")}
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
      {enableThinking ? (
        <ThinkingModeChip variant={variant} onRemove={onClearThinking} t={t} />
      ) : enableGeneral ? (
        <GeneralModeChip variant={variant} onRemove={onClearGeneral} t={t} />
      ) : null}
      <button
        type="button"
        onClick={handleVoiceToggle}
        className={`inline-flex ${sq} shrink-0 items-center justify-center border transition-colors ${
          isListening ? listeningMic : idleMic
        }`}
        title={isListening ? t("Stop voice input") : t("Start voice input")}
      >
        {isListening ? (
          <MicOff className="h-4 w-4" />
        ) : (
          <Mic className="h-4 w-4" />
        )}
      </button>
      <div className="min-w-2 flex-1" aria-hidden />
      <button
        type="button"
        onClick={isLoading ? onStop : onSend}
        disabled={!isLoading && sendDisabled}
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md transition-all hover:from-blue-600 hover:to-indigo-700 disabled:opacity-50 ${sendRound}`}
        title={isLoading ? t("home.stopSearch") : t("Send")}
        aria-label={isLoading ? t("home.stopSearch") : t("Send")}
      >
        {isLoading ? (
          <Square className="h-4 w-4 fill-current" />
        ) : (
          <Send className="h-5 w-5" />
        )}
      </button>
    </div>
  );
}

/** + menu: fixed portal, opens just below the search bar pill (not over title / pills). */
function PlusThinkingMenu({
  open,
  alignRef,
  panelRef,
  setChatState,
  onCloseMenu,
  t,
}: {
  open: boolean;
  alignRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>;
  onCloseMenu: () => void;
  t: (key: string) => string;
}) {
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const box = alignRef.current;
    if (!box) return;
    const gap = 8;
    const menuW = 304;
    const update = () => {
      const r = box.getBoundingClientRect();
      let left = r.left + gap;
      left = Math.max(gap, Math.min(left, window.innerWidth - menuW - gap));
      setPos({ left, top: r.bottom + gap });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, alignRef]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9999] w-[min(calc(100vw-1.25rem),19rem)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.14)] dark:border-white/[0.08] dark:bg-[#2f2f2f] dark:shadow-[0_12px_48px_rgba(0,0,0,0.55)]"
      style={{
        left: pos.left,
        top: pos.top,
      }}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        aria-label={t("Thinking")}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left leading-snug text-slate-800 transition-colors hover:bg-slate-50 active:bg-slate-100/80 dark:text-neutral-100 dark:hover:bg-white/[0.06] dark:active:bg-white/[0.08] sm:px-4"
        onClick={() => {
          setChatState((prev) => ({ ...prev, enableThinking: true, enableGeneral: false }));
          onCloseMenu();
        }}
      >
        <Lightbulb
          className="h-[1.15rem] w-[1.15rem] shrink-0 text-amber-500 dark:text-amber-400"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="text-[0.9375rem] font-medium">{t("Thinking")}</div>
          <div className="mt-0.5 text-[0.8125rem] text-slate-500 dark:text-neutral-400">{t("thinking.menu.description")}</div>
        </div>
      </button>
      <button
        type="button"
        role="menuitem"
        aria-label={t("General")}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left leading-snug text-slate-800 transition-colors hover:bg-slate-50 active:bg-slate-100/80 dark:text-neutral-100 dark:hover:bg-white/[0.06] dark:active:bg-white/[0.08] sm:px-4"
        onClick={() => {
          setChatState((prev) => ({
            ...prev,
            enableGeneral: true,
            enableThinking: false,
            enableRag: false,
            enableWebSearch: false,
          }));
          onCloseMenu();
        }}
      >
        <Sparkles
          className="h-[1.15rem] w-[1.15rem] shrink-0 text-emerald-500 dark:text-emerald-400"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="text-[0.9375rem] font-medium">{t("General")}</div>
          <div className="mt-0.5 text-[0.8125rem] text-slate-500 dark:text-neutral-400">{t("general.menu.description")}</div>
        </div>
      </button>
    </div>,
    document.body,
  );
}

type HomePageClientProps = {
  /** Student portal: personalized Subject → Language → Book journey before chat */
  variant?: "default" | "student";
};

export default function HomePageClient({ variant = "default" }: HomePageClientProps) {
  /** TEMP: set to `false` to strip this block locally (commit checks / debugging). Remove when no longer needed. */
  const TEMP_HOME_SHOW_CONCEPT_SUMMARY = true;
  /** TEMP: set to `false` to strip related-videos locally. Remove when no longer needed. */
  const TEMP_HOME_SHOW_RELATED_YOUTUBE = true;

  const {
    chatState,
    setChatState,
    sendChatMessage,
    stopChatMessage,
    clearChatHistory,
    newChatSession,
    toast,
    setToast,
  } = useGlobal();
  const { t, i18n } = useTranslation();

  const [inputMessage, setInputMessage] = useState("");
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const knowledgeBasesForHome = useMemo(
    () => kbs.filter(kbReadyForHomeSource),
    [kbs],
  );
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const stopRequestedRef = useRef(false);
  const [showNotebookModal, setShowNotebookModal] = useState(false);
  const [notebookPayload, setNotebookPayload] = useState<{
    title: string;
    userQuery: string;
    output: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  } | null>(null);
  const [notebookSaveLoading, setNotebookSaveLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [studentChatCtx, setStudentChatCtx] = useState<StudentChatContext | null>(
    null,
  );
  const isStudentPortal = variant === "student";

  useEffect(() => {
    if (!isStudentPortal) return;
    const saved = loadStudentChatContext();
    if (!saved) {
      setStudentChatCtx(null);
      return;
    }
    loadPdfUrlRemap().then((remap) => {
      const normalized = normalizeStudentChatContext(saved, remap);
      if (normalized.chapterUrl !== saved.chapterUrl) {
        saveStudentChatContext(normalized);
      }
      setStudentChatCtx(normalized);
    });
  }, [isStudentPortal]);

  const plusMenuWrapRef = useRef<HTMLDivElement>(null);
  const plusMenuSearchBarRef = useRef<HTMLDivElement>(null);
  const plusMenuPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!plusMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const wrap = plusMenuWrapRef.current;
      const panel = plusMenuPanelRef.current;
      const inside =
        (wrap && wrap.contains(target)) ||
        (panel && panel.contains(target));
      if (!inside) {
        setPlusMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [plusMenuOpen]);

  useEffect(() => {
    if (!plusMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPlusMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [plusMenuOpen]);

  const loadNotebookChatPayload = async () => {
    const { fetchChatMessagesForNotebook, buildNotebookChatPayload } =
      await import("@/lib/notebookRecordContent");
    const messages = await fetchChatMessagesForNotebook(
      chatState.sessionId,
      chatState.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          role: m.role,
          content: (m.content ?? "").trim(),
        }))
        .filter((m) => m.content.length > 0),
    );
    return buildNotebookChatPayload(messages, t("Chat Session"));
  };

  const openNotebookSave = async () => {
    if (chatState.messages.length === 0) return;
    setNotebookSaveLoading(true);
    try {
      setNotebookPayload(await loadNotebookChatPayload());
      setShowNotebookModal(true);
    } catch (err) {
      console.error(err);
    } finally {
      setNotebookSaveLoading(false);
    }
  };

  // Fetch knowledge bases
  useEffect(() => {
    fetch(apiUrl("/api/v1/knowledge/list"))
      .then((res) => res.json())
      .then((data) => {
        // Ensure data is an array before processing
        const kbList = Array.isArray(data) ? data : [];
        setKbs(kbList);
        const ready = kbList.filter(kbReadyForHomeSource);
        if (!chatState.selectedKb && ready.length > 0) {
          const defaultKb = ready.find((kb: KnowledgeBase) => kb.is_default);
          if (defaultKb) {
            setChatState((prev) => ({ ...prev, selectedKb: defaultKb.name }));
          } else {
            setChatState((prev) => ({ ...prev, selectedKb: ready[0].name }));
          }
        }
      })
      .catch((err) => console.error("Failed to fetch KBs:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If the current KB was hidden (e.g. still initializing), fall back to a usable one.
  useEffect(() => {
    if (!chatState.enableRag || !chatState.selectedKb) return;
    const names = new Set(knowledgeBasesForHome.map((k) => k.name));
    if (names.size === 0) return;
    const hasMatch = Array.from(names).some(name => isKbEquivalent(name, chatState.selectedKb));
    if (hasMatch) return;
    const fallback =
      knowledgeBasesForHome.find((k) => isNcertKb(k.name))?.name ||
      knowledgeBasesForHome.find((k) => k.is_default)?.name ||
      knowledgeBasesForHome[0]?.name;
    if (!fallback) return;
    setChatState((prev) => ({
      ...prev,
      selectedKb: fallback,
      selectedPdfUrl: "",
      selectedPdfTopicLabel: "",
    }));
  }, [
    chatState.enableRag,
    chatState.selectedKb,
    knowledgeBasesForHome,
    setChatState,
  ]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [chatState.messages]);

  const handleSend = () => {
    if (!inputMessage.trim() || chatState.isLoading) return;
    sendChatMessage(inputMessage);
    setInputMessage("");
  };

  const applyStudentChatContext = (ctx: StudentChatContext) => {
    // Prefer per-subject KB (e.g. ncert-class-8-science), fall back to per-class,
    // then to the first available NCERT KB.
    const subjectKb = kbNameForClassSubject(ctx.classKey, ctx.subjectKey);
    const classKb = kbNameForClass(ctx.classKey);
    const kb =
      knowledgeBasesForHome.find((k) => k.name === subjectKb)?.name ||
      knowledgeBasesForHome.find((k) => k.name === classKb)?.name ||
      knowledgeBasesForHome.find((k) => isNcertKb(k.name))?.name ||
      subjectKb;
    setChatState((prev) => ({
      ...prev,
      enableRag: true,
      enableWebSearch: false,
      enableGeneral: false,
      selectedKb: kb,
      selectedPdfUrl: ctx.chapterUrl,
      selectedPdfTopicLabel: ctx.chapterLabel,
    }));
  };

  const handleStudentChapterSelect = (ctx: StudentChatContext) => {
    saveStudentChatContext(ctx);
    setStudentChatCtx(ctx);
    applyStudentChatContext(ctx);
  };

  const handleSelectPdfFromDropdown = (
    url: string,
    label: string,
    cls?: string,
    subj?: string,
    rawCode?: string
  ) => {
    if (isStudentPortal && cls && subj && rawCode) {
      const chapterOpt = {
        rawCode,
        url,
        label,
        displayTitle: label,
      };
      const studentCtx = buildChapterContext(
        cls,
        studentChatCtx?.medium || "English",
        subj,
        chapterOpt
      );
      handleStudentChapterSelect(studentCtx);
    } else {
      const n = cls ? cls.replace("class-", "") : null;
      const subjSlug = subj ? subj.toLowerCase().replace(/\s+/g, "-") : null;
      const derivedKb =
        n && subjSlug
          ? `ncert-class-${n}-${subjSlug}`
          : n
          ? `ncert-class-${n}`
          : undefined;
      setChatState((prev: any) => ({
        ...prev,
        selectedKb: derivedKb || prev.selectedKb,
        selectedPdfUrl: url,
        selectedPdfTopicLabel: (label || "").trim(),
        enableRag: true,
        enableWebSearch: false,
      }));
    }
  };

  const handleStudentChangeChapter = () => {
    clearStudentChatContext();
    setStudentChatCtx(null);
    newChatSession();
  };

  useEffect(() => {
    if (!studentChatCtx || !isStudentPortal) return;
    applyStudentChatContext(studentChatCtx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentChatCtx?.chapterUrl, knowledgeBasesForHome.length]);

  const handleNewChat = () => {
    newChatSession();
    if (isStudentPortal) {
      clearStudentChatContext();
      setStudentChatCtx(null);
    }
  };

  const handleStopChat = () => {
    stopChatMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSelectSource = (source: "web" | "ncert") => {
    if (source === "web") {
      setChatState((prev) => ({
        ...prev,
        enableWebSearch: true,
        enableRag: false,
        enableGeneral: false,
      }));
    } else {
      setChatState((prev) => ({
        ...prev,
        enableRag: true,
        enableWebSearch: false,
        enableGeneral: false,
        // Prefer first available NCERT KB when none chosen yet
        selectedKb:
          prev.selectedKb ||
          knowledgeBasesForHome.find((kb) => isNcertKb(kb.name))?.name ||
          knowledgeBasesForHome.find((kb) => kb.is_default)?.name ||
          knowledgeBasesForHome[0]?.name,
      }));
    }
  };

  const handleVoiceToggle = async () => {
    if (typeof window === "undefined") return;

    if (isListening && recognitionRef.current) {
      stopRequestedRef.current = true;
      recognitionRef.current.stop();
      return;
    }

    // Manual permission request first (triggered only on mic button click)
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaStream.getTracks().forEach((track) => track.stop());
      }
    } catch (_permissionError) {
      setToast({
        message:
          "Microphone permission denied. Please allow microphone access for this site, then click mic again.",
        type: "error",
      });
      setIsListening(false);
      recognitionRef.current = null;
      return;
    }

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setToast({
        message: "Voice input is not supported in this browser.",
        type: "error",
      });
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;

    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      const finalText = transcript.trim();
      if (finalText) {
        setInputMessage((prev) => (prev ? `${prev} ${finalText}` : finalText));
      }
    };

    recognition.onerror = (event: any) => {
      if (!stopRequestedRef.current) {
        const errorType = event?.error;
        let message = "Voice capture failed. Please try again.";

        if (errorType === "not-allowed" || errorType === "service-not-allowed") {
          message =
            "Microphone permission denied. Please allow microphone access for this site, then click mic again.";
        } else if (errorType === "audio-capture") {
          message = "No microphone detected. Please check your audio input device.";
        } else if (errorType === "no-speech") {
          message = "No speech detected. Try again and speak clearly.";
        } else if (errorType === "network") {
          message = "Voice recognition network error. Please try again.";
        } else if (errorType === "aborted") {
          message = "Voice input was interrupted. Please try again.";
        }

        setToast({
          message,
          type: "error",
        });
      }
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      if (!stopRequestedRef.current && recognitionRef.current) {
        try {
          recognitionRef.current.start();
          setIsListening(true);
          return;
        } catch (_restartError) {
          // If restart fails, fall through and reset state.
        }
      }

      setIsListening(false);
      recognitionRef.current = null;
      stopRequestedRef.current = false;
    };

    stopRequestedRef.current = false;
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch (_error) {
      recognitionRef.current = null;
      setIsListening(false);
      setToast({
        message: "Unable to start voice input. Try reloading page and allowing microphone access.",
        type: "error",
      });
    }
  };

  const quickActions = [
    {
      icon: Calculator,
      label: t("Smart Problem Solving"),
      href: "/solver",
      cardColor: "bg-blue-50/50 hover:bg-blue-50 border-blue-200 hover:border-blue-300 dark:bg-blue-900/10 dark:hover:bg-blue-900/20 dark:border-blue-800",
      iconColor: "text-blue-600 dark:text-blue-400",
      iconBg: "bg-blue-100 dark:bg-blue-900/40",
      description: t("Multi-agent reasoning"),
    },
    {
      icon: PenTool,
      label: t("Generate Practice Questions"),
      href: "/question",
      cardColor: "bg-purple-50/50 hover:bg-purple-50 border-purple-200 hover:border-purple-300 dark:bg-purple-900/10 dark:hover:bg-purple-900/20 dark:border-purple-800",
      iconColor: "text-purple-600 dark:text-purple-400",
      iconBg: "bg-purple-100 dark:bg-purple-900/40",
      description: t("Auto-validated quizzes"),
    },
    {
      icon: Microscope,
      label: t("Deep Research Reports"),
      href: "/research",
      cardColor: "bg-emerald-50/50 hover:bg-emerald-50 border-emerald-200 hover:border-emerald-300 dark:bg-emerald-900/10 dark:hover:bg-emerald-900/20 dark:border-emerald-800",
      iconColor: "text-emerald-600 dark:text-emerald-400",
      iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
      description: t("Comprehensive analysis"),
    },
    {
      icon: GraduationCap,
      label: t("Guided Learning"),
      href: "/guide",
      cardColor: "bg-indigo-50/50 hover:bg-indigo-50 border-indigo-200 hover:border-indigo-300 dark:bg-indigo-900/10 dark:hover:bg-indigo-900/20 dark:border-indigo-800",
      iconColor: "text-indigo-600 dark:text-indigo-400",
      iconBg: "bg-indigo-100 dark:bg-indigo-900/40",
      description: t("Step-by-step tutoring"),
    },
    // {
    //   icon: Edit3,
    //   label: t("Co-Writer"),
    //   href: "/co_writer",
    //   cardColor: "bg-pink-50/50 hover:bg-pink-50 border-pink-200 hover:border-pink-300 dark:bg-pink-900/10 dark:hover:bg-pink-900/20 dark:border-pink-800",
    //   iconColor: "text-pink-600 dark:text-pink-400",
    //   iconBg: "bg-pink-100 dark:bg-pink-900/40",
    //   description: t("Collaborative writing"),
    // },
  ];

  const hasMessages = chatState.messages.length > 0;
  const showStudentWorkspace = isStudentPortal && !!studentChatCtx;
  const showStudentJourney =
    isStudentPortal && !studentChatCtx;
  const showDefaultWelcome = !hasMessages && !showStudentJourney && !showStudentWorkspace;
  const showDefaultChat = hasMessages && !showStudentWorkspace;

  const lastChatMsg =
    chatState.messages.length > 0
      ? chatState.messages[chatState.messages.length - 1]
      : undefined;
  const showThinkingAwaitingFirstToken =
    Boolean(
      chatState.enableThinking &&
        chatState.isLoading &&
        lastChatMsg &&
        (lastChatMsg.role === "user" ||
          (lastChatMsg.role === "assistant" && !lastChatMsg.content?.trim())),
    );
  const showThinkingStatusRow =
    Boolean(
      showThinkingAwaitingFirstToken && lastChatMsg?.role === "user",
    );

  return (
    <div className="h-full min-h-0 max-h-full flex flex-col overflow-hidden animate-fade-in">
      <PlusThinkingMenu
        open={plusMenuOpen}
        alignRef={plusMenuSearchBarRef}
        panelRef={plusMenuPanelRef}
        setChatState={setChatState}
        onCloseMenu={() => setPlusMenuOpen(false)}
        t={t}
      />
      {/* Global toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50">
          <div className={`px-4 py-2.5 rounded-lg shadow-md border text-sm ${
            toast.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800"
              : toast.type === "error"
                ? "bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800"
                : "bg-background text-foreground border-border"
          }`}>
            {toast.message}
          </div>
        </div>
      )}
      {/* Student: chapter + chat split workspace */}
      {showStudentWorkspace && studentChatCtx && (
        <StudentChapterWorkspace
          ctx={studentChatCtx}
          onChangeChapter={handleStudentChangeChapter}
        />
      )}

      {/* Student: medium → subject → chapter picker */}
      {showStudentJourney && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col items-center relative bg-background py-6 md:py-10">
          <StudentChatJourney onChapterReady={handleStudentChapterSelect} />
        </div>
      )}

      {/* Default welcome (non-student or legacy home) */}
      {showDefaultWelcome && (
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col items-center relative py-12 md:py-20 px-6">
            <>
          {/* Subtle Background Pattern */}
          <div
            className="absolute inset-0 opacity-[0.03] dark:opacity-[0.05] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '32px 32px' }}
          />

          <div className="text-center max-w-2xl mx-auto mb-8 relative z-10 px-6">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-vidya-600 via-vidya-500 to-vidya-700 dark:from-vidya-400 dark:via-vidya-300 dark:to-vidya-500 mb-4 tracking-tight drop-shadow-sm py-1 text-balance">
              {t("Welcome to bixy_AiTutor")}
            </h1>
            <p className="text-lg font-medium text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
              {t("bixy_AiTutor can make mistakes. Please verify important information.")}
            </p>
          </div>

          {/* Input Box - Centered: one relative wrapper so + menu stacks above source toggles */}
          <div className="w-full max-w-2xl mx-auto mb-12 px-6">
            <div
              className="relative z-40"
              ref={plusMenuWrapRef}
            >
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 px-1">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => handleSelectSource("web")}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium shadow-sm transition-colors ${chatState.enableWebSearch && !chatState.enableRag
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    }`}
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  {t("Websearch")}
                </button>
                <button
                  type="button"
                  onClick={() => handleSelectSource("ncert")}
                  className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium shadow-sm transition-colors ${chatState.enableRag && !chatState.enableWebSearch
                    ? "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-200"
                    : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                    }`}
                >
                  <BookOpen className="w-4 h-4 shrink-0" />
                  {t("NCERT Knowledge")}
                </button>
              </div>
              {chatState.enableRag && (
                <NCERTRagDropdown
                  kbs={knowledgeBasesForHome}
                  onSelectPdf={handleSelectPdfFromDropdown}
                />
              )}
            </div>

            {/* Glowing Input Container — search bar shell for + menu anchoring */}
            <div
              className="relative group w-full"
              ref={plusMenuSearchBarRef}
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-vidya-500 via-vidya-400 to-vidya-600 rounded-3xl blur opacity-20 group-focus-within:opacity-45 transition duration-300"></div>

              <div className="relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card dark:bg-slate-800 shadow-lg">
                <input
                  ref={inputRef}
                  type="text"
                  className="w-full border-0 bg-transparent px-4 pb-2 pt-3.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-200"
                  placeholder={t("Ask anything...")}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={chatState.isLoading}
                />
                <ComposerBottomToolbar
                  variant="welcome"
                  plusMenuOpen={plusMenuOpen}
                  setPlusMenuOpen={setPlusMenuOpen}
                  enableThinking={chatState.enableThinking}
                  onClearThinking={() =>
                    setChatState((prev) => ({ ...prev, enableThinking: false }))
                  }
                  enableGeneral={chatState.enableGeneral}
                  onClearGeneral={() =>
                    setChatState((prev) => ({ ...prev, enableGeneral: false, enableRag: true }))
                  }
                  handleVoiceToggle={handleVoiceToggle}
                  isListening={isListening}
                  onSend={handleSend}
                  onStop={handleStopChat}
                  sendDisabled={chatState.isLoading || !inputMessage.trim()}
                  isLoading={chatState.isLoading}
                  t={t}
                />
              </div>
            </div>
            </div>

            {/* Try Asking Pills — full prompt inserted into the search bar (localized) */}
            <div className="mt-5 flex flex-wrap justify-center gap-2 gap-y-2.5 items-center relative z-10 opacity-80 hover:opacity-100 transition-opacity max-w-3xl mx-auto px-1">
              <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider w-full text-center sm:w-auto sm:mr-1 sm:text-left">
                {t("Try asking:")}
              </span>
              {(
                [
                  { i18nKey: "tryAsk.colorful_notes", icon: "📘" },
                  { i18nKey: "tryAsk.understanding_quiz", icon: "🧠" },
                  { i18nKey: "tryAsk.revision_notes", icon: "📝" },
                  { i18nKey: "tryAsk.competency_questions", icon: "🎯" },
                  { i18nKey: "tryAsk.chapter_mindmap", icon: "🗺️" },
                  { i18nKey: "tryAsk.quick_revise", icon: "⚡" },
                  { i18nKey: "tryAsk.diagrams_flowcharts", icon: "📊" },
                  { i18nKey: "tryAsk.ncert_questions", icon: "📚" },
                  { i18nKey: "tryAsk.chapter_test", icon: "🏆" },
                  { i18nKey: "tryAsk.explain_simply", icon: "🔍" },
                  { i18nKey: "tryAsk.study_notes", icon: "📒" },
                  { i18nKey: "tryAsk.story_lesson", icon: "🎭" },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.i18nKey}
                  type="button"
                  onClick={() => {
                    setInputMessage(t(pill.i18nKey));
                    inputRef.current?.focus();
                  }}
                  className="px-3 py-1.5 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:border-indigo-600 dark:hover:bg-indigo-900/25 text-slate-600 dark:text-slate-300 transition-all shadow-sm focus:outline-none text-xs flex items-center gap-1.5 max-w-[min(100%,20rem)] text-left"
                  title={t(pill.i18nKey)}
                >
                  <span className="shrink-0" aria-hidden>
                    {pill.icon}
                  </span>
                  <span className="line-clamp-2">{t(pill.i18nKey)}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Actions Grid */}
          <div className="w-full max-w-3xl mx-auto">
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 text-center">
              {t("Explore Modules")}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {quickActions.map((action, i) => (
                <Link
                  key={i}
                  href={action.href}
                  className={`group p-4 rounded-2xl border ${action.cardColor} hover:shadow-lg transition-all`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl ${action.iconBg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}
                  >
                    <action.icon
                      className={`w-5 h-5 ${action.iconColor}`}
                    />
                  </div>
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">
                    {action.label}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {action.description}
                  </p>
                </Link>
              ))}
            </div>
          </div>
            </>
        </div>
      )}

      {/* Default full-page chat (non-student) */}
      {showDefaultChat && (
        <div className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">
          {/* Header Bar */}
          <div className="relative z-20 shrink-0 flex items-center justify-between px-4 sm:px-6 py-3 border-b border-border bg-background/90 dark:bg-slate-900/90 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              {/* Mode Toggles removed but feature defaults to true. KB dropdown is the only item. */}

              {chatState.enableRag && (
                <NCERTRagDropdown
                  kbs={knowledgeBasesForHome}
                  compact
                  restrictClassKey={studentChatCtx?.classKey}
                  restrictSubjectKey={studentChatCtx?.subjectKey}
                  onSelectPdf={handleSelectPdfFromDropdown}
                />
              )}
            </div>

            <div className="flex items-center gap-2">
              {chatState.selectedPdfUrl && (
                <div className="flex items-center gap-2 mr-2">
                  <a
                    href={chatState.selectedPdfUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg max-w-[220px] truncate"
                  >
                    {chatState.selectedPdfUrl.split("/").pop()}
                  </a>
                  <button
                    onClick={() =>
                      setChatState((prev) => ({
                        ...prev,
                        selectedPdfUrl: "",
                        selectedPdfTopicLabel: "",
                      }))
                    }
                    className="text-xs text-slate-500 hover:text-red-600"
                    title={t("Clear selected PDF")}
                  >
                    ×
                  </button>
                </div>
              )}
              <button
                type="button"
                onClick={() => void openNotebookSave()}
                disabled={
                  chatState.messages.length === 0 || notebookSaveLoading
                }
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors disabled:opacity-40"
                title={t("Save to Notebook")}
              >
                <Save className="w-3.5 h-3.5" />
                {notebookSaveLoading
                  ? t("Saving")
                  : t("Save to Notebook")}
              </button>
              <button
                onClick={handleNewChat}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("New Chat")}
              </button>
            </div>
          </div>

          {/* Messages Area — scrolls; composer stays below (shrink-0) */}
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain px-6 py-8 space-y-8"
          >
            {chatState.messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex gap-4 w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500 ${msg.role === "user" ? "flex-row-reverse" : ""
                  }`}
              >
                {msg.role === "user" ? (
                  <div className="max-w-[85%] bg-vidya-600 px-5 py-3.5 rounded-3xl rounded-tr-[4px] text-white shadow-md shadow-vidya-600/25 font-medium">
                    {msg.content}
                  </div>
                ) : (
                  <>
                    <div className="w-8 h-8 mt-1 rounded-full bg-gradient-to-br from-vidya-500 to-vidya-700 flex items-center justify-center shrink-0 shadow-sm shadow-vidya-600/20 relative">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 max-w-[90%] min-w-0 space-y-3">
                      {/* ── Thinking-mode card vs Normal card ── */}
                      <div
                        className={
                          msg.isThinking
                            ? "relative bg-card dark:bg-slate-900 px-6 py-5 rounded-3xl rounded-tl-[4px] border border-amber-200/70 dark:border-amber-500/20 shadow-sm text-foreground min-w-0 border-l-4 border-l-amber-400 dark:border-l-amber-500"
                            : "bg-card dark:bg-slate-800 px-6 py-5 rounded-3xl rounded-tl-[4px] border border-vidya-100 dark:border-vidya-500/20 shadow-sm text-foreground min-w-0"
                        }
                      >
                        {/* Thinking Mode badge — shown on completed thinking answers */}
                        {msg.isThinking && !msg.isStreaming && msg.content?.trim() && (
                          <div className="flex items-center gap-1.5 mb-4 pb-3 border-b border-amber-200/60 dark:border-amber-500/20">
                            <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" strokeWidth={2} />
                            <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400 select-none">
                              {t("thinking.tutor.badge")}
                            </span>
                          </div>
                        )}
                        {msg.isStreaming &&
                        !msg.content?.trim() &&
                        chatState.enableThinking ? (
                          <div className="rounded-2xl bg-slate-600 px-5 py-4 border border-slate-500/40 shadow-inner">
                            {chatState.thinkingTrace.length > 0 ? (
                              <>
                                <ThinkingTraceList
                                  steps={chatState.thinkingTrace}
                                  t={t}
                                />
                                <div className="mt-3 border-t border-slate-500/40 pt-3">
                                  <ThinkingShimmerLabel text={t("Thinking")} />
                                </div>
                              </>
                            ) : (
                              <ThinkingShimmerLabel text={t("Thinking")} />
                            )}
                          </div>
                        ) : (
                        <div className="prose prose-slate dark:prose-invert max-w-none min-w-0 leading-relaxed">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              img: ({ node, src, alt, ...props }) => {
                                const resolvedSrc = typeof src === "string" && src.startsWith("/api/") ? apiUrl(src) : (typeof src === "string" ? src : undefined);
                                return (
                                  <figure className="my-4 not-prose">
                                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 shadow-sm">
                                      <div className="flex justify-center p-3 bg-slate-50 dark:bg-slate-800">
                                        <img
                                          src={resolvedSrc}
                                          alt={alt || ""}
                                          className="max-w-full max-h-[280px] h-auto object-contain rounded-md"
                                          loading="lazy"
                                          onError={(e) => {
                                            e.currentTarget.closest("figure")?.classList.add("hidden");
                                          }}
                                          {...props}
                                        />
                                      </div>
                                      {alt && (
                                        <div className="px-3 py-1.5 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 truncate">
                                          {alt}
                                        </div>
                                      )}
                                    </div>
                                  </figure>
                                );
                              },
                            }}
                          >
                            {processLatexContent(msg.content)}
                          </ReactMarkdown>

                          {(msg.relatedDiagramMermaid || "").trim() ? (
                            <HomeRelatedDiagram
                              chart={(msg.relatedDiagramMermaid || "").trim()}
                              title={msg.relatedDiagramTitle}
                              titleFallback={t("home.relatedDiagram.title")}
                            />
                          ) : null}

                          {/* ── Web Image Gallery (only shown when NOT using composed inline images) ── */}
                          {msg.webImages && msg.webImages.length > 0 && !msg.composedContent && (
                            <div className="mt-6 space-y-3">
                              <p className="font-semibold text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                                <Globe className="w-4 h-4 text-emerald-500" />
                                {t("home.relatedVisuals.title")}
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                                {msg.webImages.map((img, i) => (
                                  <div
                                    key={i}
                                    className="group min-w-0 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all duration-300"
                                  >
                                    <div className="relative bg-slate-50 dark:bg-slate-800 flex justify-center items-center p-3 min-h-[160px] min-w-0 w-full">
                                      <img
                                        src={img.url}
                                        alt={img.title}
                                        className="block max-w-full max-h-[220px] w-auto h-auto object-contain rounded-md cursor-zoom-in mx-auto"
                                        loading="lazy"
                                        onClick={() => window.open(img.url, "_blank")}
                                        onError={(e) => {
                                          const target = e.currentTarget;
                                          console.warn(
                                            `[ImagePipeline] Failed to load image: ${target.src}`
                                          );
                                          target.closest(".group")?.classList.add("hidden");
                                        }}
                                      />
                                    </div>
                                    {/* Footer */}
                                    <div className="px-3 py-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-sm">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 uppercase tracking-wide">
                                          {img.keyword}
                                        </span>
                                        <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                          {img.title}
                                        </span>
                                      </div>
                                      {img.source_url && (
                                        <a
                                          href={img.source_url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="shrink-0 text-blue-500 hover:text-blue-600 transition-colors"
                                          title="View on Wikimedia"
                                        >
                                          <ExternalLink className="w-3.5 h-3.5" />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        )}

                        {/* Concept Image — only shown when NOT using composed inline images */}
                        {msg.imageUrl && !msg.composedContent && (
                          <div className="mt-4 w-full min-w-0 rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-50 dark:bg-slate-900/50 shadow-sm transition-all duration-300">
                            <div className="w-full min-w-0 flex justify-center items-center p-3 sm:p-4 bg-slate-100/90 dark:bg-slate-900/40">
                              <img
                                src={msg.imageUrl}
                                alt={msg.imageTitle || "Concept image"}
                                className="block max-w-full w-auto h-auto max-h-[min(58vh,640px)] object-contain mx-auto rounded-md"
                                loading="lazy"
                              />
                            </div>
                            <div className="px-4 py-2 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border-t border-slate-100 dark:border-slate-700">
                              <div className="flex items-center gap-1.5 truncate pr-2">
                                <span className="font-semibold text-slate-600 dark:text-slate-400 shrink-0">Concept:</span>
                                <span className="truncate">{msg.imageTitle}</span>
                              </div>
                              {msg.imageSourceUrl && (
                                <a
                                  href={msg.imageSourceUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-vidya-600 hover:text-vidya-700 dark:text-vidya-400 font-medium"
                                >
                                  Source
                                </a>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Loading indicator */}
                        {msg.isStreaming &&
                          (msg.content?.trim() || !chatState.enableThinking) && (
                          <div className="flex items-center gap-2 mt-3 text-blue-600 dark:text-blue-400 text-sm">
                            <span className="flex space-x-1">
                              <span className="w-1.5 h-1.5 bg-vidya-600 dark:bg-vidya-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                              <span className="w-1.5 h-1.5 bg-vidya-600 dark:bg-vidya-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                              <span className="w-1.5 h-1.5 bg-vidya-600 dark:bg-vidya-400 rounded-full animate-bounce"></span>
                            </span>
                          </div>
                        )}

                        {/* Sources */}
                        {msg.sources &&
                          (msg.sources.rag?.length ?? 0) +
                          (msg.sources.web?.length ?? 0) +
                          (msg.sources.videos?.length ?? 0) >
                          0 && (
                            <div className="space-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
                              {msg.sources.videos && msg.sources.videos.length > 0 && (
                                <div className="space-y-2">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600 dark:text-rose-400">
                                    {t("Videos")}
                                  </p>
                                  <ChatSourceVideos videos={msg.sources.videos} max={5} />
                                </div>
                              )}
                              <div className="flex flex-wrap gap-2">
                                {msg.sources.rag?.map((source, i) => (
                                  <div
                                    key={`rag-${i}`}
                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs"
                                  >
                                    <BookOpen className="w-3 h-3" />
                                    <span>{source.kb_name}</span>
                                  </div>
                                ))}
                                {msg.sources.web?.slice(0, 2).map((source, i) => (
                                  <a
                                    key={`web-${i}`}
                                    href={source.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                                  >
                                    <Globe className="w-3 h-3 shrink-0" />
                                    <span className="max-w-[180px] truncate">
                                      {source.title || source.url}
                                    </span>
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                        {/*  Avatar Narrator — Listen in English or Hindi */}
                        {!msg.isStreaming && msg.content?.length > 20 && (
                          <AvatarNarrator text={msg.content} language="en" />
                        )}

                        {/* Concept Summary — 3–5 sentence audio brief, language-aware */}
                        {TEMP_HOME_SHOW_CONCEPT_SUMMARY &&
                          !msg.isStreaming &&
                          msg.content?.length > 20 && (
                          <ConceptSummary
                            text={msg.content}
                            query={(() => {
                              const u = chatState.messages
                                .slice(0, idx)
                                .reverse()
                                .find((m) => m.role === "user")?.content;
                              return u || undefined;
                            })()}
                            uiLanguage={i18n.language}
                          />
                        )}
                        {/* Related videos — inferred topic + /youtube-home API */}
                        {TEMP_HOME_SHOW_RELATED_YOUTUBE &&
                          !msg.isStreaming &&
                          msg.content?.length > 20 &&
                          (() => {
                            const pairedUser =
                              chatState.messages
                                .slice(0, idx)
                                .reverse()
                                .find((m) => m.role === "user")?.content ?? "";
                            const ragBlob =
                              msg.sources?.rag
                                ?.map((r) => r.content)
                                .filter(Boolean)
                                .join("\n\n") ?? "";
                            const youtubeTopic = deriveHomeYoutubeTopic({
                              userMessage: pairedUser,
                              assistantContent: msg.content,
                              pdfUrl: chatState.selectedPdfUrl,
                              ragSnippet: ragBlob || undefined,
                              imageTitle: msg.imageTitle,
                              selectedSourceTitle:
                                chatState.selectedPdfTopicLabel?.trim() ||
                                undefined,
                            });
                            return (
                              <HomeYoutubeSuggestions
                                topicQuery={youtubeTopic}
                                uiLanguage={i18n.language}
                                onPickPrompt={(prompt) => {
                                  setInputMessage(prompt);
                                  requestAnimationFrame(() => inputRef.current?.focus());
                                }}
                              />
                            );
                          })()}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Think mode: ChatGPT-style row before the assistant bubble exists */}
            {showThinkingStatusRow && (
              <div className="flex gap-4 w-full max-w-4xl mx-auto items-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="w-8 h-8 mt-1 rounded-full bg-gradient-to-br from-vidya-500 to-vidya-700 flex items-center justify-center shrink-0 shadow-sm shadow-vidya-600/20 relative">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="rounded-2xl bg-slate-700 dark:bg-slate-800 px-5 py-4 border border-slate-600/40 shadow-inner max-w-md">
                  {chatState.thinkingTrace.length > 0 ? (
                    <>
                      <ThinkingTraceList
                        steps={chatState.thinkingTrace}
                        t={t}
                      />
                      <div className="mt-3 border-t border-slate-500/40 pt-3">
                        <ThinkingShimmerLabel text={t("Thinking")} />
                      </div>
                    </>
                  ) : (
                    <ThinkingShimmerLabel text={t("Thinking")} />
                  )}
                </div>
              </div>
            )}

            {/* Status indicator */}
            {chatState.isLoading &&
              chatState.currentStage &&
              !showThinkingAwaitingFirstToken && (
              <div className="flex gap-4 w-full max-w-4xl mx-auto items-end animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-vidya-500 to-vidya-700 flex items-center justify-center shrink-0 shadow-md shadow-vidya-600/25 relative">
                  <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-spin-slow"></div>
                  <Bot className="w-4 h-4 text-white animate-pulse" />
                </div>
                <div className="bg-card dark:bg-slate-800 px-5 py-3.5 rounded-2xl rounded-bl-none shadow-sm border border-vidya-100 dark:border-vidya-500/20 max-w-sm">
                  <div className="flex items-center gap-2 text-vidya-700 dark:text-vidya-300 text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      {chatState.currentStage === "rag" ? "Bixy is checking knowledge bases" :
                        chatState.currentStage === "web" ? "Bixy is searching the web" :
                          chatState.currentStage === "generating" ? "Bixy is formulating a perfect answer" :
                            `Bixy is ${chatState.currentStage.toLowerCase()}`}
                    </span>
                    <span className="flex space-x-1 ml-1 items-center">
                      <span className="w-1 h-1 bg-vidya-500 dark:bg-vidya-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="w-1 h-1 bg-vidya-500 dark:bg-vidya-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="w-1 h-1 bg-vidya-500 dark:bg-vidya-400 rounded-full animate-bounce"></span>
                    </span>
                  </div>
                </div>
              </div>
            )}


          </div>

          {/* Composer — fixed to bottom */}
          <div className="shrink-0 border-t border-border bg-background dark:bg-slate-900 px-4 sm:px-6 py-3 sm:py-4 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <div
              className="max-w-4xl mx-auto relative z-50"
              ref={plusMenuWrapRef}
            >
              <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleSelectSource("web")}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors ${chatState.enableWebSearch && !chatState.enableRag
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  }`}
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                {t("Websearch")}
              </button>
              <button
                type="button"
                onClick={() => handleSelectSource("ncert")}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-sm transition-colors ${chatState.enableRag && !chatState.enableWebSearch
                  ? "border-indigo-300 bg-indigo-50 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-200"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  }`}
              >
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                {t("NCERT Knowledge")}
              </button>
            </div>
            <div
              className="relative group"
              ref={plusMenuSearchBarRef}
            >
              <div className="absolute -inset-0.5 bg-gradient-to-r from-vidya-500/20 to-vidya-400/20 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition duration-300"></div>
              <div className="relative flex flex-col overflow-hidden rounded-xl border border-border bg-muted/50 dark:bg-slate-800/80 shadow-sm">
                <input
                  ref={inputRef}
                  type="text"
                  className="w-full border-0 bg-transparent px-4 pb-2 pt-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder={t("Type your message...")}
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={chatState.isLoading}
                />
                <ComposerBottomToolbar
                  variant="thread"
                  plusMenuOpen={plusMenuOpen}
                  setPlusMenuOpen={setPlusMenuOpen}
                  enableThinking={chatState.enableThinking}
                  onClearThinking={() =>
                    setChatState((prev) => ({ ...prev, enableThinking: false }))
                  }
                  enableGeneral={chatState.enableGeneral}
                  onClearGeneral={() =>
                    setChatState((prev) => ({ ...prev, enableGeneral: false, enableRag: true }))
                  }
                  handleVoiceToggle={handleVoiceToggle}
                  isListening={isListening}
                  onSend={handleSend}
                  onStop={handleStopChat}
                  sendDisabled={chatState.isLoading || !inputMessage.trim()}
                  isLoading={chatState.isLoading}
                  t={t}
                />
              </div>
            </div>
            </div>
          </div>
        </div>
      )}
      {/* Notebook Modal */}
      {showNotebookModal && notebookPayload && (
        <AddToNotebookModal
          isOpen={showNotebookModal}
          onClose={() => {
            setShowNotebookModal(false);
            setNotebookPayload(null);
          }}
          recordType="chat"
          title={notebookPayload.title}
          userQuery={notebookPayload.userQuery}
          output={notebookPayload.output}
          metadata={{
            ...(chatState.sessionId ? { session_id: chatState.sessionId } : {}),
            chat_messages: notebookPayload.messages,
          }}
        />
      )}
    </div>
  );
}
