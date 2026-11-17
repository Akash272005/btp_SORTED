"use client";

import PortalModal, {
  PortalModalActions,
} from "@/components/lms/portal/PortalModal";

/**
 * Confirms submit with count of answered questions (PDF: "Submit? 4 of 5 answered").
 */
export default function QuizSubmitConfirmDialog({
  open,
  answeredCount,
  totalCount,
  submitting,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  answeredCount: number;
  totalCount: number;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <PortalModal
      open={open}
      onClose={onCancel}
      title="Submit quiz?"
      size="sm"
      zIndex={60}
      disableBackdropClose={submitting}
      role="alertdialog"
      titleId="quiz-submit-title"
      describedById="quiz-submit-desc"
      footer={
        <PortalModalActions
          onCancel={onCancel}
          primaryLabel={submitting ? "Submitting…" : "Submit"}
          onPrimary={onConfirm}
          primaryDisabled={submitting}
          primaryLoading={submitting}
        />
      }
    >
      <p id="quiz-submit-desc" className="text-sm text-slate-600">
        {answeredCount} of {totalCount} questions answered. You cannot change
        answers after submitting.
      </p>
    </PortalModal>
  );
}
