"use client";

import { Check, Loader2 } from "lucide-react";
import type { ThinkingTraceStep } from "@/types/chat";

export function ThinkingShimmerLabel({ text }: { text: string }) {
  return (
    <span className="text-[15px] font-medium tracking-tight select-none inline-block bg-gradient-to-r from-slate-500 from-[18%] via-slate-100 via-1/2 to-slate-600 to-[82%] bg-[length:220%_100%] bg-clip-text text-transparent animate-thinking-shimmer">
      {text}
    </span>
  );
}

export function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ThinkingTraceList({
  steps,
  t,
}: {
  steps: ThinkingTraceStep[];
  t: (key: string) => string;
}) {
  return (
    <ul className="mb-0 space-y-2.5 text-left">
      {steps.map((row) => (
        <li
          key={row.phase}
          className="flex items-start gap-2.5 text-[13px] leading-snug"
        >
          {row.status === "done" ? (
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400"
              strokeWidth={2.5}
              aria-hidden
            />
          ) : row.status === "active" ? (
            <Loader2
              className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-100"
              aria-hidden
            />
          ) : (
            <span
              className="mt-1 h-3 w-3 shrink-0 rounded-full border border-slate-400/90"
              aria-hidden
            />
          )}
          <span className="flex items-baseline gap-2 min-w-0">
            <span
              className={
                row.status === "pending" ? "text-slate-300" : "text-slate-100"
              }
            >
              {t(`thinking.trace.${row.phase}`)}
            </span>
            {row.status === "done" && row.elapsedMs !== undefined && (
              <span className="text-[11px] text-slate-400 shrink-0">
                {formatElapsed(row.elapsedMs)}
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
