"use client";

import { Plus } from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";

type Props = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function PaperStartNewConfirmDialog({
  open,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] portal-modal-overlay-enter p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="paper-new-title"
        className="portal-modal-panel-enter relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClick={onCancel} />

        <div className="flex gap-3 pr-8">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500/15">
            <Plus className="h-5 w-5 text-violet-400" aria-hidden />
          </div>
          <div>
            <h2 id="paper-new-title" className="text-lg font-semibold text-slate-900">
              Start a new paper?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Current work on this page will be cleared. Saved papers in{" "}
              <span className="text-slate-600">My Papers</span> are not affected.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Start new paper
          </button>
        </div>
      </div>
    </div>
  );
}
