"use client";

import { Suspense, useState, useEffect, useMemo, useRef } from "react";
import {
  PenTool,
  Loader2,
  Plus,
  Database,
  Activity,
  CheckCircle2,
  BrainCircuit,
  FileText,
  Upload,
  Sparkles,
  Book,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Lightbulb,
} from "lucide-react";
import { useGlobal } from "@/context/GlobalContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { apiUrl } from "@/lib/api";
import { processLatexContent } from "@/lib/latex";
import { normalizeExamMarks } from "@/lib/examMarks";
import AddToNotebookModal from "@/components/AddToNotebookModal";
import { LogDrawer } from "@/components/question";
import { useQuestionReducer } from "@/hooks/useQuestionReducer";
import { useTranslation } from "react-i18next";
import NCERTRagDropdown from "@/components/NCERTRagDropdown";
import { buildQuestionNotebookRecord } from "@/lib/questionNotebook";
import { MIMIC_GENERATION_SUGGESTIONS } from "@/lib/mimicSuggestions";

function formatQuestionText(content: string): string {
  return processLatexContent(normalizeExamMarks(content));
}

function deriveKbFromNcertChapter(cls?: string, subj?: string): string | null {
  const n = cls?.replace("class-", "");
  const subjSlug = subj?.toLowerCase().replace(/\s+/g, "-");
  if (n && subjSlug) return `ncert-class-${n}-${subjSlug}`;
  if (n) return `ncert-class-${n}`;
  return null;
}
import { useSearchParams } from "next/navigation";

const MAX_QUESTION_COUNT = 200;
/** Set true to show the Logs header button (drawer + logging still work). */
const SHOW_QUESTION_LOGS_BUTTON = false;

