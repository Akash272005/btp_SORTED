"use client";

import { Loader2 } from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";
import { portalModal } from "@/lib/portalModalUi";

type Props = {
  open: boolean;
  distributionTitle: string;
  deleting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function PaperDistributionDeleteConfirmDialog({
  open,
  distributionTitle,
  deleting,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className={`${portalModal.overlay} portal-modal-overlay-enter z-[70]`}
      role="presentation"
      onClick={deleting ? undefined : onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="distribution-delete-title"
        aria-describedby="distribution-delete-desc"
        className="portal-modal-panel-enter relative w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClick={onCancel} disabled={deleting} />

        <h2
          id="distribution-delete-title"
          className="pr-8 text-xl font-bold tracking-tight text-slate-900"
        >
          Delete distribution?
        </h2>
        <p className="mt-1.5 text-sm font-medium text-slate-700">{distributionTitle}</p>
        <p id="distribution-delete-desc" className="mt-2 text-sm text-slate-500">
          Removes this distribution from your class. The question paper stays in your library.
          This cannot be undone.
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
