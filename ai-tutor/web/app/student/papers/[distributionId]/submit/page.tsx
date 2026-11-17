"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, FileUp, Loader2, Upload } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import { notifyDashboardRefresh } from "@/lib/studentQuizSession";
import { apiUrl } from "@/lib/api";
import {
  fetchWrittenSubmissionStatus,
  submitWrittenAnswerSheets,
  uploadWrittenAnswerSheets,
  type PaperWrittenStatus,
} from "@/services/lmsApi";

export default function StudentWrittenSubmitPage() {
  const params = useParams();
  const router = useRouter();
  const distributionId = String(params.distributionId ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<PaperWrittenStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchWrittenSubmissionStatus(distributionId);
      setStatus(row);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load submission");
    } finally {
      setLoading(false);
    }
  }, [distributionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const locked = status?.status === "submitted" || status?.status === "graded";

  async function handleFilesSelected(fileList: FileList | null) {
    if (!fileList?.length || locked) return;
    const files = Array.from(fileList);
    setUploading(true);
    setError(null);
    try {
      await uploadWrittenAnswerSheets(distributionId, files);
      await load();
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit() {
    if (!status?.files?.length) {
      setError("Upload at least one file before submitting.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await submitWrittenAnswerSheets(distributionId);
      notifyDashboardRefresh();
      router.push(`/student/papers/${encodeURIComponent(distributionId)}/result`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
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
            Back to paper
          </Link>

          <header className="mb-4">
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Submit written answers
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Upload clear photos or scans (PDF, PNG, JPG). Up to 5 files, 15MB each.
            </p>
          </header>

          {loading ? (
            <p className="inline-flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading...
            </p>
          ) : null}

          {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}

          {status ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Status:{" "}
                <span className="font-medium capitalize">
                  {status.status === "not_started" ? "not started" : status.status}
                </span>
                {locked ? " — you cannot change files after submitting." : null}
              </div>

              {status.files.length > 0 ? (
                <ul className="space-y-2 rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                  {status.files.map((f) => (
                    <li key={f.url} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-slate-800">{f.filename}</span>
                      <a
                        href={f.url.startsWith("http") ? f.url : apiUrl(f.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 font-medium text-indigo-600 hover:text-indigo-700"
                      >
                        View
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No files uploaded yet.</p>
              )}

              {!locked ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    multiple
                    className="hidden"
                    onChange={(e) => void handleFilesSelected(e.target.files)}
                  />
                  <button
                    type="button"
                    disabled={uploading || (status.files?.length ?? 0) >= 5}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-40"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploading ? "Uploading..." : "Add files"}
                  </button>

                  <button
                    type="button"
                    disabled={submitting || !status.files.length}
                    onClick={() => void handleSubmit()}
                    className="ml-2 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-40"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileUp className="h-4 w-4" />
                    )}
                    {submitting ? "Submitting..." : "Submit to teacher"}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    router.push(`/student/papers/${encodeURIComponent(distributionId)}/result`)
                  }
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                >
                  View result
                </button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </ProtectedRoute>
  );
}
