"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  PlayCircle,
} from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import PaperModeBadge from "@/components/lms/PaperModeBadge";
import { apiUrl } from "@/lib/api";
import { formatStudentDueDateTime } from "@/lib/lmsDue";
import { notifyDashboardRefresh } from "@/lib/studentQuizSession";
import {
  fetchStudentPaperDetail,
  fetchStudentPaperDownload,
  type StudentPaperDetail,
} from "@/services/lmsApi";

function isWrittenDownloadFlow(row: StudentPaperDetail): boolean {
  return Boolean(row.allow_download && row.allow_written_submission && !row.allow_online_exam);
}

function WrittenDownloadSteps({
  row,
  distributionId,
  downloading,
  onDownload,
}: {
  row: StudentPaperDetail;
  distributionId: string;
  downloading: boolean;
  onDownload: () => void;
}) {
  const router = useRouter();
  const step1Done = Boolean(row.has_downloaded);
  const step2Done =
    row.written_status === "submitted" || row.written_status === "graded";
  const step2Locked = !step1Done;

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-medium text-amber-900">Written paper — follow these steps</p>
        <p className="mt-1 text-xs text-amber-800/90">
          Download the question paper, complete it on paper, then upload photos or scans of your
          answers before the due date.
        </p>
      </div>

      <ol className="space-y-3">
        <li
          className={`rounded-xl border p-4 ${
            step1Done
              ? "border-emerald-200 bg-emerald-50"
              : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0">
              {step1Done ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                  1
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">Download question paper</h2>
              <p className="mt-1 text-sm text-slate-600">
                Save or print the PDF. Write your answers on paper — do not submit online for
                Sections B/C unless your teacher asked otherwise.
              </p>
              <div className="mt-3">
                {step1Done ? (
                  <p className="text-xs font-medium text-emerald-700">
                    Downloaded — you can redo if needed
                  </p>
                ) : null}
                <button
                  type="button"
                  disabled={downloading}
                  onClick={onDownload}
                  className="mt-2 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
                >
                  {downloading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {downloading ? "Preparing PDF..." : step1Done ? "Download again" : "Download PDF"}
                </button>
              </div>
            </div>
          </div>
        </li>

        <li
          className={`rounded-xl border p-4 ${
            step2Done
              ? "border-emerald-200 bg-emerald-50"
              : step2Locked
                ? "border-slate-100 bg-slate-50 opacity-90"
                : "border-slate-200 bg-white"
          }`}
        >
          <div className="flex gap-3">
            <span className="mt-0.5 shrink-0">
              {step2Done ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-600" aria-hidden />
              ) : (
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    step1Done ? "bg-amber-600 text-white" : "bg-slate-200 text-slate-500"
                  }`}
                >
                  2
                </span>
              )}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-slate-900">Upload your answer sheet</h2>
              <p className="mt-1 text-sm text-slate-600">
                Take clear photos or scans of your written answers, then submit. Your teacher will
                mark the paper.
              </p>
              {step2Locked ? (
                <p className="mt-2 text-xs text-slate-500">
                  Complete step 1 first so you have the question paper.
                </p>
              ) : null}
              {step2Done ? (
                <p className="mt-2 text-xs font-medium text-emerald-700">
                  {row.written_status === "graded"
                    ? "Graded — see your result below"
                    : "Submitted — awaiting teacher marks"}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={step2Locked}
                  onClick={() =>
                    router.push(`/student/papers/${encodeURIComponent(distributionId)}/submit`)
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FileUp className="h-4 w-4" />
                  {step2Done ? "View or update upload" : "Upload answers"}
                  {!step2Done && step1Done ? (
                    <ArrowRight className="h-4 w-4 opacity-80" />
                  ) : null}
                </button>
                {step2Done ? (
                  <button
                    type="button"
                    onClick={() =>
                      router.push(`/student/papers/${encodeURIComponent(distributionId)}/result`)
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    View result
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </li>
      </ol>

      {row.progress_label ? (
        <p className="text-center text-xs text-slate-500">Status: {row.progress_label}</p>
      ) : null}
    </section>
  );
}

export default function StudentPaperDetailPage() {
  const params = useParams();
  const router = useRouter();
  const distributionId = String(params.distributionId ?? "");
  const [row, setRow] = useState<StudentPaperDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!distributionId) return;
    setLoading(true);
    fetchStudentPaperDetail(distributionId)
      .then(setRow)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load paper"))
      .finally(() => setLoading(false));
  }, [distributionId]);

  async function handleDownload() {
    if (!distributionId) return;
    setDownloading(true);
    setError(null);
    try {
      const res = await fetchStudentPaperDownload(distributionId);
      if (res.download_url) {
        const url = res.download_url.startsWith("http")
          ? res.download_url
          : apiUrl(res.download_url);
        window.open(url, "_blank", "noopener,noreferrer");
        notifyDashboardRefresh();
        const updated = await fetchStudentPaperDetail(distributionId);
        setRow(updated);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setDownloading(false);
    }
  }

  const writtenDownloadFlow = row ? isWrittenDownloadFlow(row) : false;

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

          {loading ? (
            <p className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading paper...
            </p>
          ) : null}
          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          {row ? (
            <div className="space-y-5">
              <header className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    {row.title}
                  </h1>
                  {row.allow_online_exam ? (
                    <PaperModeBadge mode="online_exam" variant="light" />
                  ) : row.allow_written_submission ? (
                    <PaperModeBadge mode="written" variant="light" />
                  ) : row.allow_online_practice ? (
                    <PaperModeBadge mode="practice" variant="light" />
                  ) : null}
                  {writtenDownloadFlow ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 ring-1 ring-slate-200">
                      PDF + upload
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {row.subject || "General"} · {row.board} · {row.due_label}
                  {row.due_at ? ` · ${formatStudentDueDateTime(row.due_at)}` : ""}
                </p>
                {row.progress_label && !writtenDownloadFlow ? (
                  <p className="mt-2 text-sm text-slate-600">{row.progress_label}</p>
                ) : null}
              </header>

              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-xl font-semibold text-slate-900">{row.total_marks}</p>
                  <p className="text-xs text-slate-500">Total marks</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-xl font-semibold text-slate-900">{row.duration_mins}</p>
                  <p className="text-xs text-slate-500">Duration (min)</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-xl font-semibold text-slate-900">
                    {row.exam_type || "—"}
                  </p>
                  <p className="text-xs text-slate-500">Exam type</p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-white p-4 text-center shadow-sm">
                  <p className="text-lg font-semibold leading-snug text-slate-900">
                    {formatStudentDueDateTime(row.due_at)}
                  </p>
                  <p className="text-xs text-slate-500">Due date & time</p>
                </div>
              </div>

              {writtenDownloadFlow ? (
                <WrittenDownloadSteps
                  row={row}
                  distributionId={distributionId}
                  downloading={downloading}
                  onDownload={() => void handleDownload()}
                />
              ) : (
                <>
                  <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                    {row.instructions ||
                      (row.allow_online_exam
                        ? "Take the online test on screen. AI will grade your answers; your teacher may revise marks."
                        : row.allow_written_submission
                          ? "Download the question paper, complete it on paper, then upload clear photos or scans of your answers."
                          : "Section A can be practiced online for instant score. Sections B/C remain written.")}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {row.allow_download ? (
                      <button
                        type="button"
                        disabled={downloading}
                        onClick={() => void handleDownload()}
                        className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-40"
                      >
                        {downloading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        {downloading ? "Preparing PDF..." : "Download question paper"}
                      </button>
                    ) : null}
                    {row.allow_online_exam ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`/student/papers/${encodeURIComponent(distributionId)}/exam`)
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                        >
                          <PlayCircle className="h-4 w-4" />
                          Take online test
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/student/papers/${encodeURIComponent(distributionId)}/result`,
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          View result
                        </button>
                      </>
                    ) : row.allow_written_submission ? (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/student/papers/${encodeURIComponent(distributionId)}/submit`,
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-amber-500"
                        >
                          <FileUp className="h-4 w-4" />
                          Submit written answers
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/student/papers/${encodeURIComponent(distributionId)}/result`,
                            )
                          }
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        >
                          View result
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={!row.allow_online_practice}
                        onClick={() =>
                          router.push(
                            `/student/papers/${encodeURIComponent(distributionId)}/practice`,
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-40"
                      >
                        <PlayCircle className="h-4 w-4" />
                        Practice Section A online
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </ProtectedRoute>
  );
}
