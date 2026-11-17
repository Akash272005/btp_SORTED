/** Shared list-page layout tokens (teacher portal). */
export const portalList = {
  page: "min-h-full bg-[#F9FAFB]",
  inner: "mx-auto w-full max-w-[1280px] px-6 py-6 lg:px-8 lg:py-8",
  innerStudent:
    "mx-auto w-full max-w-[1200px] px-6 py-6 lg:px-8 lg:py-8",
  backLink:
    "mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-indigo-600",
  titleBackBtn:
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-indigo-600",
  /** Subtitle lines up with title when back arrow is beside h1 (9 + 12 + 9 = 48px inset). */
  titleSubtitleInset: "pl-12",
  toolbarStack: "flex w-full flex-col gap-4",
  filterPanel:
    "rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm sm:p-5",
  pageActionRow: "mb-6 flex flex-wrap items-center justify-end gap-3",
  h1: "text-2xl font-bold tracking-tight text-slate-900",
  subtitle: "max-w-3xl text-sm leading-relaxed text-slate-500",
  primaryBtn:
    "inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 active:scale-[0.98]",
  search:
    "w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
  hintBox:
    "mb-4 rounded-xl border border-slate-200/90 bg-white px-4 py-3 text-sm leading-relaxed text-slate-600 shadow-sm",
  list: "space-y-2",
  /** Single card wrapping list rows (no gap between items). Avoid overflow-hidden so row actions stay clickable. */
  listPanel:
    "rounded-2xl border border-slate-200/90 bg-white shadow-sm",
  row: "rounded-xl border border-slate-200/90 bg-white p-4 shadow-sm transition-all hover:border-slate-300/80 hover:shadow-md",
  rowDivided:
    "px-4 py-4 transition-colors hover:bg-slate-50/80 sm:px-5",
  rowHighlight: "border-amber-200/90 bg-amber-50/20 hover:border-amber-200",
  rowInner:
    "flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6",
  rowMain: "flex min-w-0 flex-1 gap-4",
  rowIcon:
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
  rowTitle: "font-semibold text-slate-900",
  rowMeta: "mt-1 text-xs leading-relaxed text-slate-500",
  badge:
    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
  badgePublished: "bg-emerald-100 text-emerald-700",
  badgeDraft: "bg-amber-100 text-amber-700",
  badgeIndigo: "bg-indigo-100 text-indigo-700",
  badgeWarn: "bg-amber-100 text-amber-800",
  actionGhost:
    "inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]",
  actionPrimary:
    "inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500",
  actionIndigo:
    "inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800 transition-colors hover:bg-indigo-100",
  actionGrade:
    "inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition-colors hover:bg-amber-100",
  deleteBtn:
    "inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-50",
} as const;
