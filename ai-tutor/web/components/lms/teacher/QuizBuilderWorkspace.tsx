"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Clock,
  Eye,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";
import TeacherListPageShell from "@/components/lms/portal/TeacherListPageShell";
import TeacherPortalListLayout from "@/components/lms/portal/TeacherPortalListLayout";
import { dashboardHeader } from "@/lib/portalDashboardUi";
import { portalList } from "@/lib/portalListUi";
import NumericStepper from "@/components/lms/teacher/NumericStepper";
import NCERTRagDropdown from "@/components/NCERTRagDropdown";
import QuizQuestionFormModal from "@/components/lms/teacher/QuizQuestionFormModal";
import QuizPreviewPanel from "@/components/lms/teacher/QuizPreviewPanel";
import CreateAssignmentModal from "@/components/lms/teacher/CreateAssignmentModal";
import QuizStartNewConfirmDialog from "@/components/lms/teacher/QuizStartNewConfirmDialog";
import MarksStepper from "@/components/lms/teacher/MarksStepper";
import {
  createTeacherQuiz,
  fetchTeacherQuiz,
  generateQuizFromNcert,
  publishTeacherQuiz,
  updateTeacherQuiz,
} from "@/services/lmsApi";
import LmsToast from "@/components/lms/LmsToast";
import { useLmsToast } from "@/hooks/useLmsToast";
import {
  formatGenerationDuration,
  mapLoadedQuizQuestions,
  MAX_NCERT_QUIZ_GENERATE_QUESTIONS,
  newManualQuestionId,
  normalizeMcqQuestion,
  parseNcertPathFromUrl,
  totalMarks,
  type TeacherQuizQuestion,
} from "@/lib/teacherQuiz";
import { formatMcqOptionDisplay } from "@/lib/quizQuestions";
import {
  clearQuizBuilderDraft,
  clearQuizBuilderDraftForQuiz,
  EMPTY_QUIZ_BUILDER_DRAFT,
  loadQuizBuilderDraft,
  saveQuizBuilderDraft,
  type QuizBuilderDraft,
  type QuizBuilderSaveStatus,
} from "@/lib/quizBuilderDraft";
import { useAuthStore } from "@/store/authStore";
import { useTeacherClassStore } from "@/store/teacherClassStore";
import { usePortalStore } from "@/store/portalStore";

type ManifestFiles = Record<
  string,
  Record<string, { url: string; label: string }[]>
>;

