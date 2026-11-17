export type SubmissionSummaryKey = "submitted" | "inProgress" | "notStarted";

const SUBMISSION_THEME: Record<
  SubmissionSummaryKey,
  {
    shell: string;
    shadow: string;
    wash: string;
    icon: string;
    value: string;
    label: string;
  }
> = {
  submitted: {
    shell:
      "border-emerald-200/80 border-l-[4px] border-l-emerald-500 bg-gradient-to-r from-emerald-50 to-white",
    shadow: "shadow-sm shadow-emerald-100/80 hover:shadow-[0_8px_24px_-6px_rgba(16,185,129,0.35)]",
    wash: "from-emerald-400/20 via-emerald-300/10 to-transparent",
    icon: "bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-md shadow-emerald-200",
    value: "text-emerald-700",
    label: "text-emerald-600/80",
  },
  inProgress: {
    shell:
      "border-amber-200/80 border-l-[4px] border-l-amber-500 bg-gradient-to-r from-amber-50 to-white",
    shadow: "shadow-sm shadow-amber-100/80 hover:shadow-[0_8px_24px_-6px_rgba(245,158,11,0.35)]",
    wash: "from-amber-400/20 via-amber-300/10 to-transparent",
    icon: "bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-amber-200",
    value: "text-amber-700",
    label: "text-amber-600/80",
  },
  notStarted: {
    shell:
      "border-indigo-200/80 border-l-[4px] border-l-indigo-500 bg-gradient-to-r from-indigo-50 to-white",
    shadow: "shadow-sm shadow-indigo-100/80 hover:shadow-[0_8px_24px_-6px_rgba(99,102,241,0.35)]",
    wash: "from-indigo-400/20 via-violet-300/10 to-transparent",
    icon: "bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-200",
    value: "text-indigo-700",
    label: "text-indigo-600/80",
  },
};

export function submissionSummaryTheme(key: SubmissionSummaryKey) {
  return SUBMISSION_THEME[key];
}
