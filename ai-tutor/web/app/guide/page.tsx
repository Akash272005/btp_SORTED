"use client";

import { useState, useEffect, useCallback } from "react";
import {
  GraduationCap,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  Loader2,
  BookmarkPlus,
  Plus,
} from "lucide-react";
import "katex/dist/katex.min.css";

import {
  NotebookSelector,
  GuideNcertPanel,
  ProgressPanel,
  GuidePathAssistantPanel,
  HTMLViewer,
  StepQuizPanel,
  CompletionSummary,
} from "./components";
import { useGuideSession, useNotebookSelection, useGuideStepProgress } from "./hooks";
import { useTranslation } from "react-i18next";
import AddToNotebookModal from "@/components/AddToNotebookModal";
import type { NotebookRecord } from "./types";

export default function GuidePage() {
  const { t } = useTranslation();
  // Notebook selection hook
  const {
    notebooks,
    expandedNotebooks,
    notebookRecordsMap,
    selectedRecords,
    loadingNotebooks,
    loadingRecordsFor,
    fetchNotebooks,
    toggleNotebookExpanded,
    toggleRecordSelection,
    selectAllFromNotebook,
    deselectAllFromNotebook,
    clearAllSelections,
  } = useNotebookSelection();

  // Session management hook
  const {
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
    fetchStepQuiz,
    resetSession,
  } = useGuideSession();

  const {
    attemptedSet,
    scoresByStep,
    quizUiByStep,
    mergeQuizUiStep,
    setAttemptedForStep,
    recordQuizScore,
    clearProgress,
  } = useGuideStepProgress(sessionState.session_id);

  const [ncertKb, setNcertKb] = useState("");
  const [ncertPdfUrl, setNcertPdfUrl] = useState("");
  const [ncertChapterTitle, setNcertChapterTitle] = useState("");

  const handleNcertSelectKb = useCallback((name: string) => {
    setNcertKb(name);
    setNcertPdfUrl("");
    setNcertChapterTitle("");
  }, []);

  const handleNcertSelectPdf = useCallback(
    (url: string, label: string) => {
      setNcertPdfUrl(url);
      setNcertChapterTitle(label);
      clearAllSelections();
    },
    [clearAllSelections],
  );

  const handleToggleRecord = useCallback(
    (record: NotebookRecord, notebookId: string, notebookName: string) => {
      setNcertPdfUrl("");
      setNcertChapterTitle("");
      toggleRecordSelection(record, notebookId, notebookName);
    },
    [toggleRecordSelection],
  );

  const handleSelectAllNotebooks = useCallback(
    (notebookId: string, notebookName: string) => {
      setNcertPdfUrl("");
      setNcertChapterTitle("");
      selectAllFromNotebook(notebookId, notebookName);
    },
    [selectAllFromNotebook],
  );

  const handleDeselectAllNotebooks = useCallback(
    (notebookId: string) => {
      setNcertPdfUrl("");
      setNcertChapterTitle("");
      deselectAllFromNotebook(notebookId);
    },
    [deselectAllFromNotebook],
  );

  const handleClearAllSources = useCallback(() => {
    setNcertPdfUrl("");
    setNcertChapterTitle("");
    clearAllSelections();
  }, [clearAllSelections]);

  // UI state
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWide, setSidebarWide] = useState(false);

  // Save to Notebook modal state
  const [showNotebookModal, setShowNotebookModal] = useState(false);
  const [notebookRecord, setNotebookRecord] = useState<{
    title: string;
    userQuery: string;
    output: string;
  } | null>(null);

  const handleSaveToNotebook = () => {
    const currentKP = sessionState.knowledge_points[sessionState.current_index];
    const title = currentKP?.knowledge_title || `Guided Learning — Topic ${sessionState.current_index + 1}`;
    const userQuery = currentKP?.knowledge_summary || title;
    setNotebookRecord({
      title,
      userQuery,
      output: sessionState.current_html,
    });
    setShowNotebookModal(true);
  };

  // Load notebooks on mount
  useEffect(() => {
    fetchNotebooks();
  }, [fetchNotebooks]);

  // Calculate widths based on ratio
  const leftWidthPercent = sidebarCollapsed ? 0 : sidebarWide ? 75 : 25;
  const rightWidthPercent = sidebarCollapsed ? 100 : sidebarWide ? 25 : 75;

  const sidebarRailStyle = {
    "--guide-sidebar-pct": `${leftWidthPercent}%`,
    "--guide-sidebar-min": sidebarCollapsed
      ? "0px"
      : `${Math.max(leftWidthPercent * 0.01 * 1200, 300)}px`,
  } as React.CSSProperties;

  const mainColumnStyle = {
    "--guide-main-pct": `${rightWidthPercent}%`,
  } as React.CSSProperties;

  const planItemCount = ncertPdfUrl.trim()
    ? 1
    : selectedRecords.size;

  const handleGenerateLearningPlan = useCallback(() => {
    const pdf = ncertPdfUrl.trim();
    if (pdf) {
      const title =
        ncertChapterTitle.trim() ||
        pdf.split("/").pop()?.split("?")[0] ||
        "";
      void createSessionFromNcert({ pdfUrl: pdf, chapterTitle: title });
      return;
    }
    createSession(selectedRecords);
  }, [
    ncertPdfUrl,
    ncertChapterTitle,
    createSessionFromNcert,
    createSession,
    selectedRecords,
  ]);

  const handleResetGuidedLearning = useCallback(() => {
    setNcertKb("");
    setNcertPdfUrl("");
    setNcertChapterTitle("");
    clearAllSelections();
    clearProgress();
    resetSession();
  }, [clearAllSelections, clearProgress, resetSession]);

  const handleQuizAttemptStatusChange = useCallback(
    (attempted: boolean) => {
      if (sessionState.current_index < 0) return;
      setAttemptedForStep(sessionState.current_index, attempted);
    },
    [sessionState.current_index, setAttemptedForStep],
  );

  const handleQuizScoreRecorded = useCallback(
    (score: { correct: number; total: number }) => {
      if (sessionState.current_index < 0) return;
      recordQuizScore(sessionState.current_index, score);
    },
    [sessionState.current_index, recordQuizScore],
  );

  const handleStepQuizUiStateChange = useCallback(
    (state: { selectedAnswers: (number | null)[]; quizSubmitted: boolean }) => {
      if (sessionState.current_index < 0) return;
      mergeQuizUiStep(sessionState.current_index, state);
    },
    [sessionState.current_index, mergeQuizUiStep],
  );

  /** Lock Next/Complete until quiz finishes loading, has loaded, or failed (retry). Avoids skipping KP1 while quiz is in flight. */
  const isQuizGateActive =
    sessionState.status === "learning" &&
    (stepQuizLoading ||
      stepQuizQuestions.length > 0 ||
      Boolean(stepQuizError));
  const isCurrentStepQuizAttempted = attemptedSet.has(
    sessionState.current_index,
  );
  const isNextLocked = isQuizGateActive && !isCurrentStepQuizAttempted;
  const nextLockReason = t("Attempt the step quiz to unlock Next.");

  const lessonToolbarSecondaryBtn =
    "inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm";

  const showFloatingRightPanelControls =
    sessionState.status === "idle" ||
    sessionState.status === "initialized";

  const sidebarLayoutButtons = (
    <>
      <button
        type="button"
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shrink-0"
        title={
          sidebarCollapsed ? t("Expand sidebar") : t("Collapse sidebar")
        }
      >
        {sidebarCollapsed ? (
          <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        ) : (
          <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        )}
      </button>
      {!sidebarCollapsed && (
        <button
          type="button"
          onClick={() => setSidebarWide(!sidebarWide)}
          className="p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shrink-0"
          title={
            sidebarWide
              ? t("Switch to narrow sidebar (1:3)")
              : t("Switch to wide sidebar (3:1)")
          }
        >
          <ArrowRight
            className={`w-4 h-4 text-slate-600 dark:text-slate-300 transition-transform ${sidebarWide ? "rotate-180" : ""}`}
          />
        </button>
      )}
    </>
  );

  const currentTopicTitle =
    sessionState.current_index >= 0 &&
    sessionState.knowledge_points[sessionState.current_index]
      ? sessionState.knowledge_points[sessionState.current_index]!.knowledge_title
      : "";

  const embeddedOutlineStatus =
    sessionState.status === "completed"
      ? ("completed" as const)
      : sessionState.status === "learning"
        ? ("learning" as const)
        : ("initialized" as const);

  return (
    <div className="h-full min-h-0 max-h-full overflow-hidden flex flex-col xl:flex-row-reverse xl:gap-4 gap-0 p-3 sm:p-4 relative">
      {/* SIDE RAIL: progress, outline, assistant — visually on the right at xl */}
      <div
        style={sidebarRailStyle}
        className={`flex flex-col gap-4 h-full xl:max-h-full min-h-0 overflow-y-auto shrink-0 transition-[width,min-width,max-width] duration-300 ${
          sidebarCollapsed
            ? "w-0 min-w-0 max-w-0 overflow-hidden"
            : "w-full max-w-full max-h-[42vh] border-b border-slate-200 dark:border-slate-700 pb-3 mb-1 xl:max-h-full xl:border-b-0 xl:pb-0 xl:mb-0 xl:w-[var(--guide-sidebar-pct)] xl:min-w-[var(--guide-sidebar-min)] xl:max-w-[var(--guide-sidebar-pct)]"
        }`}
      >
        {/* NCERT chapter + multi-notebook selection */}
        {sessionState.status === "idle" && (
          <div className="flex flex-col gap-4 min-h-0">
            <GuideNcertPanel
              selectedKb={ncertKb}
              selectedPdfUrl={ncertPdfUrl}
              onSelectKb={handleNcertSelectKb}
              onSelectPdf={handleNcertSelectPdf}
            />
            <NotebookSelector
              notebooks={notebooks}
              expandedNotebooks={expandedNotebooks}
              notebookRecordsMap={notebookRecordsMap}
              selectedRecords={selectedRecords}
              loadingNotebooks={loadingNotebooks}
              loadingRecordsFor={loadingRecordsFor}
              isLoading={isLoading}
              onToggleExpanded={toggleNotebookExpanded}
              onToggleRecord={handleToggleRecord}
              onSelectAll={handleSelectAllNotebooks}
              onDeselectAll={handleDeselectAllNotebooks}
              onClearAll={handleClearAllSources}
              planItemCount={planItemCount}
              onCreateSession={handleGenerateLearningPlan}
            />
          </div>
        )}

        {/* Progress Bar with Action Buttons */}
        {sessionState.status !== "idle" && (
          <ProgressPanel
            sessionState={sessionState}
            isLoading={isLoading}
            loadingAction={loadingAction}
            canStart={canStart}
            canPrev={canPrev}
            canNext={canNext}
            isCompleted={isCompleted}
            isLastKnowledge={isLastKnowledge}
            nextLocked={isNextLocked}
            nextLockReason={nextLockReason}
            onStartLearning={startLearning}
            onPreviousKnowledge={previousKnowledge}
            onNextKnowledge={nextKnowledge}
            onReset={handleResetGuidedLearning}
          />
        )}

        {sessionState.status !== "idle" && (
          <GuidePathAssistantPanel
            key={sessionState.session_id ?? "guide-idle"}
            knowledgePoints={sessionState.knowledge_points}
            currentIndex={sessionState.current_index}
            status={embeddedOutlineStatus}
            attemptedQuizSteps={attemptedSet}
            scoresByStep={scoresByStep}
            messages={chatMessages}
            isLearning={sessionState.status === "learning"}
            onSendMessage={sendMessage}
          />
        )}
      </div>

      {/* MAIN: lesson + quiz — visually left at xl so it sits nearer the center */}
      <div
        style={mainColumnStyle}
        className="flex flex-col h-full max-h-full min-h-0 min-w-0 overflow-hidden flex-1 relative xl:w-[var(--guide-main-pct)] transition-[width] duration-300"
      >
        {showFloatingRightPanelControls && (
          <div className="absolute top-4 left-6 z-20 flex gap-2 items-center">
            {sidebarLayoutButtons}
          </div>
        )}

        {/* Content based on state */}
        {sessionState.status === "idle" ? (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center text-slate-300 dark:text-slate-600 px-8 pt-14 pb-8">
            <GraduationCap className="w-24 h-24 text-slate-200 dark:text-slate-600 mb-6" />
            <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300 mb-2">
              {t("Guided Learning")}
            </h3>
            <p className="text-sm text-slate-400 dark:text-slate-500 max-w-md leading-relaxed">
              {t(
                "Select an NCERT chapter or notebook records to generate a personalized learning plan. Through interactive pages and intelligent Q&A, you'll gradually master the content.",
              )}
            </p>
          </div>
        ) : isCompleted ? (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col px-3 sm:px-4 pb-4 min-w-0 w-full">
            <CompletionSummary
              summary={sessionState.summary}
              knowledgePointsCount={sessionState.knowledge_points.length}
              onFinish={handleResetGuidedLearning}
              leadingToolbar={sidebarLayoutButtons}
              sessionTitle={ncertChapterTitle || sessionState.notebook_name}
              ncertPdfUrl={ncertPdfUrl}
            />
          </div>
        ) : sessionState.status === "initialized" ? (
          isLoading && loadingAction === "start" ? (
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center px-8 pt-14 pb-8">
              <Loader2 className="w-12 h-12 text-indigo-400 dark:text-indigo-500 animate-spin mb-4" />
              <p className="text-slate-500 dark:text-slate-400">
                {loadingMessage || t("Loading learning content...")}
              </p>
            </div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center text-slate-300 dark:text-slate-600 px-8 pt-14 pb-8">
              <GraduationCap className="w-24 h-24 text-slate-200 dark:text-slate-600 mb-6" />
              <h3 className="text-lg font-medium text-slate-600 dark:text-slate-300 mb-2">
                {t("guide.right_panel_ready_title")}
              </h3>
              <p className="text-sm text-slate-400 dark:text-slate-500 max-w-md leading-relaxed">
                {t("guide.right_panel_ready_hint")}
              </p>
            </div>
          )
        ) : sessionState.status === "learning" ? (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden min-w-0">
              {/* Toolbar: layout toggles + centered topic + save */}
              <div className="flex-shrink-0 z-10 mt-2 flex items-center gap-2 w-full min-w-0 px-2 sm:px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm overflow-x-auto">
                <div className="flex shrink-0 items-center gap-2">
                  {sidebarLayoutButtons}
                </div>
                <div className="flex-1 min-w-[10rem] flex justify-center px-1 sm:px-2">
                  <div className="min-w-0 max-w-full text-center">
                    {currentTopicTitle ? (
                      <>
                        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">
                          {currentTopicTitle}
                        </p>
                        {sessionState.knowledge_points.length > 0 && (
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                            {t("Knowledge Point {n} / {total}")
                              .replace(
                                "{n}",
                                String(sessionState.current_index + 1),
                              )
                              .replace(
                                "{total}",
                                String(sessionState.knowledge_points.length),
                              )}
                          </p>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1.5 sm:gap-2">
                  <button
                    type="button"
                    onClick={handleSaveToNotebook}
                    className={lessonToolbarSecondaryBtn}
                    title={t("Save to Notebook")}
                  >
                    <BookmarkPlus className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">
                      {t("Save to notebook")}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={handleResetGuidedLearning}
                    disabled={isLoading}
                    className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 border border-slate-300 dark:border-slate-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    title={t("New Session")}
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" aria-hidden />
                    <span className="hidden sm:inline">{t("New")}</span>
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden pt-2 pb-3">
                <div className="w-full min-w-0 space-y-3">
                  <HTMLViewer
                    html={sessionState.current_html}
                    currentIndex={sessionState.current_index}
                    loadingMessage={loadingMessage}
                  />
                  {isNextLocked && isQuizGateActive && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/35 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
                    >
                      {t("guide.quiz_gate_banner")}
                    </div>
                  )}
                  <StepQuizPanel
                    stepKey={sessionState.current_index}
                    questions={stepQuizQuestions}
                    encouragement={stepQuizEncouragement}
                    loading={stepQuizLoading}
                    error={stepQuizError}
                    onQuizAttemptStatusChange={handleQuizAttemptStatusChange}
                    onQuizScoreRecorded={handleQuizScoreRecorded}
                    persistedState={quizUiByStep[sessionState.current_index]}
                    onPersistedStateChange={handleStepQuizUiStateChange}
                    canMoveToNext={canNext || isLastKnowledge}
                    isLastKnowledge={isLastKnowledge}
                    onMoveToNext={nextKnowledge}
                    moveToNextLoading={isLoading && loadingAction === "next"}
                    onRetry={() => {
                      if (sessionState.session_id) {
                        void fetchStepQuiz(sessionState.session_id);
                      }
                    }}
                  />
                </div>
              </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col items-center justify-center text-center px-8 pt-14 pb-8">
            <Loader2 className="w-12 h-12 text-indigo-400 dark:text-indigo-500 animate-spin mb-4" />
            <p className="text-slate-500 dark:text-slate-400">
              {loadingMessage || t("Loading learning content...")}
            </p>
          </div>
        )}
      </div>

      {/* Save to Notebook Modal */}
      {notebookRecord && (
        <AddToNotebookModal
          isOpen={showNotebookModal}
          onClose={() => setShowNotebookModal(false)}
          recordType="chat"
          title={notebookRecord.title}
          userQuery={notebookRecord.userQuery}
          output={notebookRecord.output}
          metadata={{ source: "guided_learning", notebook_name: sessionState.notebook_name }}
        />
      )}
    </div>
  );
}
