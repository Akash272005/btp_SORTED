"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import SolverPaperHelpLink from "@/components/solver/SolverPaperHelpLink";
import { notifyDashboardRefresh } from "@/lib/studentQuizSession";
import {
  resumePaperPractice,
  startPaperPractice,
  submitPaperPractice,
  type PaperPracticeSubmitResult,
} from "@/services/lmsApi";

type Q = {
  id: string;
  text: string;
  options?: string[];
  marks?: number;
};

export default function StudentPaperPracticePage() {
  const params = useParams();
  const router = useRouter();
  const distributionId = String(params.distributionId ?? "");
  const [questions, setQuestions] = useState<Q[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const started = await resumePaperPractice(distributionId).catch(() =>
        startPaperPractice(distributionId),
      );
      const qs = (started.questions || []) as Q[];
      setQuestions(qs);
      const initial: Record<string, string> = {};
      qs.forEach((q) => {
        initial[q.id] = "";
      });
      (started.saved_answers || []).forEach((r) => {
        if (r.question_id) initial[r.question_id] = String(r.answer || "");
      });
      setAnswers(initial);
      setIdx(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start practice");
    } finally {
      setLoading(false);
    }
  }, [distributionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = questions[idx];
  const answeredCount = useMemo(
    () => questions.filter((q) => (answers[q.id] || "").trim()).length,
    [questions, answers],
  );

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const payload = questions.map((q) => ({
        question_id: q.id,
        answer: answers[q.id] || "",
      }));
      const res: PaperPracticeSubmitResult = await submitPaperPractice(
        distributionId,
        payload,
      );
      sessionStorage.setItem(
        `paper-practice-result:${distributionId}`,
        JSON.stringify(res),
      );
      notifyDashboardRefresh();
      router.push(`/student/papers/${encodeURIComponent(distributionId)}/result`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
      setSubmitting(false);
    }
  }

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
              Loading practice...
            </p>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          {!loading && current ? (
            <>
              <header className="mb-4 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
                  Section A — MCQ practice ({idx + 1} of {questions.length})
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  Answered {answeredCount}/{questions.length}
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all"
                    style={{
                      width: `${questions.length ? Math.round(((idx + 1) / questions.length) * 100) : 0}%`,
                    }}
                  />
                </div>
              </header>

              <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs text-slate-500">
                  Q{idx + 1} · {current.marks || 1} mark
                </p>
                <p className="mt-2 text-base font-medium text-slate-900">{current.text}</p>
                <SolverPaperHelpLink question={current.text} className="mt-3" />
                <div className="mt-4 space-y-2">
                  {(current.options || []).map((opt, oi) => {
                    const selected = answers[current.id] === opt;
                    return (
                      <label
                        key={`${current.id}-${oi}`}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm ${
                          selected
                            ? "border-indigo-500 bg-indigo-50"
                            : "border-slate-200 bg-white"
                        }`}
                      >
                        <input
                          type="radio"
                          name={current.id}
                          checked={selected}
                          onChange={() =>
                            setAnswers((prev) => ({
                              ...prev,
                              [current.id]: opt,
                            }))
                          }
                        />
                        <span className="text-slate-800">{opt}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 flex justify-between gap-2">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => setIdx((i) => i - 1)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>
                {idx === questions.length - 1 ? (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleSubmit}
                    className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                    {submitting ? "Submitting..." : "Submit"}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIdx((i) => i + 1)}
                    className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </ProtectedRoute>
  );
}
