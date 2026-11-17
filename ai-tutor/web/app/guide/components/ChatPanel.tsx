"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import { MessageSquare, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useTranslation } from "react-i18next";
import { processLatexContent } from "@/lib/latex";
import type { ChatMessage, KnowledgePoint, StepQuizScore } from "../types";
import {
  GuideOutlineStepList,
  isStartingLearnKnowledgeMessage,
  type SessionOutlineStatus,
} from "./GuideOutlinePanel";
import ConceptSummary from "@/components/ConceptSummary";

const SHORT_SYSTEM_MAX = 280;

/** Merge consecutive short system status lines into one bubble to reduce chat clutter. */
function mergeShortSystemMessages(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  let buf: ChatMessage[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    if (buf.length === 1) {
      out.push(buf[0]!);
    } else {
      const combined = buf
        .map((m) => m.content.trim())
        .filter(Boolean)
        .join("\n\n• ");
      out.push({
        id: `guide-sys-merge-${buf[0]!.id}`,
        role: "system",
        content: `• ${combined}`,
        timestamp: buf[buf.length - 1]!.timestamp,
      });
    }
    buf = [];
  };

  const isShortSystem = (m: ChatMessage) =>
    m.role === "system" && !m.content.includes("⏳") && m.content.length <= SHORT_SYSTEM_MAX;

  for (const m of messages) {
    if (isShortSystem(m)) {
      buf.push(m);
    } else {
      flush();
      out.push(m);
    }
  }
  flush();
  return out;
}

/** Routine next/back navigation crumbs from the guide API — redundant with outline + lesson. */
function isGuideNavNoiseSystemMessage(m: ChatMessage): boolean {
  if (m.role !== "system") return false;
  const c = m.content;
  return (
    /←\s*Back to knowledge point/i.test(c) ||
    /↪\s*Returning to knowledge point/i.test(c)
  );
}

interface ChatPanelProps {
  messages: ChatMessage[];
  isLearning: boolean;
  onSendMessage: (message: string) => void;
  /** Nested inside merged path+assistant card — no outer chrome or title row */
  variant?: "card" | "integrated";
  /** Live step list inside the latest “Starting to learn knowledge point…” system bubble */
  inlineOutline?: {
    knowledgePoints: KnowledgePoint[];
    currentIndex: number;
    status: SessionOutlineStatus;
    attemptedQuizSteps: ReadonlySet<number>;
    scoresByStep: Record<number, StepQuizScore>;
  };
}

