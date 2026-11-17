"use client";

/** Toast hook for admin pages — supports optional copy-to-clipboard (e.g. generated passwords). */

import { useCallback, useState } from "react";

export type LmsToastVariant = "success" | "error";

export type LmsToastOptions = {
  durationMs?: number;
  copyText?: string;
};

export type LmsToastState = {
  message: string;
  variant: LmsToastVariant;
  copyText?: string;
} | null;

/** Short-lived toast for LMS teacher/student flows. */
export function useLmsToast(defaultDurationMs = 3500) {
  const [toast, setToast] = useState<LmsToastState>(null);

  const show = useCallback(
    (message: string, variant: LmsToastVariant = "success", options?: LmsToastOptions) => {
      const duration = options?.durationMs ?? defaultDurationMs;
      setToast({ message, variant, copyText: options?.copyText });
      window.setTimeout(() => setToast(null), duration);
    },
    [defaultDurationMs],
  );

  const showSuccess = useCallback(
    (message: string, options?: LmsToastOptions) => show(message, "success", options),
    [show],
  );
  const showError = useCallback(
    (message: string, options?: LmsToastOptions) => show(message, "error", options),
    [show],
  );
  const dismiss = useCallback(() => setToast(null), []);

  return { toast, show, showSuccess, showError, dismiss };
}
