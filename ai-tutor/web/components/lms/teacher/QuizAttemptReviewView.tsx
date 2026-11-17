"use client";

import {
  CheckCircle2,
  Flag,
  XCircle,
  HelpCircle,
} from "lucide-react";
import {
  formatMcqAnswerDisplay,
  formatMcqOptionDisplay,
  mcqOptionText,
} from "@/lib/quizQuestions";
import type { TeacherQuizAttemptDetail } from "@/services/lmsApi";

function resultIcon(isCorrect: boolean | null) {
  if (isCorrect === true) {
    return <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-hidden />;
  }
  if (isCorrect === false) {
    return <XCircle className="h-5 w-5 shrink-0 text-rose-500" aria-hidden />;
  }
  return <HelpCircle className="h-5 w-5 shrink-0 text-amber-500" aria-hidden />;
}

function resultBadge(isCorrect: boolean | null, feedback: string) {
  if (isCorrect === true) {
    return (
      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-emerald-800">
        Correct
      </span>
    );
  }
  if (isCorrect === false) {
    return (
      <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-rose-800">
        Incorrect
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-900">
      {feedback.includes("review") ? "Needs review" : "Partial / SA"}
    </span>
  );
}

export default function QuizAttemptReviewView({
  detail,
}: {
  detail: TeacherQuizAttemptDetail;
}) {
  const passed = (detail.percentage ?? 0) >= 60;

  return (
    <div className="space-y-6">
      <div
        className={`overflow-hidden rounded-2xl border shadow-sm ${
          passed
            ? "border-emerald-100 bg-gradient-to-br from-emerald-50 to-teal-50"
            : "border-indigo-100 bg-gradient-to-br from-indigo-50 to-violet-50"
        }`}
      >
        <div className="px-5 py-5 sm:px-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Quiz score
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
            {detail.percentage ?? 0}%
          </p>
          <p className="mt-1 text-sm font-medium text-slate-700">
            {detail.score ?? 0} / {detail.max_score ?? 0} marks · Attempt{" "}
            {detail.attempt_number}
            {detail.time_taken_mins != null
              ? ` · ${detail.time_taken_mins} min`
              : null}
          </p>
          {detail.completed_at ? (
            <p className="mt-1 text-xs text-slate-500">
              Submitted {new Date(detail.completed_at).toLocaleString()}
            </p>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <h2 className="text-sm font-bold text-slate-900">
            Question-by-question review
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            {detail.questions.length} question
            {detail.questions.length === 1 ? "" : "s"}
          </p>
        </div>

        <ul className="divide-y divide-slate-100">
          {detail.questions.map((q, index) => {
            const isMcq =
              q.type === "mcq" && Array.isArray(q.options) && q.options.length > 0;
            const studentSelectedIndex = isMcq
              ? q.options!.findIndex(
                  (opt) => mcqOptionText(opt) === mcqOptionText(q.student_answer),
                )
              : -1;

            return (
              <li key={q.question_id} className="px-5 py-5 sm:px-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {resultIcon(q.is_correct)}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">
                          Q{index + 1}
                        </span>
                        {resultBadge(q.is_correct, q.feedback)}
                        {q.marked_for_review ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800">
                            <Flag className="h-3 w-3" aria-hidden />
                            Marked for review
                          </span>
                        ) : null}
                        <span className="text-xs font-semibold tabular-nums text-slate-500">
                          {q.marks_awarded} / {q.marks} marks
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-900">
                        {q.text}
                      </p>
                    </div>
                  </div>
                </div>

                {isMcq ? (
                  <ul className="mt-4 space-y-2 pl-8">
                    {q.options!.map((opt, oi) => {
                      const isStudent = oi === studentSelectedIndex;
                      const isCorrectOpt =
                        mcqOptionText(opt) ===
                        mcqOptionText(String(q.correct_answer ?? ""));
                      return (
                        <li
                          key={`${q.question_id}-opt-${oi}`}
                          className={`rounded-lg border px-3 py-2 text-sm ${
                            isCorrectOpt
                              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                              : isStudent
                                ? "border-rose-200 bg-rose-50 text-rose-900"
                                : "border-slate-100 bg-slate-50/80 text-slate-700"
                          }`}
                        >
                          <span className="font-semibold">
                            {formatMcqOptionDisplay(oi, opt)}
                          </span>
                          {isStudent ? (
                            <span className="ml-2 text-xs font-bold uppercase text-slate-600">
                              Student pick
                            </span>
                          ) : null}
                          {isCorrectOpt ? (
                            <span className="ml-2 text-xs font-bold uppercase text-emerald-700">
                              Correct answer
                            </span>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="mt-4 space-y-2 pl-8">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        Student answer
                      </p>
                      <p className="mt-1 text-sm text-slate-900 whitespace-pre-wrap">
                        {q.student_answer.trim() || "— No answer —"}
                      </p>
                    </div>
                    {q.correct_answer ? (
                      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-700">
                          Expected answer
                        </p>
                        <p className="mt-1 text-sm text-emerald-900 whitespace-pre-wrap">
                          {q.correct_answer}
                        </p>
                      </div>
                    ) : null}
                  </div>
                )}

                {isMcq && q.correct_answer ? (
                  <p className="mt-3 pl-8 text-xs text-slate-600">
                    Answer key:{" "}
                    <span className="font-semibold text-slate-800">
                      {formatMcqAnswerDisplay(q.options ?? undefined, q.correct_answer)}
                    </span>
                  </p>
                ) : null}

                {q.feedback ? (
                  <p className="mt-2 pl-8 text-xs font-medium text-slate-600">
                    Feedback: {q.feedback}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
