"use client";

import { Children, type ReactElement } from "react";
import {
  BookOpen,
  Bot,
  ExternalLink,
  Globe,
  Lightbulb,
  Loader2,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { useTranslation } from "react-i18next";
import AvatarNarrator from "@/components/AvatarNarrator";
import ConceptSummary from "@/components/ConceptSummary";
import { ChatSourceVideos } from "@/components/ChatSourceVideos";
import { ChatDiagramCanvas } from "@/components/chat/ChatDiagramCanvas";
import { HomeRelatedDiagram } from "@/components/HomeRelatedDiagram";
import { HomeYoutubeSuggestions } from "@/components/HomeYoutubeSuggestions";
import { deriveHomeYoutubeTopic } from "@/lib/homeYoutubeTopic";
import { processLatexContent } from "@/lib/latex";
import { extractMermaidBlocksFromMarkdown } from "@/lib/mermaidUtils";
import type { ChatState, HomeChatMessage } from "@/types/chat";
import { ThinkingShimmerLabel, ThinkingTraceList } from "./thinking-ui";
import { apiUrl } from "@/lib/api";

export interface HomeAssistantMessageProps {
  msg: HomeChatMessage;
  msgIndex: number;
  chatState: ChatState;
  messages: HomeChatMessage[];
  onPickFollowUp?: (prompt: string) => void;
  compact?: boolean;
  showConceptSummary?: boolean;
  showRelatedYoutube?: boolean;
}

export function HomeAssistantMessage({
  msg,
  msgIndex,
  chatState,
  messages,
  onPickFollowUp,
  compact = false,
  showConceptSummary = true,
  showRelatedYoutube = true,
}: HomeAssistantMessageProps) {
  const { t, i18n } = useTranslation();

  const pairedUser =
    messages
      .slice(0, msgIndex)
      .reverse()
      .find((m) => m.role === "user")?.content ?? "";

  const ragBlob =
    msg.sources?.rag
      ?.map((r) => r.content)
      .filter(Boolean)
      .join("\n\n") ?? "";

  const inlineMermaidBlocks = extractMermaidBlocksFromMarkdown(
    msg.content || "",
  );

  const youtubeTopic = deriveHomeYoutubeTopic({
    userMessage: pairedUser,
    assistantContent: msg.content,
    pdfUrl: chatState.selectedPdfUrl,
    ragSnippet: ragBlob || undefined,
    imageTitle: msg.imageTitle,
    selectedSourceTitle: chatState.selectedPdfTopicLabel?.trim() || undefined,
  });

  const proseClass = compact
    ? "prose prose-sm prose-slate dark:prose-invert max-w-none min-w-0"
    : "prose prose-slate dark:prose-invert max-w-none min-w-0 leading-relaxed";

  return (
    <>
      <div
        className={`flex gap-2.5 sm:gap-4 w-full ${compact ? "" : "max-w-4xl mx-auto"} animate-in fade-in slide-in-from-bottom-2 duration-500`}
      >
        <div
          className={`${compact ? "h-7 w-7" : "h-8 w-8"} mt-1 rounded-full bg-gradient-to-br from-vidya-500 to-vidya-700 flex items-center justify-center shrink-0 shadow-sm shadow-vidya-600/20`}
        >
          <Bot className={`${compact ? "h-3.5 w-3.5" : "h-4 w-4"} text-white`} />
        </div>
        <div className="flex-1 min-w-0 max-w-[95%] space-y-3">
          <div
            className={
              msg.isThinking
                ? `relative bg-card dark:bg-slate-900 ${compact ? "px-4 py-3" : "px-6 py-5"} rounded-3xl rounded-tl-[4px] border border-amber-200/70 dark:border-amber-500/20 shadow-sm text-foreground min-w-0 border-l-4 border-l-amber-400`
                : `bg-card dark:bg-slate-800 ${compact ? "px-4 py-3" : "px-6 py-5"} rounded-3xl rounded-tl-[4px] border border-vidya-100 dark:border-vidya-500/20 shadow-sm text-foreground min-w-0`
            }
          >
            {msg.isThinking && !msg.isStreaming && msg.content?.trim() && (
              <div className="flex items-center gap-1.5 mb-3 pb-2 border-b border-amber-200/60 dark:border-amber-500/20">
                <Lightbulb className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                <span className="text-[11px] font-semibold uppercase tracking-widest text-amber-600 dark:text-amber-400">
                  {t("thinking.tutor.badge")}
                </span>
              </div>
            )}

            {msg.isStreaming &&
            !msg.content?.trim() &&
            chatState.enableThinking ? (
              <div className="rounded-2xl bg-slate-700 dark:bg-slate-800 px-4 py-3 border border-slate-600/40">
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
              <div className={proseClass}>
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    img: ({ src, alt, ...props }) => {
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
                    code: ({ className, children, ...props }) => {
                      const lang = /language-(\w+)/.exec(className || "")?.[1];
                      const raw = String(children).replace(/\n$/, "");
                      if (lang === "mermaid" && raw.trim()) {
                        return (
                          <ChatDiagramCanvas
                            chart={raw.trim()}
                            titleFallback={t("home.relatedDiagram.title")}
                            compact={compact}
                          />
                        );
                      }
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                    pre: ({ children, ...props }) => {
                      const child = Children.toArray(children)[0] as
                        | ReactElement<{ className?: string }>
                        | undefined;
                      if (child?.props?.className?.includes("language-mermaid")) {
                        return <>{children}</>;
                      }
                      return <pre {...props}>{children}</pre>;
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
                    compact={compact}
                  />
                ) : null}

                {inlineMermaidBlocks
                  .filter(
                    (block) =>
                      block.trim() !==
                      (msg.relatedDiagramMermaid || "").trim(),
                  )
                  .map((block, i) => (
                    <ChatDiagramCanvas
                      key={`inline-mer-${i}`}
                      chart={block}
                      titleFallback={t("home.relatedDiagram.title")}
                      compact={compact}
                    />
                  ))}

                {msg.webImages && msg.webImages.length > 0 && (
                  <div className="mt-4 space-y-2 not-prose">
                    <p className="font-semibold text-sm text-slate-600 dark:text-slate-400 flex items-center gap-2">
                      <Globe className="w-4 h-4 text-emerald-500" />
                      {t("home.relatedVisuals.title")}
                    </p>
                    <div className="grid grid-cols-1 gap-3">
                      {msg.webImages.map((img, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900"
                        >
                          <div className="flex justify-center p-2 bg-slate-50 dark:bg-slate-800 min-h-[120px]">
                            <img
                              src={img.url}
                              alt={img.title}
                              className="max-h-[180px] object-contain cursor-zoom-in"
                              loading="lazy"
                              onClick={() => window.open(img.url, "_blank")}
                              onError={(e) => {
                                e.currentTarget
                                  .closest(".rounded-xl")
                                  ?.classList.add("hidden");
                              }}
                            />
                          </div>
                          <div className="px-2 py-1.5 text-[11px] text-slate-500 flex justify-between gap-2 border-t border-slate-100 dark:border-slate-800">
                            <span className="truncate">{img.title}</span>
                            {img.source_url && (
                              <a
                                href={img.source_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-500 shrink-0"
                              >
                                <ExternalLink className="w-3 h-3" />
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

            {msg.imageUrl && (
              <div className="mt-4 w-full rounded-2xl border border-slate-200 dark:border-slate-600 overflow-hidden not-prose">
                <div className="flex justify-center p-3 bg-slate-50 dark:bg-slate-900/40">
                  <img
                    src={msg.imageUrl}
                    alt={msg.imageTitle || "Concept"}
                    className="max-w-full max-h-[min(40vh,400px)] object-contain rounded-md"
                    loading="lazy"
                  />
                </div>
                {msg.imageTitle && (
                  <div className="px-3 py-1.5 text-[10px] text-slate-500 border-t border-slate-100 dark:border-slate-700 truncate">
                    {msg.imageTitle}
                  </div>
                )}
              </div>
            )}

            {msg.isStreaming &&
              (msg.content?.trim() || !chatState.enableThinking) && (
                <div className="flex items-center gap-2 mt-2 text-vidya-600 dark:text-vidya-400 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              )}

            {msg.sources &&
              ((msg.sources.rag?.length ?? 0) +
                (msg.sources.web?.length ?? 0) +
                (msg.sources.videos?.length ?? 0) >
                0) && (
                <div className="space-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50 not-prose">
                  {msg.sources.videos && msg.sources.videos.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                        {t("Videos")}
                      </p>
                      <ChatSourceVideos videos={msg.sources.videos} max={5} />
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {msg.sources.rag?.map((source, i) => (
                      <div
                        key={`rag-${i}`}
                        className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs"
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
                        className="flex items-center gap-1 px-2 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 rounded-lg text-xs max-w-[200px] truncate"
                      >
                        <Globe className="w-3 h-3 shrink-0" />
                        <span className="truncate">
                          {source.title || source.url}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              )}

            {!msg.isStreaming && msg.content?.length > 20 && (
              <AvatarNarrator text={msg.content} language="en" />
            )}

            {showConceptSummary &&
              !msg.isStreaming &&
              msg.content?.length > 20 && (
                <ConceptSummary
                  text={msg.content}
                  query={pairedUser || undefined}
                  uiLanguage={i18n.language}
                />
              )}

            {showRelatedYoutube &&
              !msg.isStreaming &&
              msg.content?.length > 20 &&
              onPickFollowUp && (
                <HomeYoutubeSuggestions
                  topicQuery={youtubeTopic}
                  uiLanguage={i18n.language}
                  onPickPrompt={onPickFollowUp}
                />
              )}
          </div>
        </div>
      </div>
    </>
  );
}
