"use client";

import { useEffect, useState } from "react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";
import { createTeacherAssignment } from "@/services/lmsApi";

type Props = {
  open: boolean;
  quizId: string;
  defaultTitle: string;
  defaultSubject: string;
  defaultMarks: number;
  defaultDuration: number;
  classId?: string;
  defaultDueAt?: string | null;
  onClose: () => void;
  onCreated: (assignmentId: string) => void;
};

export default function CreateAssignmentModal({
  open,
  quizId,
  defaultTitle,
  defaultSubject,
  defaultMarks,
  defaultDuration,
  classId = "",
  defaultDueAt,
  onClose,
  onCreated,
}: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [durationMins, setDurationMins] = useState(defaultDuration);
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setDurationMins(defaultDuration);
    setInstructions("");
    setError(null);
    if (defaultDueAt) {
      const exam = new Date(defaultDueAt);
      if (!Number.isNaN(exam.getTime())) {
        exam.setHours(10, 0, 0, 0);
        setDueAt(exam.toISOString().slice(0, 16));
        return;
      }
    }
    const d = new Date();
    d.setDate(d.getDate() + 3);
    setDueAt(d.toISOString().slice(0, 16));
  }, [open, defaultTitle, defaultDuration, defaultDueAt]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const row = await createTeacherAssignment({
        title: title.trim(),
        class_id: classId,
        quiz_id: quizId,
        subject: defaultSubject,
        marks: defaultMarks,
        duration_mins: Math.min(180, Math.max(5, durationMins)),
        due_at: new Date(dueAt).toISOString(),
        instructions: instructions.trim() || undefined,
      });
      onCreated(row.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] portal-modal-overlay-enter p-4"
      role="presentation"
      onClick={saving ? undefined : onClose}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-class-title"
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClick={onClose} disabled={saving} />
        <h2
          id="assign-class-title"
          className="pr-8 text-lg font-semibold text-slate-900"
        >
          Assign to class
        </h2>
        <p className="mt-1 text-sm text-slate-500">{classId}</p>
        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-slate-500">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Exam time limit (minutes)</label>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Student sees a countdown; quiz must finish within this time.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDurationMins(m)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                    durationMins === m
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {m} min
                </button>
              ))}
            </div>
            <input
              type="number"
              min={5}
              max={180}
              value={durationMins}
              onChange={(e) =>
                setDurationMins(
                  Math.min(180, Math.max(5, Number(e.target.value) || 30)),
                )
              }
              className="mt-2 w-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Due date</label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Instructions (optional)</label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm"
              placeholder="Read all questions carefully before submitting."
            />
          </div>
        </div>
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create assignment"}
          </button>
        </div>
      </form>
    </div>
  );
}
