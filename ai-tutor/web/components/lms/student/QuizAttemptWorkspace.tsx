"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QuizStartModal from "@/components/lms/student/QuizStartModal";
import QuizSubmitConfirmDialog from "@/components/lms/student/QuizSubmitConfirmDialog";
import StudentQuizAttemptToolbar from "@/components/lms/student/StudentQuizAttemptToolbar";
import StudentQuizQuestionNav from "@/components/lms/student/StudentQuizQuestionNav";
import { StudentQuizSubmitFooter } from "@/components/lms/student/StudentQuizSubmitFooter";
import StudentQuizQuestionBlock, {
  StudentQuizQuestionDivider,
} from "@/components/lms/student/StudentQuizQuestionBlock";
import LmsToast from "@/components/lms/LmsToast";
import {
  QuizErrorBanner,
  QuizErrorState,
  QuizLoadingState,
} from "@/components/lms/student/QuizPageStates";
import { studentQuizAttemptUi } from "@/lib/studentQuizAttemptUi";
import { useLmsToast } from "@/hooks/useLmsToast";
import type { QuizQuestion } from "@/lib/quizQuestions";
import {
  notifyDashboardRefresh,
  setQuizFocusMode,
} from "@/lib/studentQuizSession";
import { saveQuizResult } from "@/lib/quizResultStorage";
import {
  fetchStudentAssignment,
  saveQuizAttemptDraft,
  startQuizAttempt,
  submitQuizAttempt,
  type AssignmentItem,
} from "@/services/lmsApi";

type Phase = "loading" | "intro" | "attempt" | "blocked";

/**
 * Full quiz attempt flow: intro modal → all questions on one scrollable page → confirm submit.
 */
