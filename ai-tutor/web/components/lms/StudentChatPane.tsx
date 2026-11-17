"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, FileText, Loader2, Plus, Save, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useGlobal } from "@/context/GlobalContext";
import { HomeAssistantMessage } from "@/components/chat/HomeAssistantMessage";
import { ComposerBottomToolbar } from "@/components/chat/ComposerBottomToolbar";
import { StudentChatPlusMenu } from "@/components/chat/StudentChatPlusMenu";
import {
  ThinkingShimmerLabel,
  ThinkingTraceList,
} from "@/components/chat/thinking-ui";
import AddToNotebookModal from "@/components/AddToNotebookModal";
import { uploadChatAttachment } from "@/lib/chatAttachmentUpload";
import type { ChatMessageAttachment } from "@/types/chat";

interface StudentChatPaneProps {
  chapterTitle: string;
  subjectLabel?: string;
  onNewChat: () => void;
}

export default function StudentChatPane({
  chapterTitle,
  subjectLabel,
  onNewChat,
}: StudentChatPaneProps) {
  const { t } = useTranslation();
  const { chatState, setChatState, sendChatMessage, stopChatMessage, setToast } =
    useGlobal();
  const [inputMessage, setInputMessage] = useState("");
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showNotebookModal, setShowNotebookModal] = useState(false);
  const [notebookPayload, setNotebookPayload] = useState<{
    title: string;
    userQuery: string;
    output: string;
    messages: Array<{ role: "user" | "assistant"; content: string }>;
  } | null>(null);
  const [notebookSaveLoading, setNotebookSaveLoading] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const plusMenuWrapRef = useRef<HTMLDivElement>(null);
  const plusMenuSearchBarRef = useRef<HTMLDivElement>(null);
  const plusMenuPanelRef = useRef<HTMLDivElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<{ stop: () => void } | null>(null);
  const stopRequestedRef = useRef(false);

  const pending = chatState.pendingAttachments ?? [];

  const openNotebookSave = async () => {
    if (chatState.messages.length === 0) return;
    setNotebookSaveLoading(true);
    try {
      const { fetchChatMessagesForNotebook, buildNotebookChatPayload } =
        await import("@/lib/notebookRecordContent");
      const msgs = await fetchChatMessagesForNotebook(
        chatState.sessionId,
        chatState.messages
          .filter((m) => m.role === "user" || m.role === "assistant")
          .map((m) => ({ role: m.role, content: (m.content ?? "").trim() }))
          .filter((m) => m.content.length > 0),
      );
      setNotebookPayload(buildNotebookChatPayload(msgs, t("Chat Session")));
      setShowNotebookModal(true);
    } catch (err) {
      console.error(err);
    } finally {
      setNotebookSaveLoading(false);
    }
  };

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [chatState.messages, chatState.thinkingTrace]);

  useEffect(() => {
    if (!plusMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        plusMenuWrapRef.current?.contains(target) ||
        plusMenuPanelRef.current?.contains(target)
      ) {
        return;
      }
      setPlusMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [plusMenuOpen]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const handleSend = () => {
    const hasText = Boolean(inputMessage.trim());
    const hasFiles = pending.length > 0;
    if ((!hasText && !hasFiles) || chatState.isLoading) return;
    sendChatMessage(inputMessage);
    setInputMessage("");
  };

  const queueAttachment = async (file: File) => {
    setUploadingAttachment(true);
    try {
      const att = await uploadChatAttachment(file);
      setChatState((prev) => ({
        ...prev,
        pendingAttachments: [...(prev.pendingAttachments ?? []), att],
      }));
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : "Upload failed",
        type: "error",
      });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleFilePick = async (
    e: React.ChangeEvent<HTMLInputElement>,
    expected: ChatMessageAttachment["kind"],
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (expected === "pdf" && ext !== "pdf") {
      setToast({ message: "Please choose a PDF file.", type: "error" });
      return;
    }
    if (
      expected === "image" &&
      !["png", "jpg", "jpeg", "webp", "gif"].includes(ext)
    ) {
      setToast({ message: "Please choose an image file.", type: "error" });
      return;
    }
    await queueAttachment(file);
  };

  const removePending = (index: number) => {
    setChatState((prev) => ({
      ...prev,
      pendingAttachments: (prev.pendingAttachments ?? []).filter(
        (_, i) => i !== index,
      ),
    }));
  };

  const handleVoiceToggle = async () => {
    if (typeof window === "undefined") return;
    if (isListening && recognitionRef.current) {
      stopRequestedRef.current = true;
      recognitionRef.current.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices?.getUserMedia({ audio: true });
      stream?.getTracks().forEach((tr) => tr.stop());
    } catch {
      setToast({
        message: "Microphone permission denied.",
        type: "error",
      });
      return;
    }
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        continuous: boolean;
        onresult: ((e: { resultIndex: number; results: { isFinal: boolean; 0: { transcript: string } }[] }) => void) | null;
        onend: (() => void) | null;
        onerror: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
    };
    const Ctor = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!Ctor) {
      setToast({ message: "Voice input not supported.", type: "error" });
      return;
    }
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i]?.isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      const text = transcript.trim();
      if (text) setInputMessage((prev) => (prev ? `${prev} ${text}` : text));
    };
    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };
    recognition.onerror = () => {
      if (!stopRequestedRef.current) {
        setToast({ message: "Voice capture failed.", type: "error" });
      }
      setIsListening(false);
    };
    stopRequestedRef.current = false;
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  };

  const lastMsg = chatState.messages[chatState.messages.length - 1];
  const showThinkingRow =
    Boolean(
      chatState.enableThinking &&
        chatState.isLoading &&
        lastMsg?.role === "user",
    );

  const topicShort =
    chapterTitle.length > 60 ? `${chapterTitle.slice(0, 57)}…` : chapterTitle;

  const tryAskPills = [
    {
      label: `📘 Explain with colorful notes`,
      prompt: `Explain "${chapterTitle}" with colorful notes, real-life examples, and visual learning blocks.`,
    },
    {
      label: "🧠 Test my understanding",
      prompt: `Test my understanding of "${chapterTitle}" with a quiz.`,
    },
    {
      label: "📝 Exam-ready revision notes",
      prompt: `Create exam-ready revision notes for "${chapterTitle}".`,
    },
    {
      label: "🎯 Competency-based questions",
      prompt: `Ask me NCERT competency-based questions from "${chapterTitle}".`,
    },
    {
      label: "🗺️ Chapter mind map",
      prompt: `Create a detailed mind map for "${chapterTitle}".`,
    },
    {
      label: "⚡ Revise in 5 minutes",
      prompt: `Revise "${chapterTitle}" in 5 minutes with key points.`,
    },
    {
      label: "📊 Diagrams & flowcharts",
      prompt: `Explain "${chapterTitle}" with diagrams and flowcharts.`,
    },
    {
      label: "📚 NCERT textbook questions",
      prompt: `Help me solve NCERT textbook questions from "${chapterTitle}".`,
    },
    {
      label: "🏆 Conduct a chapter test",
      prompt: `Conduct a full chapter test on "${chapterTitle}".`,
    },
    {
      label: "🔍 Explain difficult concepts simply",
      prompt: `Explain the difficult concepts in "${chapterTitle}" in simple language I can easily understand.`,
    },
    {
      label: "📒 Generate smart study notes",
      prompt: `Generate smart study notes for "${chapterTitle}" with key definitions, NCERT highlights, and quick revision points.`,
    },
    {
      label: "🎭 Explain as a story",
      prompt: `Explain "${chapterTitle}" as an engaging story that makes it easy to remember.`,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-background dark:bg-slate-950">
      <input
        ref={pdfInputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => handleFilePick(e, "pdf")}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => handleFilePick(e, "image")}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".doc,.docx,.txt,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
        className="hidden"
        onChange={(e) => handleFilePick(e, "document")}
      />

      <StudentChatPlusMenu
        open={plusMenuOpen}
        alignRef={plusMenuSearchBarRef}
        panelRef={plusMenuPanelRef}
        setChatState={setChatState}
        onCloseMenu={() => setPlusMenuOpen(false)}
        onAttachPdf={() => pdfInputRef.current?.click()}
        onAttachImage={() => imageInputRef.current?.click()}
        onAttachDocument={() => docInputRef.current?.click()}
        onRequestDiagram={() => {
          const prompt = `Explain "${chapterTitle}" with a clear labeled concept diagram (flowchart) I can study step by step.`;
          setInputMessage(prompt);
          inputRef.current?.focus();
        }}
        t={t}
      />

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-slate-700">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-vidya-600 dark:text-vidya-400">
            NCERT chapter chat
            {subjectLabel ? ` · ${subjectLabel}` : ""}
          </p>
          <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
            {chapterTitle}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => void openNotebookSave()}
            disabled={chatState.messages.length === 0 || notebookSaveLoading}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-vidya-50 hover:border-vidya-300 hover:text-vidya-700 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-vidya-900/30 dark:hover:text-vidya-300 transition-colors disabled:opacity-40"
            title={t("Save to Notebook")}
          >
            {notebookSaveLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span className="hidden sm:inline">
              {notebookSaveLoading ? t("Saving") : t("Save")}
            </span>
          </button>
          <button
            type="button"
            onClick={onNewChat}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" />
            Change chapter
          </button>
        </div>
      </div>

      <div
        ref={messagesContainerRef}
        className="min-h-0 flex-1 overflow-y-auto px-2 py-3 sm:px-3 space-y-4"
      >
        {chatState.messages.length === 0 && !chatState.isLoading && (
          <div className="flex flex-col items-center px-2 py-6 text-center">
            <Bot className="mb-2 h-10 w-10 text-vidya-400" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Ask anything about this chapter
            </p>
            <p className="mt-1 text-xs text-slate-500 max-w-sm">
              Interactive diagram canvas, concept audio, related videos, and follow-up suggestions. Pinch or scroll to zoom; drag to pan.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {tryAskPills.map((pill) => (
                <button
                  key={pill.label}
                  type="button"
                  onClick={() => {
                    setInputMessage(pill.prompt);
                    inputRef.current?.focus();
                  }}
                  className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs text-slate-600 hover:border-indigo-300 hover:bg-indigo-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-indigo-600 max-w-[min(100%,18rem)]"
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {chatState.messages.map((msg, idx) =>
          msg.role === "user" ? (
            <div
              key={idx}
              className="flex justify-end animate-in fade-in duration-300"
            >
              <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-vidya-600 px-4 py-2.5 text-sm text-white shadow-sm shadow-vidya-600/20 space-y-2">
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {msg.attachments.map((att, ai) =>
                      att.kind === "image" ? (
                        <a
                          key={ai}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-lg border border-white/20"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={att.url}
                            alt={att.name}
                            className="max-h-32 max-w-full object-cover"
                          />
                        </a>
                      ) : (
                        <a
                          key={ai}
                          href={att.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-xs hover:bg-white/25"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="max-w-[10rem] truncate">{att.name}</span>
                        </a>
                      ),
                    )}
                  </div>
                )}
                {msg.content ? (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <HomeAssistantMessage
              key={idx}
              msg={msg}
              msgIndex={idx}
              chatState={chatState}
              messages={chatState.messages}
              compact
              onPickFollowUp={(prompt) => {
                setInputMessage(prompt);
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
            />
          ),
        )}

        {showThinkingRow && (
          <div className="flex gap-2.5 pl-1">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-vidya-500 to-vidya-700">
              <Bot className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="rounded-2xl bg-slate-700 dark:bg-slate-800 px-4 py-3 border border-slate-600/40 max-w-[90%]">
              {chatState.thinkingTrace.length > 0 ? (
                <ThinkingTraceList steps={chatState.thinkingTrace} t={t} />
              ) : (
                <ThinkingShimmerLabel text={t("Thinking")} />
              )}
            </div>
          </div>
        )}

        {chatState.isLoading && chatState.currentStage && !showThinkingRow && (
          <div className="flex items-center gap-2 px-2 text-xs text-vidya-600 dark:text-vidya-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>
              {chatState.currentStage === "rag"
                ? "Checking NCERT knowledge…"
                : chatState.currentStage === "generating"
                  ? "Writing answer…"
                  : `Working…`}
            </span>
          </div>
        )}
      </div>

      <div
        className="shrink-0 border-t border-border bg-background dark:bg-slate-900 p-2.5"
        ref={plusMenuWrapRef}
      >
        {(chatState.enableThinking || chatState.enableGeneral || chatState.enableRag) && (
          <div className="mb-2 flex flex-wrap gap-1.5 px-0.5">
            {chatState.enableThinking && (
              <span className="rounded-full bg-sky-50 px-2.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
                {t("Think")}
              </span>
            )}
            {chatState.enableGeneral && (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                {t("General")}
              </span>
            )}
            {chatState.enableRag && !chatState.enableGeneral && (
              <span className="rounded-full bg-vidya-50 px-2.5 py-0.5 text-[10px] font-medium text-vidya-700 dark:bg-vidya-900/40 dark:text-vidya-300">
                NCERT RAG
              </span>
            )}
          </div>
        )}
        {(pending.length > 0 || uploadingAttachment) && (
          <div className="mb-2 flex flex-wrap gap-2 px-0.5">
            {pending.map((att, i) => (
              <span
                key={`${att.url}-${i}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
              >
                {att.kind === "image" ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={att.url}
                    alt=""
                    className="h-6 w-6 rounded object-cover"
                  />
                ) : (
                  <FileText className="h-3.5 w-3.5 shrink-0 text-indigo-500" />
                )}
                <span className="max-w-[8rem] truncate">{att.name}</span>
                <button
                  type="button"
                  onClick={() => removePending(i)}
                  className="rounded p-0.5 hover:bg-slate-100 dark:hover:bg-slate-700"
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {uploadingAttachment && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Uploading…
              </span>
            )}
          </div>
        )}

        <div
          ref={plusMenuSearchBarRef}
          className="rounded-2xl border border-border bg-muted/40 dark:bg-slate-900"
        >
          <textarea
            ref={inputRef}
            rows={2}
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask about this chapter… (Shift+Enter for new line)"
            disabled={chatState.isLoading}
            className="w-full resize-none border-0 bg-transparent px-3 pt-2.5 pb-1 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-slate-100"
          />
          <ComposerBottomToolbar
            variant="student"
            plusMenuOpen={plusMenuOpen}
            setPlusMenuOpen={setPlusMenuOpen}
            enableThinking={chatState.enableThinking}
            onClearThinking={() =>
              setChatState((prev) => ({ ...prev, enableThinking: false }))
            }
            enableGeneral={chatState.enableGeneral}
            onClearGeneral={() =>
              setChatState((prev) => ({
                ...prev,
                enableGeneral: false,
                enableRag: true,
              }))
            }
            handleVoiceToggle={handleVoiceToggle}
            isListening={isListening}
            onSend={handleSend}
            onStop={stopChatMessage}
            sendDisabled={
              chatState.isLoading ||
              uploadingAttachment ||
              (!inputMessage.trim() && pending.length === 0)
            }
            isLoading={chatState.isLoading}
            t={t}
          />
        </div>
      </div>
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
