export type StudentStatTone = "emerald" | "amber" | "rose" | "violet" | "indigo";

const STAT_THEME: Record<
  StudentStatTone,
  { shell: string; shadow: string; accent: string; wash: string; labelHover: string; value: string; icon: string; iconHover: string }
> = {
  emerald: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-emerald-300 hover:border-l-emerald-500 hover:bg-emerald-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(16,185,129,0.28)]",
    accent: "ring-0 hover:ring-2 hover:ring-emerald-200/80",
    wash: "from-emerald-500/14 via-emerald-400/6 to-transparent",
    labelHover: "group-hover:text-emerald-700",
    value: "text-emerald-700",
    icon: "bg-emerald-500 text-white shadow-sm",
    iconHover: "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-emerald-500/30",
  },
  amber: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-amber-300 hover:border-l-amber-500 hover:bg-amber-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(245,158,11,0.28)]",
    accent: "ring-0 hover:ring-2 hover:ring-amber-200/80",
    wash: "from-amber-500/14 via-amber-400/6 to-transparent",
    labelHover: "group-hover:text-amber-700",
    value: "text-amber-700",
    icon: "bg-amber-500 text-white shadow-sm",
    iconHover: "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-amber-500/30",
  },
  rose: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-rose-300 hover:border-l-rose-500 hover:bg-rose-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(244,63,94,0.28)]",
    accent: "ring-0 hover:ring-2 hover:ring-rose-200/80",
    wash: "from-rose-500/14 via-rose-400/6 to-transparent",
    labelHover: "group-hover:text-rose-700",
    value: "text-rose-700",
    icon: "bg-rose-500 text-white shadow-sm",
    iconHover: "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-rose-500/30",
  },
  violet: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-violet-300 hover:border-l-violet-500 hover:bg-violet-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(139,92,246,0.28)]",
    accent: "ring-0 hover:ring-2 hover:ring-violet-200/80",
    wash: "from-violet-500/14 via-violet-400/6 to-transparent",
    labelHover: "group-hover:text-violet-700",
    value: "text-violet-700",
    icon: "bg-violet-500 text-white shadow-sm",
    iconHover: "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-violet-500/30",
  },
  indigo: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-indigo-300 hover:border-l-indigo-500 hover:bg-indigo-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(99,102,241,0.28)]",
    accent: "ring-0 hover:ring-2 hover:ring-indigo-200/80",
    wash: "from-indigo-500/14 via-indigo-400/6 to-transparent",
    labelHover: "group-hover:text-indigo-700",
    value: "text-indigo-700",
    icon: "bg-indigo-500 text-white shadow-sm",
    iconHover: "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-indigo-500/30",
  },
};

const DEFAULT = STAT_THEME.indigo;

export function studentStatTheme(tone?: StudentStatTone) {
  return tone ? STAT_THEME[tone] : DEFAULT;
}
