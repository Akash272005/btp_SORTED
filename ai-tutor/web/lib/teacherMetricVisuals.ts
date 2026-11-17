/**
 * Icon and trend styling for admin/teacher dashboard KPI cards.
 */

import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ClipboardCheck,
  ClipboardList,
  Minus,
  TrendingDown,
  TrendingUp,
  Users,
  UserX,
} from "lucide-react";
import type { TeacherMetric } from "@/types/teacher";

const METRIC_ICONS: Record<string, LucideIcon> = {
  Students: Users,
  Teachers: Users,
  Classes: ClipboardList,
  "Avg Score": TrendingUp,
  "At-Risk Students": UserX,
  "Pending Reviews": ClipboardCheck,
  "Total Students": Users,
  "Weak Students": UserX,
  "Quizzes This Month": ClipboardList,
  "Pending Evaluations": ClipboardCheck,
};

const METRIC_ICON_STYLES: Record<string, string> = {
  Students: "bg-indigo-500 text-white shadow-sm",
  Teachers: "bg-sky-500 text-white shadow-sm",
  Classes: "bg-violet-500 text-white shadow-sm",
  "Avg Score": "bg-emerald-500 text-white shadow-sm",
  "At-Risk Students": "bg-amber-500 text-white shadow-sm",
  "Pending Reviews": "bg-rose-500 text-white shadow-sm",
  "Total Students": "bg-indigo-500 text-white shadow-sm",
  "Weak Students": "bg-amber-500 text-white shadow-sm",
  "Quizzes This Month": "bg-violet-500 text-white shadow-sm",
  "Pending Evaluations": "bg-rose-500 text-white shadow-sm",
};

/** White card at rest; hover shows each metric’s brand color clearly. */
const METRIC_CARD_THEME: Record<
  string,
  { shell: string; shadow: string; accent: string; wash: string; labelHover: string }
> = {
  Students: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-indigo-300 hover:border-l-indigo-500 hover:bg-indigo-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(99,102,241,0.35)]",
    accent: "ring-0 hover:ring-2 hover:ring-indigo-200/80",
    wash: "from-indigo-500/14 via-indigo-400/6 to-transparent",
    labelHover: "group-hover:text-indigo-600",
  },
  Teachers: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-sky-300 hover:border-l-sky-500 hover:bg-sky-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(14,165,233,0.32)]",
    accent: "ring-0 hover:ring-2 hover:ring-sky-200/80",
    wash: "from-sky-500/14 via-sky-400/6 to-transparent",
    labelHover: "group-hover:text-sky-700",
  },
  Classes: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-violet-300 hover:border-l-violet-500 hover:bg-violet-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(139,92,246,0.32)]",
    accent: "ring-0 hover:ring-2 hover:ring-violet-200/80",
    wash: "from-violet-500/14 via-violet-400/6 to-transparent",
    labelHover: "group-hover:text-violet-700",
  },
  "Avg Score": {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-emerald-300 hover:border-l-emerald-500 hover:bg-emerald-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(16,185,129,0.32)]",
    accent: "ring-0 hover:ring-2 hover:ring-emerald-200/80",
    wash: "from-emerald-500/14 via-emerald-400/6 to-transparent",
    labelHover: "group-hover:text-emerald-700",
  },
  "At-Risk Students": {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-amber-300 hover:border-l-amber-500 hover:bg-amber-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(245,158,11,0.32)]",
    accent: "ring-0 hover:ring-2 hover:ring-amber-200/80",
    wash: "from-amber-500/14 via-amber-400/6 to-transparent",
    labelHover: "group-hover:text-amber-700",
  },
  "Pending Reviews": {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-rose-300 hover:border-l-rose-500 hover:bg-rose-50",
    shadow: "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(244,63,94,0.32)]",
    accent: "ring-0 hover:ring-2 hover:ring-rose-200/80",
    wash: "from-rose-500/14 via-rose-400/6 to-transparent",
    labelHover: "group-hover:text-rose-700",
  },
  "Total Students": {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-indigo-300 hover:border-l-indigo-500 hover:bg-indigo-50",
    shadow:
      "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(99,102,241,0.35)]",
    accent: "ring-0 hover:ring-2 hover:ring-indigo-200/80",
    wash: "from-indigo-500/14 via-indigo-400/6 to-transparent",
    labelHover: "group-hover:text-indigo-600",
  },
  "Weak Students": {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-amber-300 hover:border-l-amber-500 hover:bg-amber-50",
    shadow:
      "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(245,158,11,0.32)]",
    accent: "ring-0 hover:ring-2 hover:ring-amber-200/80",
    wash: "from-amber-500/14 via-amber-400/6 to-transparent",
    labelHover: "group-hover:text-amber-700",
  },
  "Quizzes This Month": {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-violet-300 hover:border-l-violet-500 hover:bg-violet-50",
    shadow:
      "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(139,92,246,0.32)]",
    accent: "ring-0 hover:ring-2 hover:ring-violet-200/80",
    wash: "from-violet-500/14 via-violet-400/6 to-transparent",
    labelHover: "group-hover:text-violet-700",
  },
  "Pending Evaluations": {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-transparent bg-white hover:border-rose-300 hover:border-l-rose-500 hover:bg-rose-50",
    shadow:
      "shadow-sm hover:shadow-[0_8px_24px_-6px_rgba(244,63,94,0.32)]",
    accent: "ring-0 hover:ring-2 hover:ring-rose-200/80",
    wash: "from-rose-500/14 via-rose-400/6 to-transparent",
    labelHover: "group-hover:text-rose-700",
  },
};

