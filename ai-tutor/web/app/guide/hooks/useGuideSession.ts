import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { apiUrl } from "@/lib/api";
import {
  SessionState,
  ChatMessage,
  KnowledgePoint,
  SelectedRecord,
  StepQuizQuestion,
  INITIAL_SESSION_STATE,
} from "../types";
import {
  loadFromStorage,
  saveToStorage,
  persistState,
  mergeWithDefaults,
  STORAGE_KEYS,
  EXCLUDE_FIELDS,
} from "@/lib/persistence";
import { debounce } from "@/lib/debounce";

// Storage key for guide chat messages
const GUIDE_CHAT_KEY = "guide_chat_messages";

// Fields to exclude from guide session persistence
const GUIDE_SESSION_EXCLUDE: (keyof SessionState)[] = [];

/**
 * Hook for managing guide session state and API interactions
 */
export function useGuideSession() {
  type GuideLoadingAction = "start" | "next" | "prev" | null;
  // Track hydration to avoid SSR mismatch
  const isHydrated = useRef(false);

  // Initialize with defaults (same on server and client)
  const [sessionState, setSessionState] = useState<SessionState>(
    INITIAL_SESSION_STATE,
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [stepQuizQuestions, setStepQuizQuestions] = useState<StepQuizQuestion[]>([]);
  const [stepQuizEncouragement, setStepQuizEncouragement] = useState("");
  const [stepQuizLoading, setStepQuizLoading] = useState(false);
  const [stepQuizError, setStepQuizError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<GuideLoadingAction>(null);
  const [loadingMessage, setLoadingMessage] = useState("");

  /** Monotonic id so overlapping step_quiz HTTP responses cannot overwrite the wrong step. */
  const stepQuizFetchSeq = useRef(0);

  // Debounced save functions
  const saveSessionState = useMemo(
    () =>
      debounce((state: SessionState) => {
        const toSave = persistState(state, GUIDE_SESSION_EXCLUDE);
        saveToStorage(STORAGE_KEYS.GUIDE_SESSION, toSave);
      }, 500),
    [],
  );

  const saveChatMessages = useMemo(
    () =>
      debounce((messages: ChatMessage[]) => {
        saveToStorage(GUIDE_CHAT_KEY, messages);
      }, 500),
    [],
  );

  // Restore persisted state after hydration
  useEffect(() => {
    if (typeof window === "undefined") return;

    const persistedSession = loadFromStorage<Partial<SessionState>>(
      STORAGE_KEYS.GUIDE_SESSION,
      {},
    );
    const persistedChat = loadFromStorage<ChatMessage[]>(GUIDE_CHAT_KEY, []);

    if (Object.keys(persistedSession).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration restore
      setSessionState((prev) =>
        mergeWithDefaults(persistedSession, prev, GUIDE_SESSION_EXCLUDE),
      );
    }

    if (persistedChat.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration restore
      setChatMessages(persistedChat);
    }

    isHydrated.current = true;
  }, []);

  // Auto-save session state (only after hydration)
  useEffect(() => {
    if (isHydrated.current) {
      saveSessionState(sessionState);
    }
  }, [sessionState, saveSessionState]);

  // Auto-save chat messages (only after hydration)
  useEffect(() => {
    if (isHydrated.current) {
      saveChatMessages(chatMessages);
    }
  }, [chatMessages, saveChatMessages]);

  const addLoadingMessage = useCallback((message: string) => {
    const loadingMsg: ChatMessage = {
      id: `loading-${Date.now()}`,
      role: "system",
      content: `⏳ ${message}`,
      timestamp: Date.now(),
    };
    setChatMessages((prev) => [...prev, loadingMsg]);
    return loadingMsg.id;
  }, []);

  const removeLoadingMessage = useCallback((id: string) => {
    setChatMessages((prev) => prev.filter((msg) => msg.id !== id));
  }, []);

  const addChatMessage = useCallback(
    (
      role: "user" | "assistant" | "system",
      content: string,
      id?: string,
      imageInfo?: {
        url: string;
        title: string;
        description?: string;
        source_url?: string;
      },
    ) => {
      setChatMessages((prev) => [
        ...prev,
        {
          id: id || `${role}-${Date.now()}`,
          role,
          content,
          timestamp: Date.now(),
          imageUrl: imageInfo?.url,
          imageTitle: imageInfo?.title,
          imageDescription: imageInfo?.description,
          imageSourceUrl: imageInfo?.source_url,
        },
      ]);
    },
    [],
  );

  const clearStepQuiz = useCallback(() => {
    stepQuizFetchSeq.current += 1;
    setStepQuizQuestions([]);
    setStepQuizEncouragement("");
    setStepQuizError(null);
    setStepQuizLoading(false);
  }, []);

  /** Invalidate in-flight quiz fetch and clear UI before `current_index` changes (no duplicate HTTP — effect loads quiz). */
  const primeStepQuizForKnowledgeChange = useCallback(() => {
    stepQuizFetchSeq.current += 1;
    setStepQuizQuestions([]);
    setStepQuizEncouragement("");
    setStepQuizError(null);
    setStepQuizLoading(true);
  }, []);

  const fetchStepQuiz = useCallback(async (sessionId: string) => {
    if (!sessionId) return;
    const requestId = ++stepQuizFetchSeq.current;
    setStepQuizQuestions([]);
    setStepQuizEncouragement("");
    setStepQuizError(null);
    setStepQuizLoading(true);
    try {
      const res = await fetch(apiUrl("/api/v1/guide/step_quiz"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      });
      const data = await res.json();
      if (requestId !== stepQuizFetchSeq.current) return;
      if (res.ok && data.success) {
        setStepQuizQuestions((data.items || []) as StepQuizQuestion[]);
        setStepQuizEncouragement(
          String(data.encouragement || "Nice, go ahead."),
        );
      } else {
        setStepQuizQuestions([]);
        setStepQuizEncouragement("");
        setStepQuizError(
          String(data.error || data.detail || "Failed to generate quiz"),
        );
      }
    } catch (err) {
      if (requestId !== stepQuizFetchSeq.current) return;
      console.error("Failed to fetch step quiz:", err);
      setStepQuizQuestions([]);
      setStepQuizEncouragement("");
      setStepQuizError("Failed to generate quiz");
    } finally {
      if (requestId === stepQuizFetchSeq.current) {
        setStepQuizLoading(false);
      }
    }
  }, []);

  // After refresh/hydration, restore quiz for current learning step.
  useEffect(() => {
    if (!isHydrated.current) return;
    if (sessionState.status !== "learning") return;
    if (!sessionState.session_id) return;
    void fetchStepQuiz(sessionState.session_id);
  }, [
    sessionState.status,
    sessionState.session_id,
    sessionState.current_index,
    fetchStepQuiz,
  ]);

  const createSession = useCallback(
    async (selectedRecords: Map<string, SelectedRecord>) => {
      if (selectedRecords.size === 0) return;

      setIsLoading(true);
      setLoadingAction(null);
      setLoadingMessage("Analyzing notes and generating learning plan...");
      const loadingId = addLoadingMessage(
        "Analyzing notes and generating learning plan...",
      );

      try {
        const recordsArray = Array.from(selectedRecords.values()).map((r) => ({
          id: r.id,
          title: r.title,
          user_query: r.user_query,
          output: r.output,
          type: r.type,
        }));

        const res = await fetch(apiUrl("/api/v1/guide/create_session"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ records: recordsArray }),
        });
        const data = await res.json();

        removeLoadingMessage(loadingId);
        setIsLoading(false);
        setLoadingAction(null);
        setLoadingMessage("");

        if (data.success) {
          const notebookNames = Array.from(
            new Set(
              Array.from(selectedRecords.values()).map((r) => r.notebookName),
            ),
          );
          const notebookName =
            notebookNames.length === 1
              ? notebookNames[0]
              : `Cross-Notebook (${notebookNames.length} notebooks, ${selectedRecords.size} records)`;

          setSessionState({
            session_id: data.session_id,
            notebook_id: "cross_notebook",
            notebook_name: notebookName,
            knowledge_points: data.knowledge_points || [],
            current_index: -1,
            current_html: "",
            status: "initialized",
            progress: 0,
            summary: "",
          });
          clearStepQuiz();

          const planMessage = `📚 Learning plan generated with **${data.total_points}** knowledge points:\n\n${data.knowledge_points.map((kp: KnowledgePoint, idx: number) => `${idx + 1}. ${kp.knowledge_title}`).join("\n")}\n\nClick "Start Learning" button above to begin!`;
          setChatMessages([
            {
              id: "plan",
              role: "system",
              content: planMessage,
              timestamp: Date.now(),
            },
          ]);
        } else {
          addChatMessage(
            "system",
            `❌ Failed to create session: ${data.error}`,
            `error-${Date.now()}`,
          );
        }
      } catch (err) {
        removeLoadingMessage(loadingId);
        setIsLoading(false);
        setLoadingAction(null);
        setLoadingMessage("");
        console.error("Failed to create session:", err);
        addChatMessage(
          "system",
          "❌ Failed to create session, please try again later",
          `error-${Date.now()}`,
        );
      }
    },
    [addLoadingMessage, removeLoadingMessage, addChatMessage, clearStepQuiz],
  );

  const createSessionFromNcert = useCallback(
    async (opts: { pdfUrl: string; chapterTitle: string }) => {
      const pdfUrl = (opts.pdfUrl || "").trim();
      if (!pdfUrl) return;

      setIsLoading(true);
      setLoadingAction(null);
      setLoadingMessage("Reading NCERT chapter and generating learning plan...");
      const loadingId = addLoadingMessage(
        "Reading NCERT chapter and generating learning plan...",
      );

      try {
        const res = await fetch(apiUrl("/api/v1/guide/create_session"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ncert_pdf_url: pdfUrl,
            ncert_chapter_title: opts.chapterTitle || undefined,
          }),
        });
        const data = await res.json();

        removeLoadingMessage(loadingId);
        setIsLoading(false);
        setLoadingAction(null);
        setLoadingMessage("");

        const detailRaw = data.detail;
        const detailStr =
          typeof detailRaw === "string"
            ? detailRaw
            : Array.isArray(detailRaw)
              ? detailRaw
                  .map((d: { msg?: string }) =>
                    d && typeof d === "object" && "msg" in d
                      ? String(d.msg)
                      : "",
                  )
                  .filter(Boolean)
                  .join("; ")
              : "";

        const titlePart =
          (opts.chapterTitle || "").trim() ||
          pdfUrl.split("/").pop()?.split("?")[0] ||
          "chapter";
        const displayName = `NCERT — ${titlePart}`;

        if (res.ok && data.success) {
          setSessionState({
            session_id: data.session_id,
            notebook_id: "ncert_pdf",
            notebook_name: displayName,
            knowledge_points: data.knowledge_points || [],
            current_index: -1,
            current_html: "",
            status: "initialized",
            progress: 0,
            summary: "",
          });
          clearStepQuiz();

          const planMessage = `📚 Learning plan generated with **${data.total_points}** knowledge points:\n\n${data.knowledge_points.map((kp: KnowledgePoint, idx: number) => `${idx + 1}. ${kp.knowledge_title}`).join("\n")}\n\nClick "Start Learning" button above to begin!`;
          setChatMessages([
            {
              id: "plan",
              role: "system",
              content: planMessage,
              timestamp: Date.now(),
            },
          ]);
        } else {
          const errText =
            data.error ||
            detailStr ||
            (!res.ok ? `Request failed (${res.status})` : "Unknown error");
          addChatMessage(
            "system",
            `❌ Failed to create session: ${errText}`,
            `error-${Date.now()}`,
          );
        }
      } catch (err) {
        removeLoadingMessage(loadingId);
        setIsLoading(false);
        setLoadingAction(null);
        setLoadingMessage("");
        console.error("Failed to create NCERT session:", err);
        addChatMessage(
          "system",
          "❌ Failed to create session, please try again later",
          `error-${Date.now()}`,
        );
      }
    },
    [addLoadingMessage, removeLoadingMessage, addChatMessage, clearStepQuiz],
  );

  const startLearning = useCallback(async () => {
    if (!sessionState.session_id) return;

    setIsLoading(true);
    setLoadingAction("start");
    setLoadingMessage("Generating interactive learning page...");
    const loadingId = addLoadingMessage(
      "Generating interactive learning page...",
    );

    try {
      const res = await fetch(apiUrl("/api/v1/guide/start"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionState.session_id }),
      });
      const data = await res.json();

      removeLoadingMessage(loadingId);
      setIsLoading(false);
      setLoadingAction(null);
      setLoadingMessage("");

      if (data.success) {
        const htmlContent = data.html || "";
        console.log("Start learning - HTML length:", htmlContent.length);

        primeStepQuizForKnowledgeChange();
        setSessionState((prev) => ({
          ...prev,
          current_index: data.current_index,
          current_html: htmlContent,
          status: "learning",
          progress: data.progress || 0,
          current_image: data.image,
        }));

        addChatMessage(
          "system",
          data.message || "Starting the first knowledge point",
          `start-${Date.now()}`,
        );
      } else {
        addChatMessage(
          "system",
          `❌ Failed to start learning: ${data.error || "Unknown error"}`,
          `error-${Date.now()}`,
        );
      }
    } catch (err) {
      removeLoadingMessage(loadingId);
      setIsLoading(false);
      setLoadingAction(null);
      setLoadingMessage("");
      console.error("Failed to start learning:", err);
      addChatMessage(
        "system",
        "❌ Failed to start learning, please try again later",
        `error-${Date.now()}`,
      );
    }
  }, [
    sessionState.session_id,
    addLoadingMessage,
    removeLoadingMessage,
    addChatMessage,
    primeStepQuizForKnowledgeChange,
  ]);

  const nextKnowledge = useCallback(async () => {
    if (!sessionState.session_id) return;

    setIsLoading(true);
    setLoadingAction("next");
    setLoadingMessage("Generating next knowledge point...");
    const loadingId = addLoadingMessage("Generating next knowledge point...");

    try {
      const res = await fetch(apiUrl("/api/v1/guide/next"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionState.session_id }),
      });
      const data = await res.json();

      removeLoadingMessage(loadingId);
      setIsLoading(false);
      setLoadingAction(null);
      setLoadingMessage("");

      if (data.success) {
        if (data.status === "completed") {
          setSessionState((prev) => ({
            ...prev,
            status: "completed",
            summary: data.summary || "",
            progress: 100,
          }));
          clearStepQuiz();

          addChatMessage(
            "system",
            data.message ||
              "🎉 Congratulations on completing all knowledge points!",
            `complete-${Date.now()}`,
          );
        } else {
          primeStepQuizForKnowledgeChange();
          setSessionState((prev) => ({
            ...prev,
            current_index: data.current_index,
            current_html: data.html || "",
            progress: data.progress || 0,
            current_image: data.image,
          }));

          /* Omit chat bubble for routine next navigation — outline + lesson already reflect position. */
        }
      } else {
        addChatMessage(
          "system",
          `❌ Failed to move to next: ${data.error || "Unknown error"}`,
          `error-${Date.now()}`,
        );
      }
    } catch (err) {
      removeLoadingMessage(loadingId);
      setIsLoading(false);
      setLoadingAction(null);
      setLoadingMessage("");
      console.error("Failed to move to next:", err);
      addChatMessage(
        "system",
        "❌ Failed to move to next, please try again later",
        `error-${Date.now()}`,
      );
    }
  }, [
    sessionState.session_id,
    addLoadingMessage,
    removeLoadingMessage,
    addChatMessage,
    clearStepQuiz,
    primeStepQuizForKnowledgeChange,
  ]);

  const previousKnowledge = useCallback(async () => {
    if (!sessionState.session_id) return;

    setIsLoading(true);
    setLoadingAction("prev");
    setLoadingMessage("Going to previous knowledge point...");
    const loadingId = addLoadingMessage("Going to previous knowledge point...");

    try {
      const res = await fetch(apiUrl("/api/v1/guide/previous"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionState.session_id }),
      });
      const data = await res.json();

      removeLoadingMessage(loadingId);
      setIsLoading(false);
      setLoadingAction(null);
      setLoadingMessage("");

      if (data.success) {
        primeStepQuizForKnowledgeChange();
        setSessionState((prev) => ({
          ...prev,
          status: "learning",
          current_index: data.current_index,
          current_html: data.html || "",
          progress: data.progress ?? prev.progress,
          current_image: data.image,
        }));

        /* Omit chat bubble for routine back navigation — outline + lesson already reflect position. */
      } else {
        addChatMessage(
          "system",
          `❌ Failed to go back: ${data.error || "Unknown error"}`,
          `error-${Date.now()}`,
        );
      }
    } catch (err) {
      removeLoadingMessage(loadingId);
      setIsLoading(false);
      setLoadingAction(null);
      setLoadingMessage("");
      console.error("Failed to go to previous:", err);
      addChatMessage(
        "system",
        "❌ Failed to go back, please try again later",
        `error-${Date.now()}`,
      );
    }
  }, [
    sessionState.session_id,
    addLoadingMessage,
    removeLoadingMessage,
    addChatMessage,
    primeStepQuizForKnowledgeChange,
  ]);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim() || !sessionState.session_id) return;

      addChatMessage("user", message, `user-${Date.now()}`);
      const loadingId = addLoadingMessage("Thinking...");

      try {
        const res = await fetch(apiUrl("/api/v1/guide/chat"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionState.session_id,
            message,
          }),
        });
        const data = await res.json();

        removeLoadingMessage(loadingId);

        if (data.success) {
          addChatMessage(
            "assistant",
            data.answer || "",
            `assistant-${Date.now()}`,
            data.image,
          );
        } else {
          addChatMessage(
            "assistant",
            `❌ Error: ${data.error || "Failed to respond"}`,
            `error-${Date.now()}`,
          );
        }
      } catch (err) {
        removeLoadingMessage(loadingId);
        console.error("Failed to send message:", err);
        addChatMessage(
          "assistant",
          "❌ Failed to send message, please try again later",
          `error-${Date.now()}`,
        );
      }
    },
    [
      sessionState.session_id,
      addLoadingMessage,
      removeLoadingMessage,
      addChatMessage,
    ],
  );

  const fixHtml = useCallback(
    async (bugDescription: string) => {
      if (!sessionState.session_id || !bugDescription.trim()) return false;

      const loadingId = addLoadingMessage("Fixing HTML page...");

      try {
        const res = await fetch(apiUrl("/api/v1/guide/fix_html"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionState.session_id,
            bug_description: bugDescription,
          }),
        });
        const data = await res.json();

        removeLoadingMessage(loadingId);

        if (data.success) {
          setSessionState((prev) => ({
            ...prev,
            current_html: data.html || prev.current_html,
          }));
          addChatMessage(
            "system",
            "✅ HTML page has been fixed!",
            `fix-${Date.now()}`,
          );
          return true;
        } else {
          addChatMessage(
            "system",
            `❌ Fix failed: ${data.error || "Unknown error"}`,
            `error-${Date.now()}`,
          );
          return false;
        }
      } catch (err) {
        removeLoadingMessage(loadingId);
        console.error("Failed to fix HTML:", err);
        addChatMessage(
          "system",
          "❌ Fix failed, please try again later",
          `error-${Date.now()}`,
        );
        return false;
      }
    },
    [
      sessionState.session_id,
      addLoadingMessage,
      removeLoadingMessage,
      addChatMessage,
    ],
  );

  const resetSession = useCallback(() => {
    setSessionState(INITIAL_SESSION_STATE);
    setChatMessages([]);
    setIsLoading(false);
    setLoadingMessage("");
    setLoadingAction(null);
    clearStepQuiz();
    saveToStorage(
      STORAGE_KEYS.GUIDE_SESSION,
      persistState(INITIAL_SESSION_STATE, GUIDE_SESSION_EXCLUDE),
    );
    saveToStorage(GUIDE_CHAT_KEY, []);
  }, [clearStepQuiz]);

  // Computed states
  const canStart =
    sessionState.status === "initialized" &&
    sessionState.knowledge_points.length > 0;
  const canNext =
    sessionState.status === "learning" &&
    sessionState.current_index < sessionState.knowledge_points.length - 1;
  const canPrev =
    (sessionState.status === "learning" && sessionState.current_index > 0) ||
    sessionState.status === "completed";
  const isCompleted = sessionState.status === "completed";
  const isLastKnowledge =
    sessionState.status === "learning" &&
    sessionState.current_index === sessionState.knowledge_points.length - 1;

  return {
    sessionState,
    chatMessages,
    stepQuizQuestions,
    stepQuizEncouragement,
    stepQuizLoading,
    stepQuizError,
    isLoading,
    loadingAction,
    loadingMessage,
    canStart,
    canNext,
    canPrev,
    isCompleted,
    isLastKnowledge,
    createSession,
    createSessionFromNcert,
    startLearning,
    nextKnowledge,
    previousKnowledge,
    sendMessage,
    fixHtml,
    fetchStepQuiz,
    resetSession,
  };
}
