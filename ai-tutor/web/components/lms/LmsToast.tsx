"use client";

import { Copy } from "lucide-react";
import type { LmsToastState } from "@/hooks/useLmsToast";

/** Fixed bottom-right toast (teacher dark + student light portals). */
export default function LmsToast({
  toast,
  theme = "dark",
}: {
  toast: LmsToastState;
  theme?: "dark" | "light";
}) {
  if (!toast) return null;

  const isError = toast.variant === "error";
  const dark =
    theme === "dark"
      ? isError
        ? "bg-rose-600 text-white"
        : "bg-emerald-600 text-white"
      : isError
        ? "bg-red-600 text-white"
        : "bg-emerald-600 text-white";

  const shell =
    theme === "light"
      ? "border border-white/20 shadow-xl ring-1 ring-black/5"
      : "shadow-lg";

  const handleCopy = () => {
    if (!toast.copyText) return;
    void navigator.clipboard.writeText(toast.copyText);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={`portal-toast-enter fixed bottom-6 right-4 z-[60] max-w-[min(100vw-2rem,28rem)] rounded-xl px-4 py-3 text-sm font-medium sm:right-6 ${shell} ${dark}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex-1 leading-snug">{toast.message}</span>
        {toast.copyText ? (
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded-md p-1 opacity-90 hover:bg-white/15 hover:opacity-100"
            aria-label="Copy password"
            title="Copy password"
          >
            <Copy className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