const DEFAULT_THEME = {
  shell: "border-slate-200/90 bg-white hover:bg-slate-50",
  shadow: "shadow-sm",
  accent: "",
  wash: "from-slate-400/10 to-transparent",
  labelHover: "",
};

function metricTheme(label: string) {
  return METRIC_CARD_THEME[label] ?? DEFAULT_THEME;
}

export function teacherMetricIcon(label: string): LucideIcon {
  return METRIC_ICONS[label] ?? ClipboardList;
}

export function teacherMetricIconStyle(label: string): string {
  return METRIC_ICON_STYLES[label] ?? "bg-slate-400 text-white";
}

export function teacherMetricCardShell(label: string): string {
  return metricTheme(label).shell;
}

export function teacherMetricCardShadow(label: string): string {
  return metricTheme(label).shadow;
}

export function teacherMetricCardAccent(label: string): string {
  return metricTheme(label).accent;
}

export function teacherMetricCardWash(label: string): string {
  return metricTheme(label).wash;
}

export function teacherMetricLabelHover(label: string): string {
  return metricTheme(label).labelHover;
}

export function teacherMetricIconHover(label: string): string {
  const map: Record<string, string> = {
    Students: "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-indigo-500/30",
    Teachers: "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-sky-500/30",
    Classes: "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-violet-500/30",
    "Avg Score":
      "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-emerald-500/30",
    "At-Risk Students":
      "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-amber-500/30",
    "Pending Reviews":
      "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-rose-500/30",
    "Total Students": "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-indigo-500/30",
    "Weak Students": "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-amber-500/30",
    "Quizzes This Month":
      "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-violet-500/30",
    "Pending Evaluations":
      "group-hover:scale-105 group-hover:shadow-md group-hover:shadow-rose-500/30",
  };
  return map[label] ?? "";
}

export function teacherMetricTrendIcon(
  trendType: TeacherMetric["trend_type"],
): LucideIcon {
  switch (trendType) {
    case "up":
      return TrendingUp;
    case "down":
      return TrendingDown;
    case "warn":
      return AlertTriangle;
    default:
      return Minus;
  }
}

export const TEACHER_METRIC_TREND_STYLES = {
  up: "text-emerald-600",
  down: "text-amber-600",
  warn: "text-amber-600",
  neutral: "text-slate-500",
} as const;

export function teacherMetricValueClass(label: string): string {
  const map: Record<string, string> = {
    Students: "text-indigo-700",
    Teachers: "text-sky-700",
    Classes: "text-violet-700",
    "Avg Score": "text-emerald-700",
    "At-Risk Students": "text-amber-700",
    "Pending Reviews": "text-rose-700",
    "Total Students": "text-indigo-700",
    "Weak Students": "text-amber-700",
    "Quizzes This Month": "text-violet-700",
    "Pending Evaluations": "text-rose-700",
  };
  return map[label] ?? "text-slate-900";
}
