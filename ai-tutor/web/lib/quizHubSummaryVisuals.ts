import type { QuizHubTab } from "@/lib/quizHubListUi";

export type QuizHubSummaryKey = "draft" | "ready" | "live" | "completed";

export const QUIZ_HUB_SUMMARY_FILTER: Record<QuizHubSummaryKey, QuizHubTab> = {
  draft: "draft",
  ready: "ready",
  live: "live",
  completed: "completed",
};

const SUMMARY_THEME: Record<
  QuizHubSummaryKey,
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
  completed: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-violet-300 hover:border-l-violet-500 hover:bg-violet-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(139,92,246,0.28)]",
    wash: "from-violet-500/12 via-violet-400/5 to-transparent",
    icon: "bg-violet-500 text-white shadow-sm",
    value: "text-violet-700",
    mutedShell:
      "border-slate-200/90 border-l-[3px] border-l-slate-200 bg-slate-50/80 opacity-90 hover:border-slate-300 hover:bg-slate-50",
  },
};

export function quizHubSummaryTheme(key: QuizHubSummaryKey) {
  return SUMMARY_THEME[key];
}
