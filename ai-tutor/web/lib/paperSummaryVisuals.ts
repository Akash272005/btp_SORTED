import type { PaperTab } from "@/lib/paperListUi";

export type PaperSummaryKey = "draft" | "ready" | "live" | "grade";

export const PAPER_SUMMARY_FILTER: Record<PaperSummaryKey, PaperTab> = {
  draft: "draft",
  ready: "ready",
  live: "live",
  grade: "grade",
};

const SUMMARY_THEME: Record<
  PaperSummaryKey,
  {
    shell: string;
    shadow: string;
    wash: string;
    icon: string;
    value: string;
    mutedShell: string;
  }
> = {
  draft: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-amber-300 hover:border-l-amber-500 hover:bg-amber-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(245,158,11,0.28)]",
    wash: "from-amber-500/12 via-amber-400/5 to-transparent",
    icon: "bg-amber-500 text-white shadow-sm",
    value: "text-amber-700",
    mutedShell:
      "border-slate-200/90 border-l-[3px] border-l-slate-200 bg-slate-50/80 opacity-90 hover:border-slate-300 hover:bg-slate-50",
  },
  ready: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-emerald-300 hover:border-l-emerald-500 hover:bg-emerald-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(16,185,129,0.28)]",
    wash: "from-emerald-500/12 via-emerald-400/5 to-transparent",
    icon: "bg-emerald-500 text-white shadow-sm",
    value: "text-emerald-700",
    mutedShell:
      "border-slate-200/90 border-l-[3px] border-l-slate-200 bg-slate-50/80 opacity-90 hover:border-slate-300 hover:bg-slate-50",
  },
  live: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-indigo-300 hover:border-l-indigo-500 hover:bg-indigo-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(99,102,241,0.28)]",
    wash: "from-indigo-500/12 via-indigo-400/5 to-transparent",
    icon: "bg-indigo-500 text-white shadow-sm",
    value: "text-indigo-700",
    mutedShell:
      "border-slate-200/90 border-l-[3px] border-l-slate-200 bg-slate-50/80 opacity-90 hover:border-slate-300 hover:bg-slate-50",
  },
  grade: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-rose-300 hover:border-l-rose-500 hover:bg-rose-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(244,63,94,0.28)]",
    wash: "from-rose-500/12 via-rose-400/5 to-transparent",
    icon: "bg-rose-500 text-white shadow-sm",
    value: "text-rose-700",
    mutedShell:
      "border-slate-200/90 border-l-[3px] border-l-slate-200 bg-slate-50/80 opacity-90 hover:border-slate-300 hover:bg-slate-50",
  },
};

export function paperSummaryTheme(key: PaperSummaryKey) {
  return SUMMARY_THEME[key];
}
