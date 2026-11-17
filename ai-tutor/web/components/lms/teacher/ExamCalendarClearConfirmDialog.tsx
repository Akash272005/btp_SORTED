"use client";

import { RotateCcw, Trash2 } from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";

type Props = {
  open: boolean;
  mode: "all" | "single" | "remove";
  examCount?: number;
  slotTitle?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function ExamCalendarClearConfirmDialog({
  open,
  mode,
  examCount = 0,
  slotTitle = "",
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  const isAll = mode === "all";
  const isRemove = mode === "remove";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] portal-modal-overlay-enter p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-plan-title"
        aria-describedby="clear-plan-desc"
        className={`portal-modal-panel-enter relative w-full rounded-2xl border border-slate-200 bg-white shadow-2xl ${
          isAll || isRemove ? "max-w-sm p-5" : "max-w-xs p-4"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <ModalCloseButton onClick={onCancel} />
        <div className={`flex items-start gap-2.5 pr-5 ${isAll || isRemove ? "gap-3 pr-6" : ""}`}>
          <div
            className={`flex shrink-0 items-center justify-center rounded-full ${
              isRemove ? "bg-rose-500/15" : "bg-amber-500/15"
            } ${isAll || isRemove ? "h-9 w-9" : "h-8 w-8"}`}
          >
            {isRemove ? (
              <Trash2
                className={isAll ? "h-4 w-4 text-rose-600" : "h-3.5 w-3.5 text-rose-600"}
                aria-hidden
              />
            ) : (
              <RotateCcw
                className={isAll ? "h-4 w-4 text-amber-600" : "h-3.5 w-3.5 text-amber-600"}
                aria-hidden
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="clear-plan-title"
              className={`font-semibold text-slate-900 ${isAll || isRemove ? "text-base" : "text-sm"}`}
            >
              {isAll
                ? "Clear all exams?"
                : isRemove
                  ? "Remove this exam?"
                  : "Clear this exam?"}
            </h2>
            <p
              id="clear-plan-desc"
              className={`mt-1.5 leading-relaxed text-slate-600 ${
                isAll || isRemove ? "mt-2 text-sm" : "text-xs"
              }`}
            >
              {isAll ? (
                <>
                  Remove dates, marks, duration, and chapters for all{" "}
                  <span className="text-slate-700">{examCount}</span> exams. Names
                  stay.
                </>
              ) : isRemove ? (
                <>
                  Remove{" "}
                  <span className="font-medium text-slate-700">{slotTitle}</span> from
                  your calendar. Changes save automatically.
                </>
              ) : (
                <>
                  Remove date, marks, duration, and chapters for{" "}
                  <span className="font-medium text-slate-700">{slotTitle}</span>.
                </>
              )}
            </p>
          </div>
        </div>

        <div className={`flex justify-end gap-2 ${isAll || isRemove ? "mt-5" : "mt-4"}`}>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold text-white ${
              isRemove
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-amber-600 hover:bg-amber-500"
            }`}
          >
            {isAll ? "Clear all" : isRemove ? "Remove" : "Clear"}
          </button>
        </div>
      </div>
    </div>
  );
}
