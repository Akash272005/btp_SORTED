"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Trophy } from "lucide-react";
import type { AssignmentItem, AssignmentResult } from "@/services/lmsApi";

/**
 * Result screen after submit — score, time, per-question feedback, navigation CTAs.
 */
export default function QuizResultView({
  result,
  assignment,
}: {
  result: AssignmentResult;
  assignment?: AssignmentItem | null;
}) {
  const [showAnswers, setShowAnswers] = useState(false);
  const passed = (result.percentage ?? 0) >= 60;
  const canReattempt = assignment?.can_attempt ?? false;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
      <div
        className={`px-4 py-6 text-center sm:px-6 sm:py-8 ${
          passed
            ? "bg-gradient-to-br from-emerald-500 to-teal-600 text-white"
            : "bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
        }`}
      >
        <Trophy className="mx-auto h-10 w-10 opacity-90" />
        <h1 className="mt-3 text-2xl font-bold">{result.title}</h1>
        <p className="mt-1 text-sm text-white/90">Quiz submitted!</p>
        <p className="mt-4 text-3xl font-bold sm:text-4xl">{result.percentage ?? 0}%</p>
        <p className="mt-1 text-lg text-white/95">
          Your score: {result.score ?? 0} / {result.max_score ?? 0}
        </p>
        {result.time_taken_mins != null ? (
          <p className="mt-2 text-sm text-white/80">
            Time: {result.time_taken_mins} min · Attempt {result.attempt_number}{" "}
            of {assignment?.max_attempts ?? "—"} used
          </p>
        ) : null}
      </div>

      <div className="border-b border-slate-100 px-6 py-4">
        <button
          type="button"
          onClick={() => setShowAnswers((v) => !v)}
          className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          {showAnswers ? "Hide answers" : "View answers"}
        </button>
      </div>

      {showAnswers ? (
        <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto">
          {result.questions.map((q, i) => {
            const qid = String(q.id ?? `q${i + 1}`);
            const feedback = String(q.feedback ?? result.feedback[qid] ?? "");
            const ok =
              feedback === "Correct" || feedback.toLowerCase().includes("submitted");
            return (
              <li key={qid} className="flex gap-3 px-6 py-4">
                <CheckCircle2
                  className={`mt-0.5 h-5 w-5 shrink-0 ${
                    ok ? "text-emerald-500" : "text-slate-300"
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {String(q.text ?? qid)}
                  </p>
                  {q.student_answer ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Your answer: {String(q.student_answer)}
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-600">{feedback}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t border-slate-100 px-6 py-5">
        <Link
          href="/student/dashboard"
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Back to Home
        </Link>
        <Link
          href="/student/quizzes"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          All quizzes
        </Link>
        {canReattempt && assignment ? (
          <Link
            href={`/student/quizzes/${assignment.id}/attempt`}
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-700"
          >
            Reattempt
          </Link>
        ) : null}
      </div>
    </div>
  );
}
