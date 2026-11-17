"use client";

/**
 * Smart Solver main page — shared by student portal, teacher portal, and /solver.
 * Three input tabs (Upload, Draw, AiChat) each keep their own chat history in localStorage,
 * scoped per logged-in user (student / teacher) or guest on standalone /solver.
 */
import {Suspense,  useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Loader2,
  Bot,
  User,
  CheckCircle2,
  Save,
  Trash2,
  Plus,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useGlobal } from "@/context/GlobalContext";
import { API_BASE_URL, apiUrl } from "@/lib/api";
import { processLatexContent } from "@/lib/latex";
import AddToNotebookModal from "@/components/AddToNotebookModal";
import { useTranslation } from "react-i18next";
import AvatarNarrator from "@/components/AvatarNarrator";
import SolverInputTabs from "@/components/solver/SolverInputTabs";
import SolverTypeInput from "@/components/solver/SolverTypeInput";
import SolverUploadInput from "@/components/solver/SolverUploadInput";
import SolverOcrConfirm from "@/components/solver/SolverOcrConfirm";
import SolverImageCrop from "@/components/solver/SolverImageCrop";
import SolverDrawCanvas from "@/components/solver/SolverDrawCanvas";
import type { SolverInputMode } from "@/components/solver/types";
import {
  cropImageDataUrl,
  extractQuestionFromImage,
  rotateImageDataUrl,
  type NormalizedCropRect,
  type OcrConfidence,
} from "@/lib/solverOcr";
import {
  clearSolverSessionInputMode,
  emptySolverMessagesByMode,
  emptySolverSessionIdsByMode,
  getSolverStorageScope,
  persistSolverMessagesByMode,
  persistSolverSessionIdsByMode,
  persistSolverSessionInputMode,
  readSolverMessagesByMode,
  readSolverSessionIdsByMode,
  readSolverSessionInputMode,
  type SolverMessagesByMode,
  type SolverNotebookMessage,
  type SolverSessionIdsByMode,
} from "@/lib/solverNotebook";
import {
  defaultSolverInputMode,
  getSolverExampleQuestions,
} from "@/lib/solverExamples";
import {
  kbNameForClass,
  parseClassLevelFromGrade,
} from "@/lib/solverStudent";
import { isStudentPortalAiRoute } from "@/lib/studentNav";
import { usePathname, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/authStore";

const resolveArtifactUrl = (url?: string | null, outputDir?: string) => {
  if (!url) return "";

  // Turn solver artifact paths into full backend URLs for markdown images.
  // Already absolute http/https URL
  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  const normalized = url.replace(/^\.\//, "");

  // Backend already rewrote to /api/outputs/solve/...
  if (normalized.startsWith("/api/outputs/")) {
    return `${API_BASE_URL}${normalized}`;
  }

  if (normalized.startsWith("api/outputs/")) {
    return `${API_BASE_URL}/${normalized}`;
  }

  if (normalized.startsWith("artifacts/") && outputDir) {
    return `${API_BASE_URL}/api/outputs/solve/${outputDir}/${normalized}`;
  }

  return url;
};

function SolverPageContent() {
  const { solverState, setSolverState, startSolver, newSolverSession } =
    useGlobal();
  const { t, i18n } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const userRole = useAuthStore((s) => s.user?.role);
  const authUser = useAuthStore((s) => s.user);
  const authHydrated = useAuthStore((s) => s.hydrated);
  const storageScope = useMemo(
    () => getSolverStorageScope(authUser),
    [authUser?.id, authUser?.role],
  );
  const isStudentPortal =
    userRole === "student" && isStudentPortalAiRoute(pathname);
  /** Same Smart Solver UX on student portal, teacher portal, and standalone /solver */
  const studentSolverUX = true;

  // Local state for input
  const [inputQuestion, setInputQuestion] = useState("");
  const [inputMode, setInputMode] = useState<SolverInputMode>(
    defaultSolverInputMode(true),
  );
  // Which tab owns the active WebSocket solve (so history syncs to the right tab).
  const [sessionInputMode, setSessionInputMode] =
    useState<SolverInputMode | null>(null);
  // Per-tab chat + backend session ids (persisted in localStorage).
  const [messagesByMode, setMessagesByMode] = useState<SolverMessagesByMode>(
    emptySolverMessagesByMode,
  );
  const [sessionIdsByMode, setSessionIdsByMode] =
    useState<SolverSessionIdsByMode>(emptySolverSessionIdsByMode);
  const [tabSessionsReady, setTabSessionsReady] = useState(false);
  const [pendingImage, setPendingImage] = useState<string | null>(null);
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null);
  const [pendingBase64, setPendingBase64] = useState<string | null>(null);
  const [uploadStep, setUploadStep] = useState<"crop" | "confirm">("crop");
  const [draftQuestion, setDraftQuestion] = useState("");
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrConfidence, setOcrConfidence] = useState<OcrConfidence | undefined>();
  const [cropResetKey, setCropResetKey] = useState(0);
  const [kbs, setKbs] = useState<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const prevIsSolvingForChatRef = useRef<boolean>(false);

  const [classLevel, setClassLevel] = useState("10");
  const subject = "science";

  // Notebook modal state
  const [showNotebookModal, setShowNotebookModal] = useState(false);
  const [notebookRecord, setNotebookRecord] = useState<{
    title: string;
    userQuery: string;
    output: string;
    metadata?: Record<string, unknown>;
  } | null>(null);
  const [notebookSaveLoading, setNotebookSaveLoading] = useState(false);

  const exampleQuestions = useMemo(
    () => getSolverExampleQuestions(true, t, subject, classLevel),
    [t, subject, classLevel],
  );

  const prevIsSolvingForTabSyncRef = useRef(false);
  const prevStorageScopeRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authHydrated) return;

    const scopeChanged =
      prevStorageScopeRef.current !== null &&
      prevStorageScopeRef.current !== storageScope;

    setMessagesByMode(readSolverMessagesByMode(storageScope));
    setSessionIdsByMode(readSolverSessionIdsByMode(storageScope));
    setTabSessionsReady(true);

    if (scopeChanged) {
      newSolverSession();
      setSessionInputMode(readSolverSessionInputMode(storageScope));
    } else if (prevStorageScopeRef.current === null) {
      // Clear hydrated global solver chat (may be from another role on shared browser).
      newSolverSession();
      const storedMode = readSolverSessionInputMode(storageScope);
      if (storedMode) setSessionInputMode(storedMode);
    }

    prevStorageScopeRef.current = storageScope;
  }, [authHydrated, storageScope, newSolverSession]);

  useEffect(() => {
    if (sessionInputMode !== null) return;
    const stored = readSolverSessionInputMode(storageScope);
    if (stored) {
      setSessionInputMode(stored);
    }
  }, [sessionInputMode, storageScope]);

  useEffect(() => {
    if (!sessionInputMode || !solverState.sessionId) return;
    setSessionIdsByMode((prev) => {
      if (prev[sessionInputMode] === solverState.sessionId) return prev;
      const next = { ...prev, [sessionInputMode]: solverState.sessionId };
      persistSolverSessionIdsByMode(storageScope, next);
      return next;
    });
  }, [sessionInputMode, solverState.sessionId, storageScope]);

  useEffect(() => {
    // After a solve finishes, copy global messages into the tab that started it.
    const wasSolving = prevIsSolvingForTabSyncRef.current;
    prevIsSolvingForTabSyncRef.current = solverState.isSolving;

    if (!wasSolving || solverState.isSolving || !sessionInputMode) return;

    setMessagesByMode((prev) => {
      const next = { ...prev, [sessionInputMode]: solverState.messages as SolverNotebookMessage[] };
      persistSolverMessagesByMode(storageScope, next);
      return next;
    });
  }, [
    solverState.isSolving,
    solverState.messages,
    sessionInputMode,
    storageScope,
  ]);

  useEffect(() => {
    if (!isStudentPortal) return;
    const parsed = parseClassLevelFromGrade(authUser?.grade);
    if (parsed) setClassLevel(parsed);
  }, [isStudentPortal, authUser?.grade]);

  useEffect(() => {
    if (kbs.length === 0) return;
    const kb = kbNameForClass(classLevel);
    if (kbs.includes(kb)) {
      setSolverState((prev) =>
        prev.selectedKb === kb ? prev : { ...prev, selectedKb: kb },
      );
    }
  }, [classLevel, kbs, setSolverState]);

  useEffect(() => {
    // Fetch knowledge bases on mount only
    fetch(apiUrl("/api/v1/knowledge/list"))
      .then((res) => res.json())
      .then((data) => {
        const names = data.map((kb: any) => kb.name);
        setKbs(names);
        if (!solverState.selectedKb) {
          const defaultKb = data.find((kb: any) => kb.is_default)?.name;
          if (defaultKb)
            setSolverState((prev) => ({ ...prev, selectedKb: defaultKb }));
          else if (names.length > 0)
            setSolverState((prev) => ({ ...prev, selectedKb: names[0] }));
        }
      })
      .catch((err) => console.error("Failed to fetch KBs:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const scrollChatToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    requestAnimationFrame(() => {
      const container = chatContainerRef.current;
      if (container) {
        container.scrollTo({ top: container.scrollHeight, behavior });
        return;
      }
      chatEndRef.current?.scrollIntoView({ behavior, block: "end" });
    });
  }, []);

  // Auto-scroll when a new solve starts or assistant messages stream in.
  useEffect(() => {
    const isSolvingChanged =
      prevIsSolvingForChatRef.current !== solverState.isSolving;
    const currentMessagesLength = solverState.messages.length;
    const messagesGrew =
      currentMessagesLength > prevMessagesLengthRef.current;

    if (
      solverState.isSolving &&
      (isSolvingChanged || messagesGrew)
    ) {
      scrollChatToBottom();
    }

    prevMessagesLengthRef.current = currentMessagesLength;
    prevIsSolvingForChatRef.current = solverState.isSolving;
  }, [solverState.messages, solverState.isSolving, scrollChatToBottom]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "type" || tab === "draw" || tab === "upload") return;
    setInputMode(defaultSolverInputMode(true));
  }, [searchParams]);

  useEffect(() => {
    const question = searchParams.get("question")?.trim();
    const tab = searchParams.get("tab");
    if (question) {
      setInputQuestion(question);
    }
    if (
      tab === "type" ||
      tab === "draw" ||
      tab === "upload"
    ) {
      setInputMode(tab);
      setSessionInputMode(tab);
      persistSolverSessionInputMode(storageScope, tab);
    }
  }, [searchParams, storageScope]);

  useEffect(() => {
    clearUploadState();
  }, [inputMode]);

  const resolveKb = () => {
    const studentKb = kbNameForClass(classLevel);
    if (kbs.includes(studentKb)) return studentKb;
    return solverState.selectedKb || studentKb || "ncert-class-8";
  };

  const clearUploadState = () => {
    setPendingImage(null);
    setSourceImageUrl(null);
    setPendingBase64(null);
    setUploadStep("crop");
    setDraftQuestion("");
    setOcrError(null);
    setOcrConfidence(undefined);
    setOcrLoading(false);
  };

  const runOcrOnImage = async (
    previewUrl: string,
    base64: string,
    caption?: string,
    inputSource: "upload" | "draw" = "upload",
  ) => {
    setPendingImage(previewUrl);
    setUploadStep("confirm");
    setDraftQuestion("");
    setOcrError(null);
    setOcrConfidence(undefined);
    setOcrLoading(true);
    try {
      const lang = (i18n.language || "en").slice(0, 2);
      const result = await extractQuestionFromImage(
        base64,
        lang,
        caption,
        inputSource,
      );
      setDraftQuestion(result.question_text || "");
      setOcrConfidence(result.confidence);
      if (!result.question_text?.trim()) {
        setOcrError(t("solver.ocr_empty"));
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("solver.ocr_failed");
      const lower = message.toLowerCase();
      const isEmptyOcr =
        lower.includes("could not read") ||
        lower.includes("no text") ||
        lower.includes("empty");
      setOcrError(isEmptyOcr ? t("solver.ocr_empty") : message);
      setDraftQuestion("");
    } finally {
      setOcrLoading(false);
    }
  };

  const isActiveTabSolve =
    solverState.isSolving && (sessionInputMode ?? inputMode) === inputMode;
  // Show this tab's saved chat, or live messages while this tab is solving.
  const visibleMessages: SolverNotebookMessage[] = isActiveTabSolve
    ? (solverState.messages as SolverNotebookMessage[])
    : messagesByMode[inputMode];
  const showSessionResults =
    visibleMessages.length > 0 || isActiveTabSolve;
  // AiChat always has input; Upload/Draw show follow-up box only after first answer.
  const showBottomChatInput =
    inputMode === "type" ||
    (showSessionResults &&
      (inputMode === "draw" || inputMode === "upload"));
  const chatInputPlaceholder =
    inputMode === "type" && !showSessionResults
      ? t("solver.type_placeholder")
      : t("solver.follow_up_placeholder");

  const persistSessionInputMode = (mode: SolverInputMode) => {
    setSessionInputMode(mode);
    persistSolverSessionInputMode(storageScope, mode);
  };

  const handleNewSession = () => {
    if (solverState.isSolving) return;
    setMessagesByMode((prev) => {
      const next = { ...prev, [inputMode]: [] };
      persistSolverMessagesByMode(storageScope, next);
      return next;
    });
    setSessionIdsByMode((prev) => {
      const next = { ...prev, [inputMode]: null };
      persistSolverSessionIdsByMode(storageScope, next);
      return next;
    });
    newSolverSession();
    clearUploadState();
    setInputQuestion("");
    setSessionInputMode(null);
    clearSolverSessionInputMode(storageScope);
    prevMessagesLengthRef.current = 0;
  };

  const handleSolveQuestion = (text: string) => {
    const q = text.trim();
    if (!q) return;
    persistSessionInputMode(inputMode);
    // Pass tab history + session id so follow-ups reuse backend conversation context.
    startSolver(q, resolveKb(), {
      initialMessages: messagesByMode[inputMode],
      sessionId: sessionIdsByMode[inputMode],
    });
    setInputQuestion("");
    clearUploadState();
    // After OCR panel closes, jump to the latest message in an existing chat.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => scrollChatToBottom());
    });
  };

  const handleStart = () => {
    handleSolveQuestion(inputQuestion);
  };

  const handleTypeInstead = () => {
    const q = draftQuestion.trim();
    if (q) setInputQuestion(q);
    clearUploadState();
    setInputMode("type");
  };

  const handleImageReady = (previewUrl: string, base64: string) => {
    setSourceImageUrl(previewUrl);
    setPendingImage(previewUrl);
    setPendingBase64(base64);
    setUploadStep("crop");
    setDraftQuestion("");
    setOcrError(null);
    setOcrConfidence(undefined);
    setOcrLoading(false);
  };

  const handleCropConfirm = async (crop: NormalizedCropRect) => {
    if (!sourceImageUrl) return;
    setOcrLoading(true);
    try {
      const { dataUrl, base64 } = await cropImageDataUrl(sourceImageUrl, crop);
      await runOcrOnImage(dataUrl, base64, undefined, "upload");
    } catch {
      setOcrError(t("solver.upload_read_failed"));
      setUploadStep("confirm");
      setOcrLoading(false);
    }
  };

  const handleUseFullImage = () => {
    if (!sourceImageUrl || !pendingBase64) return;
    void runOcrOnImage(sourceImageUrl, pendingBase64, undefined, "upload");
  };

  const handleRecrop = () => {
    if (sourceImageUrl) {
      setPendingImage(sourceImageUrl);
      setUploadStep("crop");
      setDraftQuestion("");
      setOcrError(null);
      setOcrConfidence(undefined);
      setOcrLoading(false);
    }
  };

  const handleRotateImage = async (direction: "cw" | "ccw") => {
    if (!sourceImageUrl) return;
    setOcrLoading(true);
    try {
      const { dataUrl, base64 } = await rotateImageDataUrl(
        sourceImageUrl,
        direction,
      );
      setSourceImageUrl(dataUrl);
      setPendingImage(dataUrl);
      setPendingBase64(base64);
      setCropResetKey((k) => k + 1);
    } catch {
      setOcrError(t("solver.upload_read_failed"));
    } finally {
      setOcrLoading(false);
    }
  };

  const handleDrawExport = (
    previewUrl: string,
    base64: string,
    caption: string,
  ) => {
    void runOcrOnImage(previewUrl, base64, caption || undefined, "draw");
  };

  const openNotebookSave = async () => {
    const tabMessages = isActiveTabSolve
      ? (solverState.messages as SolverNotebookMessage[])
      : messagesByMode[inputMode];
    if (tabMessages.length === 0) return;
    setNotebookSaveLoading(true);
    try {
      const {
        buildSolverNotebookPayload,
        fetchSolverMessagesForNotebook,
      } = await import("@/lib/solverNotebook");
      const messages = await fetchSolverMessagesForNotebook(
        sessionIdsByMode[inputMode] ?? solverState.sessionId,
        tabMessages.map((m) => ({
          role: m.role,
          content: (m.content ?? "").trim(),
          outputDir: m.outputDir,
        })),
      );
      const payload = buildSolverNotebookPayload(messages, {
        sessionId: sessionIdsByMode[inputMode] ?? solverState.sessionId,
        selectedKb: solverState.selectedKb,
        inputMode: sessionInputMode ?? inputMode,
      }, t("Smart Solver Session"));
      if (!payload) return;
      setNotebookRecord(payload);
      setShowNotebookModal(true);
    } catch (err) {
      console.error(err);
    } finally {
      setNotebookSaveLoading(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 gap-0 animate-fade-in overflow-hidden">
      {/* Left Panel: Chat Interface */}
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 overflow-hidden min-h-0">

        {/* ── Toolbar: input mode + actions ───────────────────────────────── */}
        <div className="shrink-0 border-b border-slate-100 bg-slate-50/50 dark:border-slate-700 dark:bg-slate-800/50">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
            <SolverInputTabs
              activeMode={inputMode}
              onChange={setInputMode}
              disabled={solverState.isSolving}
            />

            <div className="flex shrink-0 items-center gap-2">
              {studentSolverUX &&
                (isStudentPortal ? (
                  <span className="hidden rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 sm:inline">
                    {t("solver.class_badge", { n: classLevel })}
                  </span>
                ) : (
                  <select
                    value={classLevel}
                    onChange={(e) => setClassLevel(e.target.value)}
                    disabled={solverState.isSolving}
                    className="hidden rounded-full border-0 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700 outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-blue-900/40 dark:text-blue-300 dark:focus:ring-blue-600 sm:inline"
                    aria-label={t("solver.class_badge", { n: classLevel })}
                  >
                    {Array.from({ length: 12 }, (_, i) => String(i + 1)).map(
                      (c) => (
                        <option key={c} value={c}>
                          {t("solver.class_badge", { n: c })}
                        </option>
                      ),
                    )}
                  </select>
                ))}
              <button
                type="button"
                onClick={handleNewSession}
                disabled={solverState.isSolving}
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-blue-500 dark:hover:bg-blue-900/30 dark:hover:text-blue-300"
                title={t("solver.new_session_hint")}
              >
                <Plus className="h-3.5 w-3.5" />
                {t("New")}
              </button>
              <button
                type="button"
                onClick={() => void openNotebookSave()}
                disabled={
                  visibleMessages.length === 0 || notebookSaveLoading
                }
                className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-indigo-500 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300"
                title={t("Save to Notebook")}
              >
                <Save className="h-3.5 w-3.5" />
                {notebookSaveLoading ? t("Saving") : t("Save to Notebook")}
              </button>
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div
          ref={chatContainerRef}
          className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30 dark:bg-slate-900/30 min-h-0"
        >
          {/* Upload tab content */}
          {inputMode === "upload" && pendingImage && uploadStep === "crop" && sourceImageUrl && (
            <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-4">
              <SolverImageCrop
                key={cropResetKey}
                imageUrl={sourceImageUrl}
                onConfirm={(crop) => void handleCropConfirm(crop)}
                onUseFull={handleUseFullImage}
                onRetake={clearUploadState}
                onRotate={(dir) => void handleRotateImage(dir)}
                processing={ocrLoading}
              />
            </div>
          )}
          {inputMode === "upload" && pendingImage && uploadStep === "confirm" && (
            <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-4">
              <SolverOcrConfirm
                previewUrl={pendingImage}
                questionText={draftQuestion}
                onQuestionChange={setDraftQuestion}
                onSolve={() => handleSolveQuestion(draftQuestion)}
                onRetake={clearUploadState}
                onRecrop={sourceImageUrl ? handleRecrop : undefined}
                onTypeInstead={handleTypeInstead}
                confidence={ocrConfidence}
                loading={ocrLoading}
                error={ocrError}
                disabled={solverState.isSolving}
              />
            </div>
          )}
          {inputMode === "draw" && !pendingImage && (
            <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-4">
              <SolverDrawCanvas
                onExport={handleDrawExport}
                disabled={solverState.isSolving}
                loading={ocrLoading}
              />
            </div>
          )}
          {inputMode === "draw" && pendingImage && uploadStep === "confirm" && (
            <div className="mx-auto flex w-full max-w-3xl flex-col items-center justify-center py-4">
              <SolverOcrConfirm
                previewUrl={pendingImage}
                questionText={draftQuestion}
                onQuestionChange={setDraftQuestion}
                onSolve={() => handleSolveQuestion(draftQuestion)}
                onRetake={clearUploadState}
                onTypeInstead={handleTypeInstead}
                confidence={ocrConfidence}
                loading={ocrLoading}
                error={ocrError}
                disabled={solverState.isSolving}
              />
            </div>
          )}
          {inputMode === "upload" && !pendingImage && (
            <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-center py-4">
              {studentSolverUX && (
                <div className="mb-5 w-full max-w-md text-center">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {t("solver.headline_student")}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    {t("solver.subhead_student")}
                  </p>
                </div>
              )}
              <SolverUploadInput
                onImageReady={(preview, base64) =>
                  void handleImageReady(preview, base64)
                }
                disabled={solverState.isSolving}
                loading={ocrLoading}
              />
            </div>
          )}

          {/* Initial State */}
          {!showSessionResults && !solverState.isSolving && (
            <>
              {inputMode === "type" && (
                <div className="h-full flex flex-col items-center justify-center text-center max-w-md mx-auto">
                  <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-2xl flex items-center justify-center mb-6 shadow-sm">
                    <Bot className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-2">
                    {t("solver.headline_student")}
                  </h3>
                  <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                    {t("solver.subhead_student")}
                  </p>
                  <div className="grid grid-cols-1 gap-3 w-full text-sm">
                    {exampleQuestions.map((q, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setInputQuestion(q)}
                        className="px-4 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-300 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-400 transition-all text-left text-slate-600 dark:text-slate-300 shadow-sm"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Messages List */}
          {showSessionResults &&
            visibleMessages.map((msg, idx) => (
            <div
              key={idx}
              className="flex gap-4 w-full animate-in fade-in slide-in-from-bottom-4"
            >
              {msg.role === "user" ? (
                <>
                  <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                    <User className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                  </div>
                  <div className="flex-1 bg-slate-100 dark:bg-slate-700 px-5 py-3.5 rounded-2xl rounded-tl-none text-slate-800 dark:text-slate-200 leading-relaxed shadow-sm overflow-hidden min-w-0 break-words">
                    <div className="prose prose-slate dark:prose-invert max-w-none prose-headings:font-bold prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:shadow-inner prose-pre:overflow-x-auto prose-code:break-words prose-a:break-all">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        urlTransform={(url) =>
                          resolveArtifactUrl(url, msg.outputDir)
                        }
                        components={{
                          img: ({ node, src, alt, ...props }) => (
                            // eslint-disable-next-line @next/next/no-img-element -- Dynamic images from markdown content
                            <img
                              {...props}
                              src={
                                resolveArtifactUrl(
                                  typeof src === "string" ? src : "",
                                  msg.outputDir,
                                ) || undefined
                              }
                              alt={alt || t("solver.solution_image_alt")}
                              loading="lazy"
                              className="max-w-full h-auto"
                            />
                          ),
                          a: ({ node, href, ...props }) => (
                            <a
                              {...props}
                              href={
                                resolveArtifactUrl(
                                  typeof href === "string" ? href : "",
                                  msg.outputDir,
                                ) || undefined
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="break-all"
                            />
                          ),
                          pre: ({ node, ...props }) => (
                            <pre
                              {...props}
                              className="overflow-x-auto max-w-full"
                            />
                          ),
                          code: ({ node, className, children, ...props }) => {
                            const isInline = !className;
                            return (
                              <code
                                {...props}
                                className={isInline ? "break-words" : "block"}
                              >
                                {children}
                              </code>
                            );
                          },
                          table: ({ node, ...props }) => (
                            <div className="overflow-x-auto">
                              <table {...props} className="min-w-full" />
                            </div>
                          ),
                        }}
                      >
                        {processLatexContent(msg.content)}
                      </ReactMarkdown>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 bg-white dark:bg-slate-800 px-6 py-5 rounded-2xl rounded-tl-none border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden min-w-0 break-words">
                    <div className="prose prose-slate dark:prose-invert prose-blue max-w-none prose-headings:font-bold prose-p:leading-relaxed prose-pre:bg-slate-900 prose-pre:shadow-inner prose-pre:overflow-x-auto prose-code:break-words prose-a:break-all">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                        urlTransform={(url) =>
                          resolveArtifactUrl(url, msg.outputDir)
                        }
                        components={{
                          img: ({ node, src, alt, ...props }) => (
                            // eslint-disable-next-line @next/next/no-img-element -- Dynamic images from markdown content
                            <img
                              {...props}
                              src={
                                resolveArtifactUrl(
                                  typeof src === "string" ? src : "",
                                  msg.outputDir,
                                ) || undefined
                              }
                              alt={alt || t("solver.solution_image_alt")}
                              loading="lazy"
                              className="max-w-full h-auto"
                            />
                          ),
                          a: ({ node, href, ...props }) => (
                            <a
                              {...props}
                              href={
                                resolveArtifactUrl(
                                  typeof href === "string" ? href : "",
                                  msg.outputDir,
                                ) || undefined
                              }
                              target="_blank"
                              rel="noreferrer"
                              className="break-all"
                            />
                          ),
                          pre: ({ node, ...props }) => (
                            <pre
                              {...props}
                              className="overflow-x-auto max-w-full"
                            />
                          ),
                          code: ({ node, className, children, ...props }) => {
                            const isInline = !className;
                            return (
                              <code
                                {...props}
                                className={isInline ? "break-words" : "block"}
                              >
                                {children}
                              </code>
                            );
                          },
                          table: ({ node, ...props }) => (
                            <div className="overflow-x-auto">
                              <table {...props} className="min-w-full" />
                            </div>
                          ),
                        }}
                      >
                        {processLatexContent(msg.content)}
                      </ReactMarkdown>
                    </div>
                    {/* TTS Narration */}
                    <AvatarNarrator text={msg.content} language="en" />
                  </div>
                </>
              )}
            </div>
            ))}

          {/* AI Thinking State */}
          {isActiveTabSolve && (
            <div className="flex gap-4 w-full animate-in fade-in slide-in-from-bottom-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="bg-white dark:bg-slate-800 px-5 py-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-700 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span className="font-medium">
                      {t("solver.stage_working")}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input Area — AiChat always; Draw/Upload after first answer (follow-up) */}
        <div className="shrink-0 border-t border-slate-100 bg-white px-4 pt-3 pb-4 dark:border-slate-700 dark:bg-slate-800">
          {showBottomChatInput && (
            <SolverTypeInput
              value={inputQuestion}
              onChange={setInputQuestion}
              onSubmit={handleStart}
              isSolving={solverState.isSolving}
              placeholder={chatInputPlaceholder}
            />
          )}

          <div
            className={`text-center text-[10px] text-slate-400 dark:text-slate-500 ${showBottomChatInput ? "mt-2" : ""}`}
          >
            {t(
              "bixy_AiTutor can make mistakes. Please verify important information.",
            )}
          </div>
        </div>
      </div>

      {/* Add to Notebook Modal */}
      {notebookRecord && (
        <AddToNotebookModal
          isOpen={showNotebookModal}
          onClose={() => {
            setShowNotebookModal(false);
            setNotebookRecord(null);
          }}
          recordType="solve"
          title={notebookRecord.title}
          userQuery={notebookRecord.userQuery}
          output={notebookRecord.output}
          metadata={notebookRecord.metadata}
          kbName={solverState.selectedKb}
        />
      )}
    </div>
  );
}


export default function SolverPage() {
  return (
    <Suspense fallback={null}>
      <SolverPageContent />
    </Suspense>
  );
}
