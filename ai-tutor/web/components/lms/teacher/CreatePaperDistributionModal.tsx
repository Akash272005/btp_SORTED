"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Download, FileUp, Sparkles } from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";
import DateTimePickerField, {
  toDateTimeLocalValue,
} from "@/components/lms/teacher/DateTimePickerField";
import { createPaperDistribution } from "@/services/lmsApi";

type Props = {
  open: boolean;
  paperId: number;
  defaultTitle: string;
  classId?: string;
  defaultDueAt?: string | null;
  onClose: () => void;
  onCreated: (distributionId: string) => void;
};

export default function CreatePaperDistributionModal({
  open,
  paperId,
  defaultTitle,
  classId: classIdProp = "",
  defaultDueAt,
  onClose,
  onCreated,
}: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [classId, setClassId] = useState(classIdProp);
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [allowDownload, setAllowDownload] = useState(false);
  const [allowPractice, setAllowPractice] = useState(false);
  const [allowOnlineExam, setAllowOnlineExam] = useState(true);
  const [allowWrittenSubmission, setAllowWrittenSubmission] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const practiceLocked = false;

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setClassId(classIdProp);
    setInstructions("");
    setAllowDownload(false);
    setAllowPractice(false);
    setAllowOnlineExam(true);
    setAllowWrittenSubmission(false);
    setError(null);
    if (defaultDueAt) {
      const exam = new Date(defaultDueAt);
      if (!Number.isNaN(exam.getTime())) {
        exam.setHours(10, 0, 0, 0);
        setDueAt(toDateTimeLocalValue(exam));
        return;
      }
    }
    const d = new Date();
    d.setDate(d.getDate() + 7);
    d.setHours(10, 0, 0, 0);
    setDueAt(toDateTimeLocalValue(d));
  }, [open, defaultTitle, classIdProp, defaultDueAt]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!classId.trim()) {
      setError("Select a class from the teacher dashboard first.");
      return;
    }
    const dueDate = new Date(dueAt);
    if (Number.isNaN(dueDate.getTime()) || dueDate.getTime() <= Date.now()) {
      setError("Due date and time must be in the future.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const row = await createPaperDistribution({
        paper_id: paperId,
        class_id: classId,
        due_at: new Date(dueAt).toISOString(),
        instructions: instructions.trim() || undefined,
        allow_download: allowDownload,
        allow_online_practice: allowPractice,
        allow_online_exam: allowOnlineExam,
        allow_written_submission: allowWrittenSubmission,
        title: title.trim() || undefined,
      });
      onCreated(row.id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to distribute");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-slate-900/40 backdrop-blur-[2px] portal-modal-overlay-enter p-4"
      role="presentation"
      onClick={saving ? undefined : onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="distribute-paper-title"
        onSubmit={handleSubmit}
        className="grid h-[min(90vh,720px)] w-full max-w-md grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-slate-100 px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="distribute-paper-title" className="text-lg font-semibold text-slate-900">
                Distribute paper
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Share this paper with class and set access rules.
              </p>
            </div>
            <ModalCloseButton onClick={onClose} disabled={saving} absolute={false} />
          </div>
        </header>

        <div className="overflow-y-auto overscroll-y-contain px-6 py-4">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">Class ID</label>
            <input
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </div>
          <div>
            <label className="text-xs text-slate-600" htmlFor="distribute-due-at">
              Due date
            </label>
            <DateTimePickerField
              id="distribute-due-at"
              value={dueAt}
              onChange={setDueAt}
              required
              min={new Date()}
            />
          </div>
          <div>
            <label className="text-xs text-slate-600">Instructions (optional)</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
              placeholder="Attempt all questions. Write neatly."
            />
          </div>
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
              <span className="inline-flex items-center gap-2">
                <Download className="h-4 w-4 text-emerald-300" />
                Allow PDF download
              </span>
              <input
                type="checkbox"
                checked={allowDownload}
                onChange={(e) => setAllowDownload(e.target.checked)}
                className="rounded border-slate-200 bg-white"
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">Students can download the full paper PDF.</p>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
              <span className="inline-flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-violet-300" />
                Allow Section A online practice
              </span>
              <input
                type="checkbox"
                checked={allowPractice}
                onChange={(e) => setAllowPractice(e.target.checked)}
                disabled={practiceLocked}
                className="rounded border-slate-200 bg-white disabled:opacity-40"
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">
              {practiceLocked
                ? "Enabled by default for MCQ-only papers."
                : "Lets students attempt objective questions online."}
            </p>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
              <span>Online test (all questions on screen)</span>
              <input
                type="checkbox"
                checked={allowOnlineExam}
                onChange={(e) => {
                  const on = e.target.checked;
                  setAllowOnlineExam(on);
                  if (on) setAllowWrittenSubmission(false);
                }}
                disabled={allowWrittenSubmission}
                className="rounded border-slate-200 bg-white disabled:opacity-40"
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Students answer MCQ, short and long online. AI grades first; you can revise marks.
            </p>
          </div>

          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <label className="flex items-center justify-between gap-3 text-sm text-slate-700">
              <span className="inline-flex items-center gap-2">
                <FileUp className="h-4 w-4 text-amber-600" />
                Written paper (upload answer sheet)
              </span>
              <input
                type="checkbox"
                checked={allowWrittenSubmission}
                onChange={(e) => {
                  const on = e.target.checked;
                  setAllowWrittenSubmission(on);
                  if (on) setAllowOnlineExam(false);
                }}
                disabled={allowOnlineExam}
                className="rounded border-slate-200 bg-white disabled:opacity-40"
              />
            </label>
            <p className="mt-1 text-xs text-slate-500">
              Students download the PDF, complete on paper, and upload photos or scans. You mark
              manually.
            </p>
          </div>

          <div className="rounded-lg border border-indigo-700/40 bg-indigo-950/30 p-3 text-xs text-indigo-200">
            <p className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              Due date must be in the future.
            </p>
          </div>
        </div>
        </div>

        <footer className="border-t border-slate-100 px-6 py-4">
          {error ? <p className="mb-3 text-sm text-rose-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "Distributing..." : "Distribute"}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
