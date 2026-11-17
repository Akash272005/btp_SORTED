"use client";

import { X } from "lucide-react";
import { portalModal } from "@/lib/portalModalUi";

type Props = {
  onClick: () => void;
  disabled?: boolean;
  /** Pin to top-right of a relative modal panel (default). */
  absolute?: boolean;
  className?: string;
  "aria-label"?: string;
};

/** Round bordered X — matches Delete quiz confirm dialogs. */
export default function ModalCloseButton({
  onClick,
  disabled,
  absolute = true,
  className = "",
  "aria-label": ariaLabel = "Close",
}: Props) {
  const base = absolute ? portalModal.closeBtn : portalModal.closeBtnInline;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${className}`.trim()}
      aria-label={ariaLabel}
    >
      <X className="h-4 w-4" aria-hidden />
    </button>
  );
}
