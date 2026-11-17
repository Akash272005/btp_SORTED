"use client";

import { Loader2 } from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";
import { portalModal } from "@/lib/portalModalUi";

type Props = {
  open: boolean;
  quizTitle: string;
  isPublished: boolean;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Teacher portal: confirm quiz delete (replaces browser confirm). */
export default function QuizDeleteConfirmDialog({
  open,
  quizTitle,
  isPublished,
  deleting,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  const message = isPublished
    ? "Removes this quiz from Quizzes and live assignments. This cannot be undone."
    : "Removes this draft from Quizzes. This cannot be undone.";

  return (
    <div
      className={`${portalModal.overlay} portal-modal-overlay-enter z-[70]`}
      role="presentation"
      onClick={deleting ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="quiz-delete-title"
        aria-describedby="quiz-delete-desc"
        className="portal-modal-panel-enter relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClick={onCancel} disabled={deleting} />

        <h2
          id="quiz-delete-title"
          className="pr-8 text-xl font-bold tracking-tight text-slate-900"
        >
          Delete quiz?
        </h2>
        <p className="mt-1.5 text-sm font-medium text-slate-700">{quizTitle}</p>
        <p id="quiz-delete-desc" className="mt-2 text-sm text-slate-500">
          {message}
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className={`${portalModal.btnCancel} disabled:opacity-50`}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className={`${portalModal.btnDanger} disabled:opacity-50`}
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