export default function ChatPanel({
  messages,
  isLearning,
  onSendMessage,
  variant = "card",
  inlineOutline,
}: ChatPanelProps) {
  const { t, i18n } = useTranslation();
  const [inputMessage, setInputMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const displayMessages = useMemo(() => {
    const withoutNav = messages.filter((m) => !isGuideNavNoiseSystemMessage(m));
    return mergeShortSystemMessages(withoutNav);
  }, [messages]);

  const lastStartingLearnOutlineIdx = useMemo(() => {
    let last = -1;
    displayMessages.forEach((m, i) => {
      if (m.role === "system" && isStartingLearnKnowledgeMessage(m.content)) {
        last = i;
      }
    });
    return last;
  }, [displayMessages]);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [displayMessages]);

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || sendingMessage) return;

    setSendingMessage(true);
    const message = inputMessage;
    setInputMessage("");

    try {
      await onSendMessage(message);
    } finally {
      setSendingMessage(false);
    }
  };

  // Table components for ReactMarkdown
  const tableComponents = {
    table: ({ node, ...props }: any) => (
      <div className="overflow-x-auto my-4 rounded-lg border border-slate-200 shadow-sm">
        <table
          className="min-w-full divide-y divide-slate-200 text-sm"
          {...props}
        />
      </div>
    ),
    thead: ({ node, ...props }: any) => (
      <thead className="bg-slate-50" {...props} />
    ),
    th: ({ node, ...props }: any) => (
      <th
        className="px-3 py-2 text-left font-semibold text-slate-700 whitespace-nowrap border-b border-slate-200"
        {...props}
      />
    ),
    tbody: ({ node, ...props }: any) => (
      <tbody className="divide-y divide-slate-100 bg-white" {...props} />
    ),
    td: ({ node, ...props }: any) => (
      <td
        className="px-3 py-2 text-slate-600 border-b border-slate-100"
        {...props}
      />
    ),
    tr: ({ node, ...props }: any) => (
      <tr className="hover:bg-slate-50/50 transition-colors" {...props} />
    ),
  };

  const isIntegrated = variant === "integrated";

  /** Full-width bubbles inside the merged path+assistant rail so cards align edge-to-edge. */
  const integratedWideShell =
    "w-full max-w-full min-w-0 rounded-2xl px-4 py-3 text-sm";

  return (
    <div
      className={
        isIntegrated
          ? "flex flex-col flex-1 min-h-0 overflow-hidden bg-transparent"
          : "flex-1 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden"
      }
    >
      {!isIntegrated && (
        <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
          <MessageSquare className="w-4 h-4" />
          {t("Learning Assistant")}
        </div>
      )}

      <div
        ref={chatContainerRef}
        className={`flex-1 min-h-0 overflow-y-auto bg-slate-50/30 dark:bg-slate-800/30 ${isIntegrated ? "px-2 pt-2 pb-3" : "p-4"} space-y-4`}
      >
        {displayMessages.map((msg, idx) => {
          const showInlineOutline =
            inlineOutline &&
            inlineOutline.knowledgePoints.length > 0 &&
            msg.role === "system" &&
            isStartingLearnKnowledgeMessage(msg.content) &&
            idx === lastStartingLearnOutlineIdx;

          const loadingOutlineChrome =
            isIntegrated &&
            msg.role === "system" &&
            msg.content.includes("⏳");

          const useIntegratedWideShell =
            !loadingOutlineChrome &&
            (showInlineOutline ||
              (isIntegrated &&
                (msg.role === "system" || msg.role === "assistant")));

          const bubbleShell = loadingOutlineChrome
            ? "w-full max-w-full min-w-0 rounded-xl border px-2.5 py-2 text-sm border-indigo-300 dark:border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 text-slate-800 dark:text-slate-100"
            : useIntegratedWideShell
              ? integratedWideShell
              : "max-w-[90%] min-w-0 w-full sm:max-w-[min(90%,42rem)] rounded-2xl px-4 py-3 text-sm";

          const bubbleTone =
            msg.role === "user"
              ? "bg-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-500/20"
              : loadingOutlineChrome
                ? ""
                : msg.role === "system" && msg.content.includes("⏳")
                  ? "bg-amber-50 border border-amber-200 text-amber-900 rounded-tl-none"
                  : msg.role === "system"
                    ? "bg-blue-50 border border-blue-200 text-blue-900 rounded-tl-none"
                    : "bg-white border border-slate-200 text-slate-700 rounded-tl-none shadow-sm";

          return (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <div className={`${bubbleShell} ${bubbleTone}`}>
              {msg.role === "system" || msg.role === "assistant" ? (
                showInlineOutline ? (
                  <div className="min-w-0 space-y-3">
                    <p className="text-sm font-semibold text-blue-950 dark:text-blue-100 m-0 leading-snug">
                      {t("guide.inline_outline.title")}
                    </p>
                    <GuideOutlineStepList
                      knowledgePoints={inlineOutline.knowledgePoints}
                      currentIndex={inlineOutline.currentIndex}
                      status={inlineOutline.status}
                      attemptedQuizSteps={inlineOutline.attemptedQuizSteps}
                      scoresByStep={inlineOutline.scoresByStep}
                    />
                  </div>
                ) : loadingOutlineChrome ? (
                  <div className="flex gap-2 items-start min-w-0">
                    <span className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900">
                      <Loader2
                        className="w-4 h-4 animate-spin text-indigo-500 dark:text-indigo-400 shrink-0"
                        aria-hidden
                      />
                    </span>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p className="text-xs font-medium text-slate-800 dark:text-slate-100 leading-snug m-0">
                        {msg.content.replace(/⏳\s*/u, "").trim()}
                      </p>
                    </div>
                  </div>
                ) : (
                <div className="prose prose-sm max-w-none min-w-0 prose-slate">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={tableComponents}
                  >
                    {processLatexContent(msg.content)}
                  </ReactMarkdown>

                  {/* Concept Summary — only for substantive assistant answers (skip short system status lines) */}
                  {msg.role === "assistant" && msg.content?.length > 60 && (
                    <ConceptSummary
                      text={msg.content}
                      query={
                        displayMessages
                          .slice(0, idx)
                          .reverse()
                          .find((m) => m.role === "user")?.content
                      }
                      uiLanguage={i18n.language}
                    />
                  )}

                  {/* Concept Image */}
                  {msg.imageUrl && (
                    <div className="mt-3 w-full min-w-0 rounded-xl border border-slate-200 dark:border-slate-600 overflow-hidden bg-slate-50 dark:bg-slate-900/50 shadow-sm">
                      <div className="w-full min-w-0 flex justify-center items-center p-3 sm:p-4 bg-slate-100/90 dark:bg-slate-900/40">
                        <img
                          src={msg.imageUrl}
                          alt={msg.imageTitle || "Concept image"}
                          className="block max-w-full w-auto h-auto max-h-[min(58vh,640px)] object-contain mx-auto rounded-md"
                          loading="lazy"
                        />
                      </div>
                      <div className="px-3 py-1.5 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm border-t border-slate-100 dark:border-slate-700">
                        <div className="truncate pr-2">
                          <span className="font-semibold text-slate-600 dark:text-slate-400 mr-1">Concept:</span>
                          {msg.imageTitle}
                        </div>
                        {msg.imageSourceUrl && (
                          <a
                            href={msg.imageSourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 font-medium"
                          >
                            Source
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                )
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
          );
        })}
      </div>

      {/* Input Area */}
      {isLearning && (
        <div className="p-3 bg-white dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700 shrink-0">
          <div className="relative flex items-center gap-2">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !e.shiftKey && handleSendMessage()
              }
              placeholder={t("Have any questions? Feel free to ask...")}
              disabled={sendingMessage}
              className="flex-1 pl-4 pr-10 py-2.5 bg-slate-100 dark:bg-slate-700 border-transparent focus:bg-white dark:focus:bg-slate-600 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || sendingMessage}
              className="p-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
            >
              {sendingMessage ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
