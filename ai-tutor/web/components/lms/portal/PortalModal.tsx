"use client";

import type { FormEventHandler, ReactNode } from "react";
import { portalModal } from "@/lib/portalModalUi";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";

type ModalSize = "sm" | "md" | "lg" | "xl";

const SIZE_CLASS: Record<ModalSize, string> = {
  sm: portalModal.panelSm,
  md: portalModal.panelMd,
  lg: portalModal.panelLg,
  xl: portalModal.panelXl,
};

interface PortalModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: ModalSize;
  zIndex?: number;
  disableBackdropClose?: boolean;
  /** Use alertdialog for destructive confirms */
  role?: "dialog" | "alertdialog";
  titleId?: string;
  describedById?: string;
  padding?: string;
  onSubmit?: FormEventHandler<HTMLFormElement>;
}

export default function PortalModal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  zIndex = 50,
  disableBackdropClose = false,
  role = "dialog",
  titleId = "portal-modal-title",
  describedById,
  padding = "p-6",
  onSubmit,
}: PortalModalProps) {
  if (!open) return null;

  const canBackdropClose = !disableBackdropClose;
  const panelClass = `portal-modal-panel-enter ${portalModal.panel} ${SIZE_CLASS[size]} ${padding}`;

  const panelInner = (
    <>
      <ModalCloseButton onClick={onClose} />
      <h2 id={titleId} className={portalModal.title}>
        {title}
      </h2>
      {description ? (
        <div className={portalModal.subtitle}>{description}</div>
      ) : null}
      <div className={portalModal.body}>{children}</div>
      {footer ? <div className={portalModal.footer}>{footer}</div> : null}
    </>
  );

  return (
    <div
      className={`${portalModal.overlay} portal-modal-overlay-enter`}
      style={{ zIndex }}
      role="presentation"
      onClick={canBackdropClose ? onClose : undefined}
    >
      {onSubmit ? (
        <form
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={describedById}
          onSubmit={onSubmit}
          className={panelClass}
          onClick={(e) => e.stopPropagation()}
        >
          {panelInner}
        </form>
      ) : (
        <div
          role={role}
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={describedById}
          className={panelClass}
          onClick={(e) => e.stopPropagation()}
        >
          {panelInner}
        </div>
      )}
    </div>
  );
}

export function PortalModalActions({
  onCancel,
  cancelLabel = "Cancel",
  primaryLabel,
  onPrimary,
  primaryVariant = "primary",
  primaryDisabled,
  primaryLoading,
}: {
  onCancel: () => void;
  cancelLabel?: string;
  primaryLabel: string;
  onPrimary: () => void;
  primaryVariant?: "primary" | "success" | "danger";
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
}) {
  const primaryClass =
    primaryVariant === "danger"
      ? portalModal.btnDanger
      : primaryVariant === "success"
        ? portalModal.btnSuccess
        : portalModal.btnPrimary;

  return (
    <>
      <button type="button" onClick={onCancel} className={portalModal.btnCancel}>
        {cancelLabel}
      </button>
      <button
        type="button"
        onClick={onPrimary}
        disabled={primaryDisabled || primaryLoading}
        className={primaryClass}
      >
        {primaryLoading ? "Please wait…" : primaryLabel}
      </button>
    </>
  );
}