export default function QuizAttemptWorkspace({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const router = useRouter();
  const { toast, showSuccess, showError } = useLmsToast();
  const [phase, setPhase] = useState<Phase>("loading");
  const [meta, setMeta] = useState<AssignmentItem | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [markedForReview, setMarkedForReview] = useState<Set<string>>(new Set());
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [attemptNumber, setAttemptNumber] = useState(1);

  const beginAttempt = useCallback(async (assignment: AssignmentItem) => {
    setPhase("loading");
    setError(null);
    try {
      const started = await startQuizAttempt(assignmentId);
      const qs = started.questions as QuizQuestion[];
      setQuestions(qs);
      setAttemptNumber(started.attempt_number);
      setSecondsLeft(started.duration_mins * 60);

      const initial: Record<string, string> = {};
      for (const q of qs) {
        initial[q.id] = "";
      }
      for (const row of started.saved_answers ?? []) {
        const qid = row.question_id as string;
        if (qid) initial[qid] = String(row.answer ?? "");
      }
      setAnswers(initial);

      const review = new Set<string>(
        (started.marked_for_review ?? []) as string[],
      );
      setMarkedForReview(review);

      setMeta(assignment);
      setPhase("attempt");
      setQuizFocusMode(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to start quiz";
      setPhase("blocked");
      setError(msg);
      showError(msg);
      setQuizFocusMode(false);
    }
  }, [assignmentId, showError]);

  const loadIntro = useCallback(async () => {
    setPhase("loading");
    setError(null);
    try {
      const detail = await fetchStudentAssignment(assignmentId);
      setMeta(detail.assignment);

      if (
        !detail.assignment.can_attempt &&
        !detail.in_progress &&
        detail.assignment.status !== "in_progress"
      ) {
        setPhase("blocked");
        setError("You cannot attempt this quiz anymore.");
        return;
      }

      if (detail.in_progress || detail.assignment.status === "in_progress") {
        await beginAttempt(detail.assignment);
        return;
      }

      setPhase("intro");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load quiz";
      setPhase("blocked");
      setError(msg);
      showError(msg);
    }
  }, [assignmentId, beginAttempt, showError]);

  useEffect(() => {
    loadIntro();
    return () => setQuizFocusMode(false);
  }, [loadIntro]);

  useEffect(() => {
    if (phase !== "attempt" || secondsLeft === null || secondsLeft <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => (s === null ? s : Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(t);
  }, [phase, secondsLeft]);

  const answeredCount = useMemo(
    () =>
      questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length,
    [questions, answers],
  );

  const progressPercent =
    questions.length > 0
      ? Math.round((answeredCount / questions.length) * 100)
      : 0;
  const allAnswered =
    questions.length > 0 && answeredCount === questions.length;

  function openSubmitConfirm() {
    setShowConfirm(true);
  }

  function toggleReview(qid: string) {
    setMarkedForReview((prev) => {
      const next = new Set(prev);
      if (next.has(qid)) next.delete(qid);
      else next.add(qid);
      return next;
    });
  }

  function jumpToQuestion(index: number) {
    document
      .getElementById(`quiz-question-${index}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleExit() {
    if (!meta) return;
    let saved = false;
    try {
      const payload = questions.map((q) => ({
        question_id: q.id,
        answer: answers[q.id] ?? "",
      }));
      await saveQuizAttemptDraft(
        assignmentId,
        payload,
        Array.from(markedForReview),
      );
      saved = true;
    } catch {
      showError("Could not save progress — try again");
      return;
    }
    setQuizFocusMode(false);
    if (saved) showSuccess("Progress saved — you can continue later");
    window.setTimeout(
      () => router.push("/student/quizzes"),
      saved ? 700 : 0,
    );
  }

  async function handleConfirmSubmit() {
    if (!meta || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = questions.map((q) => ({
        question_id: q.id,
        answer: answers[q.id] ?? "",
      }));
      const result = await submitQuizAttempt(assignmentId, payload);
      saveQuizResult(assignmentId, meta.title, result);
      notifyDashboardRefresh();
      setQuizFocusMode(false);
      router.push(`/student/quizzes/${assignmentId}/result`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Submit failed";
      setError(msg);
      showError(msg);
      setSubmitting(false);
      setShowConfirm(false);
    }
  }

  return (
    <>
      <LmsToast toast={toast} theme="light" />
      {phase === "intro" && meta ? (
        <QuizStartModal
          assignment={meta}
          onStart={() => beginAttempt(meta)}
          onClose={() => router.push("/student/quizzes")}
        />
      ) : null}

      <div className={studentQuizAttemptUi.page}>
        {phase === "attempt" && meta ? (
          <StudentQuizAttemptToolbar
            meta={meta}
            attemptNumber={attemptNumber}
            secondsLeft={secondsLeft}
            onExit={handleExit}
            onSubmit={openSubmitConfirm}
            allAnswered={allAnswered}
          />
        ) : null}

        <div className={studentQuizAttemptUi.inner}>
          {phase === "loading" ? (
            <QuizLoadingState label="Loading quiz…" />
          ) : null}

          {phase === "blocked" ? (
            <QuizErrorState
              message={error ?? "Unavailable"}
              onRetry={meta?.can_attempt ? loadIntro : undefined}
            />
          ) : null}

          {phase === "attempt" && meta && questions.length > 0 ? (
            <>
              <div className="mb-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                  <p className="font-semibold text-slate-900">
                    All {questions.length} questions
                  </p>
                  <p className="text-slate-500">
                    {answeredCount} answered · {markedForReview.size} marked
                  </p>
                </div>
                <div className={studentQuizAttemptUi.progressTrack}>
                  <div
                    className={studentQuizAttemptUi.progressFill}
                    style={{ width: `${progressPercent}%` }}
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Quiz progress"
                  />
                </div>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_260px]">
                <div className={studentQuizAttemptUi.answerSheet}>
                  <div className={studentQuizAttemptUi.answerSheetHeader}>
                    Answer sheet · {questions.length} questions
                  </div>
                  {questions.map((q, i) => (
                    <div key={q.id}>
                      {i > 0 ? <StudentQuizQuestionDivider /> : null}
                      <StudentQuizQuestionBlock
                        question={q}
                        index={i}
                        answer={answers[q.id] ?? ""}
                        marked={markedForReview.has(q.id)}
                        onAnswer={(value) =>
                          setAnswers((prev) => ({ ...prev, [q.id]: value }))
                        }
                        onToggleReview={() => toggleReview(q.id)}
                      />
                    </div>
                  ))}
                  <StudentQuizSubmitFooter
                    onSubmit={openSubmitConfirm}
                    allAnswered={allAnswered}
                    answeredCount={answeredCount}
                    totalCount={questions.length}
                  />
                </div>

                <StudentQuizQuestionNav
                  questions={questions}
                  answers={answers}
                  markedForReview={markedForReview}
                  onJumpTo={jumpToQuestion}
                />
              </div>

              {error ? (
                <QuizErrorBanner
                  message={error}
                  onRetry={() => {
                    setError(null);
                    void handleConfirmSubmit();
                  }}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      <QuizSubmitConfirmDialog
        open={showConfirm}
        answeredCount={answeredCount}
        totalCount={questions.length}
        submitting={submitting}
        onConfirm={handleConfirmSubmit}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}
