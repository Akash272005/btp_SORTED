"use client";

import { AlertTriangle, Loader2 } from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";

type Props = {
  open: boolean;
  assignmentTitle: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function AssignmentDeleteConfirmDialog({
  open,
  assignmentTitle,
  deleting,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] portal-modal-overlay-enter p-4"
      role="presentation"
      onClick={deleting ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="assignment-delete-title"
        aria-describedby="assignment-delete-desc"
        className="portal-modal-panel-enter relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClick={onCancel} disabled={deleting} />

        <div className="flex gap-3 pr-8">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-500/15">
            <AlertTriangle className="h-5 w-5 text-rose-600" aria-hidden />
          </div>
          <div>
            <h2
              id="assignment-delete-title"
              className="text-lg font-semibold text-slate-900"
            >
              Delete assignment?
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {assignmentTitle}
            </p>
          </div>
        </div>

        <p
          id="assignment-delete-desc"
          className="mt-4 text-sm leading-relaxed text-slate-600"
        >
          This removes the assignment from your class and deletes the quiz from{" "}
          <span className="text-slate-600">Quizzes</span>. Students will no longer
          see it on their dashboard or My Quizzes. All submission scores will be
          deleted.{" "}
          <span className="text-slate-600">This cannot be undone.</span>
        </p>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
          >
            {deleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              "Delete"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
