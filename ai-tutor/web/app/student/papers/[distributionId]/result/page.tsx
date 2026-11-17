"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, Trophy } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import {
  fetchPaperExamResult,
  fetchWrittenSubmissionResult,
  type PaperExamResult,
  type PaperPracticeSubmitResult,
  type PaperWrittenResult,
} from "@/services/lmsApi";

export default function StudentPaperResultPage() {
  const params = useParams();
  const distributionId = String(params.distributionId ?? "");
  const [examResult, setExamResult] = useState<PaperExamResult | null>(null);
  const [writtenResult, setWrittenResult] = useState<PaperWrittenResult | null>(null);
  const [practiceResult, setPracticeResult] = useState<PaperPracticeSubmitResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const rawPractice = sessionStorage.getItem(`paper-practice-result:${distributionId}`);
    if (rawPractice) {
      try {
        setPracticeResult(JSON.parse(rawPractice) as PaperPracticeSubmitResult);
      } catch {
        setPracticeResult(null);
      }
    }

    Promise.all([
      fetchPaperExamResult(distributionId).catch(() => null),
      fetchWrittenSubmissionResult(distributionId).catch(() => null),
    ]).then(([exam, written]) => {
      setExamResult(exam);
      setWrittenResult(written);
      setLoading(false);
    });
  }, [distributionId]);

  const displayScore =
    examResult?.grading_status === "teacher_finalized" &&
    examResult.teacher_score != null
      ? examResult.teacher_score
      : examResult?.ai_score;
  const maxScore = examResult?.max_score;
  const pct =
    examResult?.percentage ??
    (displayScore != null && maxScore
      ? Math.round((displayScore / maxScore) * 1000) / 10
      : null);

  return (
    <ProtectedRoute roles={["student"]}>
      <div className="min-h-full bg-[#F9FAFB]">
        <div className="w-full max-w-[1200px] px-6 py-6 lg:px-8 lg:py-8">
          <Link
            href="/student/papers"
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-indigo-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Question Papers
          </Link>
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Result</h1>

            {loading ? (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading result...
              </p>
            ) : null}

            {examResult ? (
              <>
                <p className="mt-2 text-sm text-slate-600">
                  {examResult.grading_status === "teacher_finalized"
                    ? "Final marks (reviewed by teacher)"
                    : examResult.requires_teacher_review
                      ? "AI score — teacher may revise short/long answers"
                      : "AI graded score"}
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-xs font-medium text-emerald-700">Score</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-900">
                      {displayScore ?? "—"} / {maxScore ?? "—"}
                    </p>
                    {examResult.ai_score != null &&
                    examResult.teacher_score != null &&
                    examResult.grading_status === "teacher_finalized" ? (
                      <p className="mt-1 text-xs text-slate-500">
                        AI had {examResult.ai_score} / {maxScore}
                      </p>
                    ) : null}
                  </div>
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                    <p className="text-xs font-medium text-indigo-700">Percentage</p>
                    <p className="mt-1 inline-flex items-center gap-2 text-2xl font-semibold text-indigo-900">
                      <Trophy className="h-5 w-5" />
                      {pct != null ? `${pct}%` : "—"}
                    </p>
                  </div>
                </div>
              </>
            ) : writtenResult ? (
              <>
                <p className="mt-2 text-sm text-slate-600">
                  {writtenResult.status === "graded"
                    ? "Final marks from your teacher"
                    : "Submitted — waiting for teacher to mark your paper"}
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                    <p className="text-xs font-medium text-emerald-700">Score</p>
                    <p className="mt-1 text-2xl font-semibold text-emerald-900">
                      {writtenResult.status === "graded" && writtenResult.teacher_score != null
                        ? `${writtenResult.teacher_score} / ${writtenResult.max_score ?? "—"}`
                        : "Pending"}
                    </p>
                  </div>
                  <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                    <p className="text-xs font-medium text-indigo-700">Percentage</p>
                    <p className="mt-1 inline-flex items-center gap-2 text-2xl font-semibold text-indigo-900">
                      <Trophy className="h-5 w-5" />
                      {writtenResult.percentage != null ? `${writtenResult.percentage}%` : "—"}
                    </p>
                  </div>
                </div>
              </>
            ) : practiceResult ? (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
                  <p className="text-xs font-medium text-emerald-700">MCQ practice score</p>
                  <p className="mt-1 text-2xl font-semibold text-emerald-900">
                    {practiceResult.score} / {practiceResult.max_score}
                  </p>
                </div>
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
                  <p className="text-xs font-medium text-indigo-700">Percentage</p>
                  <p className="mt-1 text-2xl font-semibold text-indigo-900">
                    {practiceResult.percentage}%
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No result found yet.</p>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={`/student/papers/${encodeURIComponent(distributionId)}`}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to detail
              </Link>
              <Link
                href="/student/papers"
                className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
              >
                All papers
              </Link>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
