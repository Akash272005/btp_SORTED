"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Clock, Loader2, LogOut, Send } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import SolverPaperHelpLink from "@/components/solver/SolverPaperHelpLink";
import { notifyDashboardRefresh } from "@/lib/studentQuizSession";
import { parseApiUtc } from "@/lib/lmsDatetime";
import {
  resumePaperExam,
  savePaperExamDraft,
  startPaperExam,
  submitPaperExam,
  type PaperExamQuestion,
} from "@/services/lmsApi";

function formatTimeLeft(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function examSecondsRemaining(startedAt: string, durationMins: number): number {
  const started = parseApiUtc(startedAt);
  if (!started) return 0;
  const durationSecs = Math.max(60, (durationMins || 60) * 60);
  const endMs = started.getTime() + durationSecs * 1000;
  return Math.max(0, Math.floor((endMs - Date.now()) / 1000));
}

export default function StudentPaperExamPage() {
  const params = useParams();
  const router = useRouter();
  const distributionId = String(params.distributionId ?? "");
  const [questions, setQuestions] = useState<PaperExamQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [durationMins, setDurationMins] = useState(60);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingExit, setSavingExit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const autoSubmitTriggeredRef = useRef(false);
  const answersRef = useRef(answers);
  const questionsRef = useRef(questions);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    questionsRef.current = questions;
  }, [questions]);

  const buildAnswerPayload = useCallback(
    () =>
      questionsRef.current.map((q) => ({
        question_id: q.id,
        answer: answersRef.current[q.id] || "",
      })),
    [],
  );

  const doSubmit = useCallback(
    async (auto = false) => {
      if (submitting || questionsRef.current.length === 0) return;
      setSubmitting(true);
      setError(null);
      if (auto) {
        setStatusNote("Time is up — submitting your answers…");
      }
      try {
        const res = await submitPaperExam(distributionId, buildAnswerPayload());
        sessionStorage.setItem(
          `paper-exam-result:${distributionId}`,
          JSON.stringify(res),
        );
        notifyDashboardRefresh();
        router.push(`/student/papers/${encodeURIComponent(distributionId)}/result`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Submit failed");
        setSubmitting(false);
        if (auto) autoSubmitTriggeredRef.current = false;
      }
    },
    [buildAnswerPayload, distributionId, router, submitting],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatusNote(null);
    autoSubmitTriggeredRef.current = false;
    try {
      const started = await resumePaperExam(distributionId).catch(() =>
        startPaperExam(distributionId),
      );
      const qs = (started.questions || []) as PaperExamQuestion[];
      setQuestions(qs);
      setDurationMins(started.duration_mins || 60);

      const initial: Record<string, string> = {};
      qs.forEach((q) => {
        initial[q.id] = "";
      });
      (started.saved_answers || []).forEach((r) => {
        if (r.question_id) initial[r.question_id] = String(r.answer || "");
      });
      setAnswers(initial);

      const remaining = examSecondsRemaining(
        started.started_at,
        started.duration_mins,
      );
      setSecondsLeft(remaining);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start online test");
    } finally {
      setLoading(false);
    }
  }, [distributionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (loading || secondsLeft === null) return;
    if (secondsLeft <= 0) return;
    const t = setInterval(() => {
      setSecondsLeft((s) => (s === null ? s : Math.max(0, s - 1)));
    }, 1000);
    return () => clearInterval(t);
  }, [loading, secondsLeft]);

  useEffect(() => {
    if (loading || questions.length === 0 || secondsLeft === null) return;
    if (secondsLeft > 0) return;
    if (submitting || autoSubmitTriggeredRef.current) return;
    autoSubmitTriggeredRef.current = true;
    void doSubmit(true);
  }, [loading, questions.length, secondsLeft, submitting, doSubmit]);

  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id] || "").trim()).length,
    [questions, answers],
  );

  const timerUrgent = secondsLeft !== null && secondsLeft > 0 && secondsLeft < 300;
  const timeUp = secondsLeft !== null && secondsLeft <= 0;
  const inputsDisabled = submitting || savingExit || timeUp;

  async function handleSaveAndExit() {
    if (savingExit || submitting || questions.length === 0) return;
    setSavingExit(true);
    setError(null);
    try {
      await savePaperExamDraft(distributionId, buildAnswerPayload());
      router.push(`/student/papers/${encodeURIComponent(distributionId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save progress");
      setSavingExit(false);
    }
  }

  let lastSection = "";

  return (
    <ProtectedRoute roles={["student"]}>
      <div className="min-h-full bg-[#F9FAFB]">
        <div className="w-full max-w-[1200px] px-6 py-6 lg:px-8 lg:py-8">
          <Link
            href={`/student/papers/${encodeURIComponent(distributionId)}`}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Paper detail
          </Link>

          {loading ? (
            <p className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading online test...
            </p>
          ) : null}
          {error ? <p className="mb-2 text-sm text-rose-600">{error}</p> : null}
          {statusNote ? (
            <p className="mb-2 text-sm font-medium text-amber-800">{statusNote}</p>
          ) : null}

          {!loading && questions.length > 0 ? (
            <>
              <header className="mb-4 flex flex-col gap-3 rounded-xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-lg font-semibold text-slate-900">Online test</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    Answered {answeredCount}/{questions.length}
                    {durationMins > 0 ? ` · ${durationMins} min allowed` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {secondsLeft !== null ? (
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold ${
                        timeUp
                          ? "bg-rose-100 text-rose-700"
                          : timerUrgent
                            ? "bg-rose-50 text-rose-600"
                            : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      <Clock className="h-4 w-4" />
                      {timeUp ? "Time's up" : `${formatTimeLeft(secondsLeft)} left`}
                    </div>
                  ) : null}
                  <button
                    type="button"
                    disabled={inputsDisabled}
                    onClick={() => void handleSaveAndExit()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                  >
                    {savingExit ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <LogOut className="h-3.5 w-3.5" />
                    )}
                    {savingExit ? "Saving…" : "Save & exit"}
                  </button>
                </div>
              </header>

              <div className="space-y-4">
                {questions.map((q, idx) => {
                  const sec = q.section_id || "";
                  const showSection = sec && sec !== lastSection;
                  if (showSection) lastSection = sec;
                  const qType = (q.type || "short").toLowerCase();
                  return (
                    <div key={q.id}>
                      {showSection ? (
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-indigo-600">
                          Section {sec}
                        </p>
                      ) : null}
                      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        <p className="text-xs text-slate-500">
                          Q{idx + 1} · {qType.toUpperCase()} · {q.marks || 1} mark
                          {(q.marks || 1) === 1 ? "" : "s"}
                        </p>
                        <p className="mt-2 text-sm font-medium text-slate-900">{q.text}</p>
                        <SolverPaperHelpLink question={q.text} className="mt-2" />

                        {qType === "mcq" && q.options?.length ? (
                          <div className="mt-3 space-y-2">
                            {q.options.map((opt, oi) => (
                              <label
                                key={`${q.id}-opt-${oi}`}
                                className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                                  answers[q.id] === opt
                                    ? "border-indigo-500 bg-indigo-50"
                                    : "border-slate-200 bg-white"
                                } ${inputsDisabled ? "pointer-events-none opacity-60" : ""}`}
                              >
                                <input
                                  type="radio"
                                  name={q.id}
                                  checked={answers[q.id] === opt}
                                  disabled={inputsDisabled}
                                  onChange={() =>
                                    setAnswers((prev) => ({ ...prev, [q.id]: opt }))
                                  }
                                />
                                <span>{opt}</span>
                              </label>
                            ))}
                          </div>
                        ) : (
                          <textarea
                            value={answers[q.id] || ""}
                            disabled={inputsDisabled}
                            onChange={(e) =>
                              setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            rows={qType === "long" ? 6 : 3}
                            className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60"
                            placeholder="Type your answer here..."
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={inputsDisabled}
                  onClick={() => void handleSaveAndExit()}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <LogOut className="h-4 w-4" />
                  Save & exit
                </button>
                <button
                  type="button"
                  disabled={inputsDisabled}
                  onClick={() => void doSubmit(false)}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                  {submitting ? "Submitting & grading..." : "Submit test"}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </ProtectedRoute>
  );
}