function QuestionPageContent() {
  const {
    questionState,
    setQuestionState,
    startQuestionGen,
    startMimicQuestionGen,
    resetQuestionGen,
  } = useGlobal();
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const deepLinkHandled = useRef(false);

  // Dashboard state for parallel generation
  const [dashboardState, dispatchDashboard] = useQuestionReducer();

  // UI state
  const [activeIdx, setActiveIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [submittedMap, setSubmittedMap] = useState<Record<number, boolean>>({});
  const [kbs, setKbs] = useState<string[]>([]);
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [showNotebookModal, setShowNotebookModal] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [selectedMimicHint, setSelectedMimicHint] = useState<string | null>(
    null,
  );

  // Derived state
  const isGenerating = questionState.step === "generating";
  const isComplete = questionState.step === "result";
  const isConfigMode = questionState.step === "config";
  const totalQuestions = questionState.results.length;
  const currentQuestion = questionState.results[activeIdx];
  const extendedCount = questionState.results.filter(
    (r: any) => r.extended,
  ).length;

  const notebookTopic =
    questionState.mode === "mimic"
      ? questionState.uploadedFile?.name?.replace(/\.pdf$/i, "") ||
        questionState.paperPath ||
        "Mimic Exam"
      : questionState.topic;

  const notebookRecord = useMemo(
    () =>
      buildQuestionNotebookRecord(questionState.results, {
        topic: notebookTopic,
        difficulty: questionState.difficulty || "medium",
        type: questionState.type || "choice",
        selectedKb: questionState.selectedKb,
      }),
    [
      questionState.results,
      notebookTopic,
      questionState.difficulty,
      questionState.type,
      questionState.selectedKb,
    ],
  );

  // Progress info from questionState
  const progress = questionState.progress || {};
  const stage =
    progress.stage ||
    (isGenerating ? "generating" : isComplete ? "complete" : null);
  const subFocuses = progress.subFocuses || [];

  // Fetch KBs on mount
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    fetch(apiUrl("/api/v1/knowledge/list"), { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        const names = data.map((kb: any) => kb.name);
        setKbs(names);
        if (!questionState.selectedKb && names.length > 0) {
          setQuestionState((prev) => ({ ...prev, selectedKb: names[0] }));
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch KBs:", err);
        }
      });

    return () => {
      isMounted = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Deep link from Smart Solver "Try similar question" (see buildSimilarQuestionUrl).
    const topic = searchParams.get("topic")?.trim();
    const kb = searchParams.get("kb")?.trim();
    const autoSimilar = searchParams.get("similar") === "1";
    if (!topic) return;

    setQuestionState((prev) => ({
      ...prev,
      mode: "knowledge",
      topic,
      count: 1,
      difficulty: prev.difficulty || "medium",
      type: prev.type || "short_answer",
      ...(kb && (kbs.length === 0 || kbs.includes(kb))
        ? { selectedKb: kb }
        : {}),
    }));

    if (
      autoSimilar &&
      !deepLinkHandled.current &&
      kb &&
      kbs.length > 0 &&
      kbs.includes(kb)
    ) {
      deepLinkHandled.current = true;
      startQuestionGen(topic, "medium", "short_answer", 1, kb, "");
    }
  }, [searchParams, kbs, startQuestionGen]);

  // Auto-select first question when results come in
  useEffect(() => {
    if (
      questionState.results.length > 0 &&
      activeIdx >= questionState.results.length
    ) {
      setActiveIdx(0);
    }
  }, [questionState.results.length, activeIdx]);

  const handleStart = () => {
    if (questionState.mode === "knowledge") {
      startQuestionGen(
        questionState.topic,
        questionState.difficulty,
        questionState.type,
        questionState.count,
        questionState.selectedKb,
        questionState.selectedPdfUrl,
      );
    } else {
      if (!questionState.uploadedFile) {
        alert(t("mimic.upload_required"));
        return;
      }
      if (!questionState.selectedPdfUrl?.trim()) {
        alert(t("mimic.source_chapter_required"));
        return;
      }
      startMimicQuestionGen(
        questionState.uploadedFile,
        "",
        questionState.selectedKb,
        questionState.selectedPdfUrl,
        questionState.count > 0 ? questionState.count : undefined,
        selectedMimicHint ? t(selectedMimicHint) : undefined,
      );
    }
    setUserAnswers({});
    setSubmittedMap({});
    setActiveIdx(0);
  };

  const handleAnswer = (val: string) => {
    if (submittedMap[activeIdx]) return;
    setUserAnswers((prev) => ({ ...prev, [activeIdx]: val }));
  };

  const handleSubmit = () => {
    setSubmittedMap((prev) => ({ ...prev, [activeIdx]: true }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && file.type !== "application/pdf") {
      alert(t("Please upload a PDF exam paper"));
      return;
    }
    setQuestionState((prev) => ({
      ...prev,
      uploadedFile: file,
      paperPath: file ? "" : prev.paperPath,
    }));
  };

  const handleReset = () => {
    resetQuestionGen();
    setSelectedMimicHint(null);
    setUserAnswers({});
    setSubmittedMap({});
    setActiveIdx(0);
  };

  const canStart =
    questionState.mode === "knowledge"
      ? questionState.topic.trim().length > 0
      : questionState.uploadedFile !== null &&
        Boolean(questionState.selectedPdfUrl?.trim());

  return (
    <div className="h-screen flex gap-0 p-4 animate-fade-in overflow-hidden">
      {/* Main Panel */}
      <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="relative z-20 p-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
              <PenTool className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              {t("Question Generator")}
            </div>

            {/* Mode Switching */}
            {isConfigMode && (
              <div className="flex bg-slate-100 dark:bg-slate-700 p-1 rounded-lg border border-slate-200 dark:border-slate-600">
                <button
                  onClick={() =>
                    setQuestionState((prev) => ({ ...prev, mode: "knowledge" }))
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    questionState.mode === "knowledge"
                      ? "bg-white dark:bg-slate-600 text-purple-700 dark:text-purple-400 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  <BrainCircuit className="w-4 h-4" />
                  {t("Custom")}
                </button>
                <button
                  onClick={() =>
                    setQuestionState((prev) => ({ ...prev, mode: "mimic" }))
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    questionState.mode === "mimic"
                      ? "bg-white dark:bg-slate-600 text-purple-700 dark:text-purple-400 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  {t("Mimic Exam")}
                </button>
              </div>
            )}

            {/* Status indicator when generating/complete */}
            {!isConfigMode && (
              <div className="flex items-center gap-2 text-sm">
                {isGenerating ? (
                  <div className="flex items-center gap-2 px-3 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {t("Generating")} {totalQuestions}/{questionState.count}
                      ...
                    </span>
                  </div>
                ) : isComplete ? (
                  <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {totalQuestions} {t("questions")}
                    </span>
                    {extendedCount > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        ({extendedCount} {t("extended")})
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Knowledge Base selector */}
            <div className="flex items-center gap-2">
              <NCERTRagDropdown
                kbs={kbs.map((name) => ({ name }))}
                selectedKb={questionState.selectedKb}
                selectedPdfUrl={questionState.selectedPdfUrl}
                variant={questionState.mode === "mimic" ? "mimic" : "default"}
                onSelectKb={(kbName) =>
                  setQuestionState((prev) => ({
                    ...prev,
                    selectedKb: kbName,
                    selectedPdfUrl: "",
                  }))
                }
                onSelectPdf={(url, _label, cls, subj) => {
                  const derivedKb = deriveKbFromNcertChapter(cls, subj);
                  setQuestionState((prev) => ({
                    ...prev,
                    selectedPdfUrl: url,
                    ...(derivedKb ? { selectedKb: derivedKb } : {}),
                  }));
                }}
              />
            </div>

            {/* Log Drawer Toggle */}
            {SHOW_QUESTION_LOGS_BUTTON && !isConfigMode && (
              <button
                onClick={() => setShowLogDrawer(true)}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 px-3 py-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
              >
                <Activity className="w-4 h-4" />
                {t("Logs")}
              </button>
            )}

            {/* New/Reset button */}
            {!isConfigMode && (
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-purple-600 dark:hover:text-purple-400 px-2.5 py-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 transition-colors shadow-sm"
                title={t("New Session")}
              >
                <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden />
                {t("New")}
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-slate-50/30 dark:bg-slate-900/30">
          {/* Config Mode */}
          {isConfigMode && (
            <div className="p-6">
              <div className="max-w-2xl mx-auto space-y-6">
                {/* Mode Info Banner */}
                <div
                  className={`p-4 rounded-xl border ${
                    questionState.mode === "knowledge"
                      ? "bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800"
                      : "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {questionState.mode === "knowledge" ? (
                      <BrainCircuit className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    ) : (
                      <FileText className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    )}
                    <div>
                      <h3
                        className={`font-semibold ${
                          questionState.mode === "knowledge"
                            ? "text-purple-800 dark:text-purple-300"
                            : "text-blue-800 dark:text-blue-300"
                        }`}
                      >
                        {questionState.mode === "knowledge"
                          ? t("Custom Mode")
                          : t("Mimic Exam Paper Mode")}
                      </h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {questionState.mode === "knowledge"
                          ? t(
                              "Generate questions based on knowledge base content",
                            )
                          : t(
                              "mimic.mode_description",
                            )}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Knowledge Base Mode Config */}
                {questionState.mode === "knowledge" && (
                  <>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("Knowledge Point / Topic")}
                      </label>
                      <input
                        type="text"
                        value={questionState.topic}
                        onChange={(e) =>
                          setQuestionState((prev) => ({
                            ...prev,
                            topic: e.target.value,
                          }))
                        }
                        placeholder={t("e.g. Gradient Descent Optimization")}
                        className="w-full p-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 transition-all text-lg dark:text-slate-200 placeholder:text-slate-400"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t("Count")}
                        </label>
                        <input
                          type="number"
                          min="1"
                          max={MAX_QUESTION_COUNT}
                          value={questionState.count || ""}
                          onChange={(e) => {
                            const rawVal = e.target.value;
                            // Allow empty input while typing
                            if (rawVal === "") {
                              setQuestionState((prev) => ({
                                ...prev,
                                count: 0,
                              }));
                              return;
                            }
                            const val = parseInt(rawVal);
                            if (!isNaN(val)) {
                              setQuestionState((prev) => ({
                                ...prev,
                                count: Math.min(MAX_QUESTION_COUNT, Math.max(0, val)),
                              }));
                            }
                          }}
                          onBlur={(e) => {
                            // Ensure valid value on blur
                            const val = parseInt(e.target.value) || 1;
                            setQuestionState((prev) => ({
                              ...prev,
                              count: Math.max(1, Math.min(MAX_QUESTION_COUNT, val)),
                            }));
                          }}
                          className="w-full p-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-center outline-none focus:border-purple-500 dark:text-slate-200"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t("Difficulty")}
                        </label>
                        <select
                          value={questionState.difficulty}
                          onChange={(e) =>
                            setQuestionState((prev) => ({
                              ...prev,
                              difficulty: e.target.value,
                            }))
                          }
                          className="w-full p-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:border-purple-500 dark:text-slate-200"
                        >
                          <option value="easy">{t("Easy")}</option>
                          <option value="medium">{t("Medium")}</option>
                          <option value="hard">{t("Hard")}</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                          {t("Type")}
                        </label>
                        <select
                          value={questionState.type}
                          onChange={(e) =>
                            setQuestionState((prev) => ({
                              ...prev,
                              type: e.target.value,
                            }))
                          }
                          className="w-full p-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:border-purple-500 dark:text-slate-200"
                        >
                          <option value="choice">{t("Multiple Choice")}</option>
                          <option value="written">{t("Written")}</option>
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {/* Mimic Mode Config */}
                {questionState.mode === "mimic" && (
                  <div className="space-y-5">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("Count")}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={MAX_QUESTION_COUNT}
                        value={questionState.count || ""}
                        onChange={(e) => {
                          const rawVal = e.target.value;
                          if (rawVal === "") {
                            setQuestionState((prev) => ({ ...prev, count: 0 }));
                            return;
                          }
                          const val = parseInt(rawVal, 10);
                          if (!isNaN(val)) {
                            setQuestionState((prev) => ({
                              ...prev,
                              count: Math.min(MAX_QUESTION_COUNT, Math.max(0, val)),
                            }));
                          }
                        }}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value, 10) || 5;
                          setQuestionState((prev) => ({
                            ...prev,
                            count: Math.max(1, Math.min(MAX_QUESTION_COUNT, val)),
                          }));
                        }}
                        className="w-full p-3 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl text-center outline-none focus:border-purple-500 dark:text-slate-200"
                      />
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("mimic.count_hint")}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("mimic.upload_template_label")}
                      </label>
                      <div className="relative">
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={handleFileUpload}
                          className="hidden"
                          id="pdf-upload"
                        />
                        <label
                          htmlFor="pdf-upload"
                          className="flex items-center justify-center gap-3 w-full py-8 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl cursor-pointer hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-900/20 transition-all"
                        >
                          {questionState.uploadedFile ? (
                            <div className="flex items-center gap-3 text-purple-700 dark:text-purple-400">
                              <FileText className="w-8 h-8" />
                              <div>
                                <p className="font-medium">
                                  {questionState.uploadedFile.name}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {(
                                    questionState.uploadedFile.size /
                                    1024 /
                                    1024
                                  ).toFixed(2)}{" "}
                                  MB
                                </p>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center text-slate-500 dark:text-slate-400">
                              <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                              <p className="font-medium">
                                {t("Click to upload PDF")}
                              </p>
                              <p className="text-xs">
                                {t("mimic.upload_template_hint")}
                              </p>
                            </div>
                          )}
                        </label>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("mimic.upload_template_subhint")}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t("questionGen.try_generating")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {MIMIC_GENERATION_SUGGESTIONS.map((chip) => {
                          const label = t(chip.key);
                          const selected = selectedMimicHint === chip.key;
                          return (
                            <button
                              key={chip.key}
                              type="button"
                              onClick={() =>
                                setSelectedMimicHint((prev) =>
                                  prev === chip.key ? null : chip.key,
                                )
                              }
                              className={`inline-flex max-w-[min(100%,20rem)] items-center gap-1.5 rounded-full border px-3 py-1.5 text-left text-xs font-medium shadow-sm transition-all focus:outline-none ${
                                selected
                                  ? "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-600 dark:bg-purple-900/30 dark:text-purple-300"
                                  : "border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:bg-purple-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-purple-600 dark:hover:bg-purple-900/20"
                              }`}
                              title={label}
                            >
                              <span className="shrink-0" aria-hidden>
                                {chip.icon}
                              </span>
                              <span className="line-clamp-2">{label}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {t("questionGen.mimic_suggestions_hint")}
                      </p>
                    </div>
                  </div>
                )}

                {/* Generate Button */}
                <button
                  onClick={handleStart}
                  disabled={!canStart || isGenerating}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold text-lg shadow-lg shadow-purple-500/30 hover:from-purple-700 hover:to-indigo-700 hover:shadow-purple-500/50 active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-5 h-5" />
                  {t("Generate Questions")}
                </button>
              </div>
            </div>
          )}

          {/* Question Display Mode */}
          {!isConfigMode && (
            <div className="flex h-full">
              {/* Left: Question List */}
              <div className="w-72 flex-shrink-0 border-r border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex flex-col">
                <div className="p-3 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {t("Questions")}
                    </span>
                    <span className="text-xs text-slate-400">
                      {totalQuestions}/{questionState.count}
                    </span>
                  </div>
                  {isGenerating && questionState.count > 0 && (
                    <div className="mt-2 h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all duration-300"
                        style={{
                          width: `${(totalQuestions / questionState.count) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {totalQuestions === 0 && isGenerating && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <p className="text-sm">{t("Generating...")}</p>
                    </div>
                  )}
                  {questionState.results.map((result: any, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setActiveIdx(idx)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all mb-1 ${
                        activeIdx === idx
                          ? "bg-purple-50 dark:bg-purple-900/30 border-l-2 border-purple-500"
                          : "hover:bg-slate-50 dark:hover:bg-slate-700"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            result.extended
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600"
                              : submittedMap[idx]
                                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600"
                                : activeIdx === idx
                                  ? "bg-purple-100 dark:bg-purple-900/40 text-purple-600"
                                  : "bg-slate-100 dark:bg-slate-700 text-slate-500"
                          }`}
                        >
                          {result.extended ? (
                            <Zap className="w-3.5 h-3.5" />
                          ) : submittedMap[idx] ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            result.index ?? idx + 1
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm line-clamp-2 ${activeIdx === idx ? "text-slate-800 dark:text-slate-100 font-medium" : "text-slate-600 dark:text-slate-300"}`}
                          >
                            {normalizeExamMarks(result.question.question).slice(0, 80)}...
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-400 uppercase">
                              {result.question.type ||
                                result.question.question_type}
                            </span>
                            {result.extended && (
                              <span className="text-xs text-amber-500">
                                {t("Extended")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: Question Detail */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {currentQuestion ? (
                  <>
                    {/* Question Header */}
                    <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-800">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-500">
                          Question {currentQuestion.index ?? activeIdx + 1}
                        </span>
                        <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-700 text-slate-500 rounded">
                          {currentQuestion.question.type ||
                            currentQuestion.question.question_type}
                        </span>
                        {currentQuestion.extended && (
                          <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/40 text-amber-600 rounded flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {t("Extended")}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setShowNotebookModal(true)}
                          className="text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-1 px-2 py-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg"
                        >
                          <Book className="w-3 h-3" />
                          {t("Add to Notebook")}
                        </button>
                      </div>
                    </div>

                    {/* Question Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {/* Question Text */}
                      <div className="prose prose-slate dark:prose-invert max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                        >
                          {formatQuestionText(
                            currentQuestion.question.question,
                          )}
                        </ReactMarkdown>
                      </div>

                      {/* Options or Input */}
                      {(currentQuestion.question.question_type === "choice" ||
                        currentQuestion.question.type === "choice") &&
                      currentQuestion.question.options &&
                      Object.keys(currentQuestion.question.options).length >
                        0 ? (
                        <div className="space-y-3">
                          {Object.entries(currentQuestion.question.options).map(
                            ([key, val]) => {
                              const isSelected = userAnswers[activeIdx] === key;
                              const isCorrect =
                                key === currentQuestion.question.correct_answer;
                              const showCorrectness = submittedMap[activeIdx];

                              return (
                                <button
                                  key={key}
                                  onClick={() =>
                                    !submittedMap[activeIdx] &&
                                    handleAnswer(key)
                                  }
                                  disabled={submittedMap[activeIdx]}
                                  className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-4 prose dark:prose-invert max-w-none ${
                                    showCorrectness
                                      ? isCorrect
                                        ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300"
                                        : isSelected
                                          ? "bg-red-50 dark:bg-red-900/30 border-red-300"
                                          : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600"
                                      : isSelected
                                        ? "bg-purple-50 dark:bg-purple-900/30 border-purple-300"
                                        : "bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 hover:border-purple-300"
                                  }`}
                                >
                                  <span
                                    className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                                      showCorrectness && isCorrect
                                        ? "bg-emerald-500 text-white"
                                        : showCorrectness &&
                                            isSelected &&
                                            !isCorrect
                                          ? "bg-red-500 text-white"
                                          : isSelected
                                            ? "bg-purple-500 text-white"
                                            : "bg-slate-100 dark:bg-slate-600 text-slate-600 dark:text-slate-300"
                                    }`}
                                  >
                                    {key}
                                  </span>
                                  <div className="flex-1">
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm, remarkMath]}
                                      rehypePlugins={[rehypeKatex]}
                                    >
                                      {formatQuestionText(String(val))}
                                    </ReactMarkdown>
                                  </div>
                                  {showCorrectness && isCorrect && (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                  )}
                                </button>
                              );
                            },
                          )}
                        </div>
                      ) : (
                        <textarea
                          value={userAnswers[activeIdx] || ""}
                          onChange={(e) => handleAnswer(e.target.value)}
                          disabled={submittedMap[activeIdx]}
                          placeholder={t("Type your answer here...")}
                          className="w-full h-40 p-4 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 resize-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                        />
                      )}

                      {/* Answer & Explanation (shown after submit) */}
                      {submittedMap[activeIdx] && (
                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                          {/* Correct Answer */}
                          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">
                              {t("Correct Answer")}
                            </p>
                            <div className="text-emerald-800 dark:text-emerald-200 prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                              >
                                {formatQuestionText(
                                  String(
                                    currentQuestion.question.correct_answer,
                                  ),
                                )}
                              </ReactMarkdown>
                            </div>
                          </div>

                          {/* Explanation */}
                          {currentQuestion.question.explanation && (
                            <div>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                {t("Explanation")}
                              </p>
                              <div className="text-slate-700 dark:text-slate-300 prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkMath]}
                                  rehypePlugins={[rehypeKatex]}
                                >
                                  {formatQuestionText(
                                    currentQuestion.question.explanation,
                                  )}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )}

                          {/* Relevance Analysis (collapsible) */}
                          {currentQuestion.validation && (
                            <div className="border border-slate-200 dark:border-slate-600 rounded-xl overflow-hidden">
                              <button
                                onClick={() => setShowAnalysis(!showAnalysis)}
                                className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors"
                              >
                                <div className="flex items-center gap-2 text-sm">
                                  <AlertCircle className="w-4 h-4 text-slate-400" />
                                  <span className="font-medium text-slate-600 dark:text-slate-300">
                                    {t("Relevance Analysis")}
                                  </span>
                                  <span className="text-xs px-1.5 py-0.5 bg-slate-200 dark:bg-slate-600 text-slate-500 rounded">
                                    {currentQuestion.rounds || 1} {t("round")}
                                    {(currentQuestion.rounds || 1) > 1
                                      ? t("s")
                                      : ""}
                                  </span>
                                </div>
                                {showAnalysis ? (
                                  <ChevronUp className="w-4 h-4 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                )}
                              </button>

                              {showAnalysis && (
                                <div className="px-4 py-3 space-y-3 text-sm bg-white dark:bg-slate-800">
                                  {currentQuestion.validation.kb_coverage && (
                                    <div>
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                                        <Database className="w-3 h-3" />
                                        {t("KB Coverage")}
                                      </div>
                                      <div className="text-slate-600 dark:text-slate-300 prose prose-xs dark:prose-invert max-w-none">
                                        <ReactMarkdown
                                          remarkPlugins={[
                                            remarkGfm,
                                            remarkMath,
                                          ]}
                                          rehypePlugins={[rehypeKatex]}
                                        >
                                          {formatQuestionText(
                                            currentQuestion.validation
                                              .kb_coverage,
                                          )}
                                        </ReactMarkdown>
                                      </div>
                                    </div>
                                  )}
                                  {currentQuestion.validation
                                    .extension_points && (
                                    <div>
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">
                                        <Zap className="w-3 h-3" />
                                        {t("Extension Points")}
                                      </div>
                                      <div className="text-slate-600 dark:text-slate-300 prose prose-xs dark:prose-invert max-w-none">
                                        <ReactMarkdown
                                          remarkPlugins={[
                                            remarkGfm,
                                            remarkMath,
                                          ]}
                                          rehypePlugins={[rehypeKatex]}
                                        >
                                          {formatQuestionText(
                                            currentQuestion.validation
                                              .extension_points,
                                          )}
                                        </ReactMarkdown>
                                      </div>
                                    </div>
                                  )}
                                  {currentQuestion.extended &&
                                    currentQuestion.validation
                                      .kb_connection && (
                                      <div>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">
                                          <Database className="w-3 h-3" />
                                          {t("KB Connection")}
                                        </div>
                                        <div className="text-slate-600 dark:text-slate-300 prose prose-xs dark:prose-invert max-w-none">
                                          <ReactMarkdown
                                            remarkPlugins={[
                                              remarkGfm,
                                              remarkMath,
                                            ]}
                                            rehypePlugins={[rehypeKatex]}
                                          >
                                            {formatQuestionText(
                                              currentQuestion.validation
                                                .kb_connection,
                                            )}
                                          </ReactMarkdown>
                                        </div>
                                      </div>
                                    )}
                                  {currentQuestion.extended &&
                                    currentQuestion.validation
                                      .extended_aspect && (
                                      <div>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">
                                          <Lightbulb className="w-3 h-3" />
                                          {t("Extended Aspects")}
                                        </div>
                                        <div className="text-slate-600 dark:text-slate-300 prose prose-xs dark:prose-invert max-w-none">
                                          <ReactMarkdown
                                            remarkPlugins={[
                                              remarkGfm,
                                              remarkMath,
                                            ]}
                                            rehypePlugins={[rehypeKatex]}
                                          >
                                            {formatQuestionText(
                                              currentQuestion.validation
                                                .extended_aspect,
                                            )}
                                          </ReactMarkdown>
                                        </div>
                                      </div>
                                    )}
                                  {currentQuestion.validation.reasoning && (
                                    <div>
                                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                        {t("Reasoning")}
                                      </div>
                                      <div className="text-slate-600 dark:text-slate-300 prose prose-xs dark:prose-invert max-w-none">
                                        <ReactMarkdown
                                          remarkPlugins={[
                                            remarkGfm,
                                            remarkMath,
                                          ]}
                                          rehypePlugins={[rehypeKatex]}
                                        >
                                          {formatQuestionText(
                                            currentQuestion.validation
                                              .reasoning,
                                          )}
                                        </ReactMarkdown>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
                      {!submittedMap[activeIdx] ? (
                        <button
                          onClick={handleSubmit}
                          disabled={!userAnswers[activeIdx]}
                          className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg shadow-purple-500/20 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          {t("Submit Answer")}
                        </button>
                      ) : (
                        <div className="flex items-center justify-center gap-2 py-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-xl">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="font-medium">{t("Submitted")}</span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-3 text-purple-500" />
                          <p className="text-lg font-medium text-slate-600 dark:text-slate-300">
                            {t("Generating questions...")}
                          </p>
                          <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t("This may take a minute for larger batches.")}
                          </p>
                        </>
                      ) : (
                        <>
                          <Book className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm">
                            {t("Select a question to view details")}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Log Drawer */}
      <LogDrawer
        isOpen={showLogDrawer}
        onClose={() => setShowLogDrawer(false)}
        logs={questionState.logs || []}
        stage={stage}
        progress={progress.progress}
        subFocuses={subFocuses}
        mode={questionState.mode === "knowledge" ? "custom" : "mimic"}
        topic={questionState.topic}
        difficulty={questionState.difficulty}
        questionType={questionState.type}
        count={questionState.count}
        onClearLogs={() => setQuestionState((prev) => ({ ...prev, logs: [] }))}
      />

      {/* Add to Notebook Modal — one record with all Q&A */}
      {notebookRecord && (
        <AddToNotebookModal
          isOpen={showNotebookModal}
          onClose={() => setShowNotebookModal(false)}
          recordType="question"
          title={notebookRecord.title}
          userQuery={notebookRecord.userQuery}
          output={notebookRecord.output}
          metadata={notebookRecord.metadata}
          kbName={questionState.selectedKb}
        />
      )}
    </div>
  );
}

export default function QuestionPage() {
  return (
    <Suspense fallback={null}>
      <QuestionPageContent />
    </Suspense>
  );
}
