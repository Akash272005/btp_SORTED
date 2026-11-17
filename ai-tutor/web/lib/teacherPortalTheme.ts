/** Light theme classes for teacher LMS pages (aligned with student portal). */
export const teacherPortal = {
  page: "min-h-full bg-[#F9FAFB]",
  inner: "w-full max-w-[1280px] px-6 py-6 lg:px-8 lg:py-8",
  backLink:
    "mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-indigo-600",
  h1: "text-2xl font-bold text-slate-900",
  subtitle: "mt-1 text-sm text-slate-500",
  section: "rounded-2xl border border-slate-100/80 bg-white p-4 shadow-sm",
  card: "rounded-xl border border-slate-100/80 bg-white p-4 shadow-sm",
  cardTitle: "font-semibold text-slate-900",
  cardMeta: "mt-1 text-xs text-slate-500",
  empty: "rounded-2xl border border-dashed border-slate-200 p-10 text-center",
  emptyTitle: "text-slate-600",
  secondaryBtn:
    "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50",
  tabInactive:
    "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
  tabCountInactive: "bg-slate-100",
  hintBox:
    "mb-4 rounded-xl border border-slate-100/80 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm",
  linkAccent: "text-sm font-medium text-indigo-600 hover:text-indigo-700",
  badgePublished:
    "bg-emerald-100 text-emerald-700",
  badgeDraft: "bg-amber-100 text-amber-700",
  badgeIndigo: "bg-indigo-100 text-indigo-700",
  deleteBtn:
    "inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50",
  input:
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm",
  select:
    "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 shadow-sm disabled:opacity-60",
} as const;