export default function QuizBuilderWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loadQuizId = (() => {
    const raw = searchParams.get("quiz_id")?.trim() || null;
    if (!raw || raw === "new") return null;
    return raw;
  })();
  const userId = useAuthStore((s) => s.user?.id);
  const classId = useTeacherClassStore((s) => s.classId);
  const deletedQuizId = usePortalStore((s) => s.deletedQuizId);
  const clearDeletedQuizNotify = usePortalStore((s) => s.clearDeletedQuizNotify);
  const persistReady = useRef(false);
  const skipPersist = useRef(false);
  /** Skip server refetch when URL syncs right after a local save (avoids stuck loading state). */
  const justSavedQuizIdRef = useRef<string | null>(null);
  const [manifest, setManifest] = useState<ManifestFiles | null>(null);
  const [loadingQuiz, setLoadingQuiz] = useState(Boolean(loadQuizId));
  const [continuingDraft, setContinuingDraft] = useState(false);
  const [pdfUrl, setPdfUrl] = useState("");
  const [chapterLabel, setChapterLabel] = useState("");
  const [ncertClass, setNcertClass] = useState("");
  const [subject, setSubject] = useState("Science");
  const [questionCount, setQuestionCount] = useState(5);
  const [marksPerQuestion, setMarksPerQuestion] = useState(1);
  const [examDurationMins, setExamDurationMins] = useState(30);
  const [questions, setQuestions] = useState<TeacherQuizQuestion[]>([]);
  const [quizTitle, setQuizTitle] = useState("");
  const [savedQuizId, setSavedQuizId] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<QuizBuilderSaveStatus>(null);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast, showSuccess, showError } = useLmsToast();
  const [error, setError] = useState<string | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewMinimized, setPreviewMinimized] = useState(false);
  const [editQuestion, setEditQuestion] = useState<TeacherQuizQuestion | null>(
    null,
  );
  const [showManualModal, setShowManualModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [showNewConfirm, setShowNewConfirm] = useState(false);

  const buildDraft = useCallback(
    (): QuizBuilderDraft => ({
      pdfUrl,
      chapterLabel,
      ncertClass,
      subject,
      questionCount,
      marksPerQuestion,
      examDurationMins,
      questions,
      quizTitle,
      savedQuizId,
      saveStatus,
    }),
    [
      pdfUrl,
      chapterLabel,
      ncertClass,
      subject,
      questionCount,
      marksPerQuestion,
      examDurationMins,
      questions,
      quizTitle,
      savedQuizId,
      saveStatus,
    ],
  );

  const applyDraft = useCallback((draft: QuizBuilderDraft) => {
    skipPersist.current = true;
    setPdfUrl(draft.pdfUrl);
    setChapterLabel(draft.chapterLabel);
    setNcertClass(draft.ncertClass);
    setSubject(draft.subject);
    setQuestionCount(
      Math.min(
        MAX_NCERT_QUIZ_GENERATE_QUESTIONS,
        Math.max(1, draft.questionCount),
      ),
    );
    setMarksPerQuestion(draft.marksPerQuestion);
    setExamDurationMins(draft.examDurationMins);
    setQuestions(draft.questions);
    setQuizTitle(draft.quizTitle);
    setSavedQuizId(draft.savedQuizId);
    setSaveStatus(draft.saveStatus);
    setPreviewIndex(0);
    setError(null);
  }, []);

  const resetWorkspace = useCallback(() => {
    skipPersist.current = true;
    const empty = EMPTY_QUIZ_BUILDER_DRAFT;
    setPdfUrl(empty.pdfUrl);
    setChapterLabel(empty.chapterLabel);
    setNcertClass(empty.ncertClass);
    setSubject(empty.subject);
    setQuestionCount(empty.questionCount);
    setMarksPerQuestion(empty.marksPerQuestion);
    setExamDurationMins(empty.examDurationMins);
    setQuestions(empty.questions);
    setQuizTitle(empty.quizTitle);
    setSavedQuizId(empty.savedQuizId);
    setSaveStatus(empty.saveStatus);
    setPreviewIndex(0);
    setError(null);
    setContinuingDraft(false);
  }, []);

  useEffect(() => {
    fetch("/ncert/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setManifest)
      .catch(() => setManifest(null));
  }, []);

  const clearStaleDeletedQuiz = useCallback(
    (quizId: string, message?: string) => {
      clearQuizBuilderDraftForQuiz(userId, quizId);
      clearQuizBuilderDraft(userId);
      skipPersist.current = true;
      resetWorkspace();
      if (loadQuizId === quizId) {
        router.replace("/teacher/quiz-builder");
      }
      if (message) {
        setError(message);
        showError(message);
      }
    },
    [userId, loadQuizId, resetWorkspace, router, showError],
  );

  useEffect(() => {
    if (!deletedQuizId) return;
    const activeId = loadQuizId || savedQuizId;
    if (activeId === deletedQuizId || savedQuizId === deletedQuizId) {
      clearStaleDeletedQuiz(
        deletedQuizId,
        "This quiz was deleted from Quizzes. Quiz Builder cleared.",
      );
    }
    clearDeletedQuizNotify();
  }, [
    deletedQuizId,
    loadQuizId,
    savedQuizId,
    clearStaleDeletedQuiz,
    clearDeletedQuizNotify,
  ]);

  useEffect(() => {
    if (loadQuizId) return;
    let cancelled = false;

    async function hydrateFromDraft() {
      setLoadingQuiz(true);
      const draft = loadQuizBuilderDraft(userId);
      if (!draft) {
        if (!cancelled) {
          persistReady.current = true;
          setLoadingQuiz(false);
        }
        return;
      }

      if (draft.savedQuizId) {
        try {
          await fetchTeacherQuiz(draft.savedQuizId);
          if (cancelled) return;
          applyDraft(draft);
          setContinuingDraft(true);
        } catch {
          if (cancelled) return;
          clearQuizBuilderDraft(userId);
          resetWorkspace();
          showError(
            "Saved quiz was deleted from Quizzes. Start a new quiz or pick another from Quizzes.",
          );
        }
      } else {
        applyDraft(draft);
        setContinuingDraft(true);
      }

      if (!cancelled) {
        persistReady.current = true;
        setLoadingQuiz(false);
      }
    }

    hydrateFromDraft();
    return () => {
      cancelled = true;
    };
  }, [loadQuizId, userId, applyDraft, resetWorkspace, showError]);

  useEffect(() => {
    if (!loadQuizId) return;
    if (loadQuizId === justSavedQuizIdRef.current) {
      justSavedQuizIdRef.current = null;
      if (savedQuizId !== loadQuizId) {
        setSavedQuizId(loadQuizId);
      }
      persistReady.current = true;
      setLoadingQuiz(false);
      return;
    }
    if (loadQuizId === savedQuizId && questions.length > 0) {
      persistReady.current = true;
      setLoadingQuiz(false);
      return;
    }
    let cancelled = false;
    setLoadingQuiz(true);
    setContinuingDraft(false);
    setError(null);
    fetchTeacherQuiz(loadQuizId)
      .then((quiz) => {
        if (cancelled) return;
        skipPersist.current = true;
        setSavedQuizId(quiz.id);
        setSaveStatus(quiz.status === "published" ? "published" : "draft");
        setQuizTitle(quiz.title);
        setSubject(quiz.subject || "Science");
        setExamDurationMins(quiz.duration_mins || 30);
        setQuestions(mapLoadedQuizQuestions(quiz.questions));
        if (quiz.pdf_url) setPdfUrl(quiz.pdf_url);
        if (quiz.chapter_label) setChapterLabel(quiz.chapter_label);
        if (quiz.ncert_class) setNcertClass(quiz.ncert_class);
        setPreviewIndex(0);
      })
      .catch((e) => {
        if (cancelled) return;
        clearStaleDeletedQuiz(
          loadQuizId,
          "This quiz was deleted from Quizzes. Quiz Builder cleared.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingQuiz(false);
          persistReady.current = true;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadQuizId, savedQuizId, questions.length, clearStaleDeletedQuiz]);

  useEffect(() => {
    if (!persistReady.current || loadingQuiz) return;
    const timer = window.setTimeout(() => {
      if (skipPersist.current) {
        skipPersist.current = false;
        return;
      }
      saveQuizBuilderDraft(userId, buildDraft());
    }, 400);
    return () => window.clearTimeout(timer);
  }, [buildDraft, userId, loadingQuiz]);

  function closeFullPreview() {
    setShowFullPreview(false);
    setPreviewExpanded(false);
    setPreviewMinimized(false);
  }

  function openFullPreview() {
    setPreviewExpanded(false);
    setPreviewMinimized(false);
    setShowFullPreview(true);
  }

  function confirmStartNew() {
    justSavedQuizIdRef.current = null;
    closeFullPreview();
    clearQuizBuilderDraft(userId);
    resetWorkspace();
    setShowNewConfirm(false);
    if (loadQuizId) {
      router.replace("/teacher/quiz-builder");
    }
    showSuccess("New quiz started");
  }

  function handleStartNew() {
    closeFullPreview();
    const hasWork =
      questions.length > 0 ||
      Boolean(quizTitle.trim()) ||
      Boolean(pdfUrl) ||
      Boolean(savedQuizId);
    if (hasWork) {
      setShowNewConfirm(true);
      return;
    }
    confirmStartNew();
  }

  const handleSelectPdf = (url: string, label: string) => {
    setPdfUrl(url);
    setChapterLabel(label);
    const parsed = parseNcertPathFromUrl(url, manifest);
    if (parsed) {
      setNcertClass(parsed.ncertClass);
      setSubject(parsed.subject);
      if (!quizTitle) {
        setQuizTitle(label);
      }
    }
  };

  async function handleGenerate() {
    if (!pdfUrl || !chapterLabel.trim()) {
      setError("Select an NCERT chapter PDF first.");
      return;
    }
    setGenerating(true);
    setError(null);
    const startedAt = performance.now();
    try {
      const res = await generateQuizFromNcert({
        chapter_label: chapterLabel,
        subject,
        pdf_url: pdfUrl,
        ncert_class: ncertClass || undefined,
        count: questionCount,
        title: quizTitle || undefined,
      });
      if (!res.success || !res.questions?.length) {
        throw new Error(res.error || "No questions generated");
      }
      const generated = (res.questions as TeacherQuizQuestion[]).map((q) =>
        normalizeMcqQuestion({
          ...q,
          marks: marksPerQuestion,
        }),
      );
      setQuestions(generated);
      setExamDurationMins(Math.max(15, questionCount * 3));
      if (res.suggested_title && !quizTitle) {
        setQuizTitle(res.suggested_title);
      }
      setPreviewIndex(0);
      const elapsedSecs =
        res.duration_secs ?? (performance.now() - startedAt) / 1000;
      const timeLabel = formatGenerationDuration(elapsedSecs);
      const timePart = timeLabel ? ` in ${timeLabel}` : "";
      const countPart =
        res.failed && res.failed > 0
          ? `${res.completed}/${res.requested} questions`
          : `${res.completed} questions`;
      showSuccess(
        `Generated ${countPart}${timePart} · ${marksPerQuestion} mark${marksPerQuestion === 1 ? "" : "s"} each`,
      );
      if (res.failed && res.failed > 0) {
        showError(
          `${res.failed} question(s) failed after retries — try Generate again or lower the count.`,
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Generation failed";
      setError(msg);
      showError(msg);
    } finally {
      setGenerating(false);
    }
  }

  async function persistQuiz(
    publish: boolean,
    options?: { syncUrl?: boolean },
  ): Promise<string | null> {
    if (!questions.length) {
      const msg = "Add at least one question before saving.";
      setError(msg);
      showError(msg);
      return null;
    }
    const title = quizTitle.trim() || `${subject} Quiz`;
    const marks = totalMarks(questions);
    const body = {
      title,
      subject,
      duration_mins: Math.min(180, Math.max(5, examDurationMins)),
      total_marks: marks,
      questions,
      ncert_class: ncertClass || undefined,
      chapter_label: chapterLabel || undefined,
      // kb_name intentionally omitted so the backend resolves it from ncert_class + subject
      pdf_url: pdfUrl || undefined,
    };
    setSaving(true);
    setError(null);
    try {
      let quizId = savedQuizId;
      if (quizId) {
        await updateTeacherQuiz(quizId, body);
      } else {
        const created = await createTeacherQuiz(body);
        quizId = created.id;
        setSavedQuizId(quizId);
      }
      if (publish && quizId) {
        await publishTeacherQuiz(quizId);
      }
      const nextStatus: QuizBuilderSaveStatus = publish
        ? "published"
        : saveStatus === "published"
          ? "published"
          : "draft";
      setSaveStatus(nextStatus);

      if (quizId) {
        justSavedQuizIdRef.current = quizId;
        skipPersist.current = true;
        saveQuizBuilderDraft(userId, {
          ...buildDraft(),
          savedQuizId: quizId,
          saveStatus: nextStatus,
        });
        if (loadQuizId !== quizId && options?.syncUrl !== false) {
          router.replace(
            `/teacher/quiz-builder?quiz_id=${encodeURIComponent(quizId)}`,
            { scroll: false },
          );
        }
      }
      return quizId;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      setError(msg);
      showError(msg);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveDraft() {
    const id = await persistQuiz(false, { syncUrl: false });
    if (id) {
      clearQuizBuilderDraft(userId);
      justSavedQuizIdRef.current = null;
      showSuccess("Draft saved — listed under Drafts");
      router.push("/teacher/quizzes?tab=draft");
    }
  }

  async function handleSaveQuiz() {
    const id = await persistQuiz(true, { syncUrl: false });
    if (id) {
      clearQuizBuilderDraft(userId);
      justSavedQuizIdRef.current = null;
      showSuccess("Quiz published — listed under Ready to assign");
      router.push("/teacher/quizzes?tab=ready&ready=not_assigned");
    }
  }

  async function handleSaveAndAssign() {
    const id = await persistQuiz(true);
    if (id) {
      setSavedQuizId(id);
      setShowAssignModal(true);
    }
  }

  function handleDeleteQuestion(id: string) {
    setQuestions((prev) => prev.filter((q) => q.id !== id));
  }

  function updateQuestionMarks(id: string, marks: number) {
    setQuestions((prev) =>
      prev.map((q) => (q.id === id ? { ...q, marks } : q)),
    );
  }

  function handleSaveQuestion(q: TeacherQuizQuestion) {
    const normalized =
      q.type === "mcq" ? normalizeMcqQuestion(q) : q;
    setQuestions((prev) => {
      const idx = prev.findIndex((x) => x.id === normalized.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = normalized;
        return next;
      }
      return [...prev, normalized];
    });
  }

  const marks = totalMarks(questions);

  const builderSubtitle =
    loadQuizId && savedQuizId
      ? `Editing saved quiz · ${saveStatus === "published" ? "Published" : "Draft"}`
      : continuingDraft
        ? "Continuing your last session · use + New to start fresh"
        : null;

  const pageSubtitle = builderSubtitle ? (
    <span className="block">{builderSubtitle}</span>
  ) : undefined;

  const toolbarActions = (
    <>
      <button
        type="button"
        onClick={handleStartNew}
        className={dashboardHeader.secondaryBtn}
      >
        <Plus className="h-4 w-4" aria-hidden />
        New
      </button>
      <button
        type="button"
        onClick={openFullPreview}
        disabled={!questions.length}
        className={`${dashboardHeader.secondaryBtn} disabled:opacity-40`}
      >
        <Eye className="h-4 w-4" aria-hidden />
        Preview
      </button>
      <button
        type="button"
        disabled={saving || !questions.length}
        onClick={handleSaveDraft}
        className={`${dashboardHeader.secondaryBtn} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : null}
        Save draft
      </button>
      <button
        type="button"
        disabled={saving || !questions.length}
        onClick={handleSaveQuiz}
        className={`${dashboardHeader.primaryBtn} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : null}
        Save quiz
      </button>
      <button
        type="button"
        disabled={saving || !questions.length}
        onClick={handleSaveAndAssign}
        className={`${dashboardHeader.accentBtn} disabled:cursor-not-allowed disabled:opacity-40`}
      >
        {saving ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : null}
        Save &amp; go to Assignment
      </button>
    </>
  );

  return (
    <>
      <LmsToast toast={toast} theme="light" />

      <TeacherPortalListLayout toolbarEnd={toolbarActions}>
        <TeacherListPageShell
          title="Quiz Builder"
          titleInShell
          subtitle={pageSubtitle}
        >
        {savedQuizId && saveStatus ? (
          <div
            className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
            role="status"
          >
            <p className="font-medium">
              {saveStatus === "draft"
                ? "Draft saved to your account"
                : "Quiz published and ready to assign"}
            </p>
            <p className="mt-1 text-emerald-800/90">
              {saveStatus === "published" ? (
                <>
                  <Link
                    href={`/teacher/quizzes?tab=ready&create=1&quiz_id=${encodeURIComponent(savedQuizId)}`}
                    className="font-medium text-emerald-700 underline-offset-2 hover:underline"
                  >
                    Assign to class
                  </Link>{" "}
                  from Quizzes
                </>
              ) : (
                <Link
                  href="/teacher/quizzes?tab=draft"
                  className="font-medium text-emerald-700 underline-offset-2 hover:underline"
                >
                  View in Quizzes
                </Link>
              )}
            </p>
          </div>
        ) : null}

        {loadingQuiz ? (
          <div className="mb-6 flex items-center gap-2 rounded-xl border border-slate-100/80 bg-white px-4 py-6 text-sm text-slate-500 shadow-sm">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            Loading quiz…
          </div>
        ) : null}

        <div
          className={`grid gap-6 lg:grid-cols-5 ${loadingQuiz ? "pointer-events-none opacity-50" : ""}`}
        >
          <div className="space-y-6 lg:col-span-3">
            <section className={`${portalList.filterPanel} space-y-3`}>
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 shrink-0 text-indigo-600" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Generate questions from NCERT
                </h2>
              </div>

              <div className="space-y-3">
                <NCERTRagDropdown
                  kbs={(() => {
                    const n = ncertClass?.replace("class-", "").replace("Class ", "").trim();
                    const subj = subject?.toLowerCase().replace(/\s+/g, "-");
                    if (n && subj) return [{ name: `ncert-class-${n}-${subj}` }];
                    if (n) return [{ name: `ncert-class-${n}` }];
                    return [{ name: "ncert-class-8" }];
                  })()}
                  selectedPdfUrl={pdfUrl}
                  onSelectKb={() => {}}
                  onSelectPdf={handleSelectPdf}
                />

                <input
                  value={quizTitle}
                  onChange={(e) => setQuizTitle(e.target.value)}
                  aria-label="Quiz title"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  placeholder="Quiz title (e.g. Maths — Coordinate Geometry)"
                />

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="text-xs font-medium text-slate-600">
                      Questions
                      <span className="ml-1 font-normal text-slate-400">
                        (max {MAX_NCERT_QUIZ_GENERATE_QUESTIONS} AI)
                      </span>
                    </label>
                    <div className="mt-1">
                      <NumericStepper
                        value={questionCount}
                        onChange={setQuestionCount}
                        min={1}
                        max={MAX_NCERT_QUIZ_GENERATE_QUESTIONS}
                        ariaLabel="Number of questions"
                        compact
                      />
                    </div>
                  </div>
                  <div>
                    <MarksStepper
                      value={marksPerQuestion}
                      onChange={setMarksPerQuestion}
                      min={1}
                      max={10}
                      label="Marks each"
                      hint=""
                      compact
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-slate-600">
                      Time (min)
                    </label>
                    <div className="mt-1">
                      <NumericStepper
                        value={examDurationMins}
                        onChange={setExamDurationMins}
                        min={5}
                        max={180}
                        ariaLabel="Exam minutes"
                        compact
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                  {[15, 30, 45, 60, 90, 120].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setExamDurationMins(m)}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        examDurationMins === m
                          ? "bg-indigo-600 text-white"
                          : "border border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:bg-indigo-50"
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                  <span className="text-[10px] text-slate-400">
                    · tip {Math.max(15, questionCount * 3)}m for {questionCount} Qs
                  </span>
                </div>

                <button
                  type="button"
                  disabled={generating || !pdfUrl}
                  onClick={handleGenerate}
                  className={`${dashboardHeader.primaryBtn} w-full justify-center disabled:cursor-not-allowed disabled:opacity-50`}
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating {questionCount} questions…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate from NCERT
                    </>
                  )}
                </button>
              </div>
            </section>

            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
                {error}
              </p>
            ) : null}

            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold tracking-tight text-slate-900">
                Questions ({questions.length}) · {marks} marks
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditQuestion(null);
                  setShowManualModal(true);
                }}
                className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                + Add manually
              </button>
            </div>

            {questions.length > 0 ? (
              <div className={`${portalList.listPanel} pb-1`}>
                <ul className="divide-y divide-slate-100">
              {questions.map((q, idx) => (
                <li
                  key={q.id}
                  className="px-4 py-4 sm:px-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-medium text-slate-500">
                          Q{idx + 1}
                        </span>
                        {q.source === "ncert_ai" ? (
                          <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                            NCERT AI
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                            Manual
                          </span>
                        )}
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                          {q.marks || 1} mark{(q.marks || 1) === 1 ? "" : "s"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-slate-800">{q.text}</p>
                      {q.options?.length ? (
                        <ul className="mt-2 text-xs text-slate-600">
                          {q.options.map((o, oi) => (
                            <li key={`${q.id}-opt-${oi}`}>
                              {o === q.correct_answer ? "✓ " : "· "}
                              {formatMcqOptionDisplay(oi, o)}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="mt-3">
                        <MarksStepper
                          compact
                          label="Marks"
                          hint=""
                          value={q.marks || 1}
                          onChange={(m) => updateQuestionMarks(q.id, m)}
                        />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditQuestion(q);
                          setShowManualModal(true);
                        }}
                        className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteQuestion(q.id)}
                        className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-xl border border-slate-200/90 bg-white px-4 py-8 text-center text-sm text-slate-500 shadow-sm">
                Select a chapter and click Generate from NCERT, or add a question
                manually.
              </p>
            )}
          </div>

          <div className="lg:col-span-2">
            <QuizPreviewPanel
              title={quizTitle}
              questions={questions}
              previewIndex={previewIndex}
              onPreviewIndex={setPreviewIndex}
            />
          </div>
        </div>
        </TeacherListPageShell>
      </TeacherPortalListLayout>

      {showFullPreview && previewMinimized ? (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-[min(100vw-2rem,22rem)] items-center gap-2 rounded-xl border border-slate-200/90 bg-white py-2 pl-3 pr-2 shadow-lg">
          <Eye className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
          <button
            type="button"
            onClick={() => setPreviewMinimized(false)}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-900 hover:text-indigo-700"
            title={quizTitle || "Quiz preview"}
          >
            {quizTitle || "Quiz preview"}
          </button>
          <button
            type="button"
            onClick={() => setPreviewMinimized(false)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Restore preview"
            title="Restore"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={closeFullPreview}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close preview"
            title="Close"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>
      ) : null}

      {showFullPreview && !previewMinimized ? (
        <div
          className={`fixed inset-0 z-50 flex overflow-hidden bg-slate-900/40 backdrop-blur-[2px] portal-modal-overlay-enter ${
            previewExpanded ? "p-2 sm:p-3" : "items-center justify-center p-4"
          }`}
          role="presentation"
          onClick={closeFullPreview}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="quiz-full-preview-title"
            className={`grid w-full overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl transition-all duration-200 ${
              previewExpanded
                ? "h-full max-w-none grid-rows-[auto_minmax(0,1fr)_auto]"
                : "h-[85vh] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="z-10 border-b border-slate-200/90 bg-slate-50/80 px-6 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2
                    id="quiz-full-preview-title"
                    className="pr-2 text-lg font-bold leading-snug text-slate-900"
                  >
                    {quizTitle || "Quiz preview"}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {subject || "General"} · {questions.length} question
                    {questions.length === 1 ? "" : "s"} · {marks} marks ·{" "}
                    {examDurationMins} min
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewMinimized(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-800 transition-colors hover:bg-slate-200/80 hover:text-slate-950"
                    aria-label="Minimize preview"
                    title="Minimize"
                  >
                    <Minus className="h-4 w-4" strokeWidth={2.25} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewExpanded((v) => !v)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-800 transition-colors hover:bg-slate-200/80 hover:text-slate-950"
                    aria-label={
                      previewExpanded ? "Exit expanded preview" : "Expand preview"
                    }
                    title={previewExpanded ? "Minimize size" : "Expand"}
                  >
                    {previewExpanded ? (
                      <Minimize2 className="h-4 w-4" strokeWidth={2.25} />
                    ) : (
                      <Maximize2 className="h-4 w-4" strokeWidth={2.25} />
                    )}
                  </button>
                  <ModalCloseButton
                    onClick={closeFullPreview}
                    absolute={false}
                    className="text-slate-800 border-slate-300 hover:text-slate-950"
                    aria-label="Close preview"
                  />
                </div>
              </div>
            </header>

            <div className="overflow-y-auto overscroll-y-contain px-6 py-4">
              <section>
                <h3 className="text-sm font-semibold text-indigo-600">
                  Questions · MCQ
                </h3>
                <ol
                  className={`mt-4 space-y-5 ${
                    previewExpanded ? "mx-auto max-w-3xl" : ""
                  }`}
                >
                  {questions.map((q, i) => (
                    <li key={q.id}>
                      <p className="text-sm font-medium text-indigo-600">
                        Question {i + 1}
                      </p>
                      <p className="mt-1 font-medium text-slate-900">{q.text}</p>
                      <ul className="mt-2 space-y-1">
                        {(q.options || []).map((o, oi) => (
                          <li
                            key={`${q.id}-prev-${oi}`}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                          >
                            {formatMcqOptionDisplay(oi, o)}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <footer className="z-10 border-t border-slate-200/90 bg-slate-50/80 px-6 py-4">
              <button
                type="button"
                onClick={closeFullPreview}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      <QuizQuestionFormModal
        open={showManualModal}
        initial={editQuestion}
        defaultMarks={marksPerQuestion}
        onClose={() => {
          setShowManualModal(false);
          setEditQuestion(null);
        }}
        onSave={(q) => {
          if (!editQuestion && !q.id.startsWith("q-")) {
            q.id = newManualQuestionId();
          }
          handleSaveQuestion(q);
        }}
      />

      <CreateAssignmentModal
        open={showAssignModal}
        quizId={savedQuizId || ""}
        defaultTitle={quizTitle}
        defaultSubject={subject}
        defaultMarks={marks}
        defaultDuration={examDurationMins}
        classId={classId}
        onClose={() => setShowAssignModal(false)}
        onCreated={(id) => {
          setShowAssignModal(false);
          showSuccess("Assignment created — highlighted in Quizzes");
          router.push(`/teacher/quizzes?tab=live&highlight=${encodeURIComponent(id)}`);
        }}
      />

      <QuizStartNewConfirmDialog
        open={showNewConfirm}
        onConfirm={confirmStartNew}
        onCancel={() => setShowNewConfirm(false)}
      />
    </>
  );
}
