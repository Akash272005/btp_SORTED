import { portalList } from "@/lib/portalListUi";

/** Detail, tracking, grade, and builder layout tokens. */
export const portalDetail = {
  ...portalList,
  page: portalList.page,
  inner: portalList.inner,
  title: "text-xl font-bold tracking-tight text-slate-900 sm:text-2xl",
  meta: "mt-1 text-sm text-slate-500",
  stickySummary:
    "sticky top-11 z-[9] -mx-0 mb-6 rounded-xl border border-slate-100/80 bg-white/95 p-4 shadow-sm backdrop-blur-md supports-[backdrop-filter]:bg-white/90",
  metricCard:
    "rounded-xl border border-slate-100/80 bg-white p-3 text-center shadow-sm",
  metricValue: "text-2xl font-bold tabular-nums text-slate-900",
  metricLabel: "text-xs font-medium text-slate-500",
  infoCard:
    "rounded-xl border border-slate-100/80 bg-white p-4 text-sm text-slate-600 shadow-sm",
  tableWrap:
    "overflow-x-auto rounded-xl border border-slate-100/80 bg-white shadow-sm",
  table: "w-full min-w-[640px] text-left text-sm",
  thead: "sticky top-0 z-[1] bg-slate-50/95 text-xs font-semibold uppercase tracking-wide text-slate-500 backdrop-blur-sm",
  th: "px-4 py-3",
  tbody: "divide-y divide-slate-100",
  tr: "bg-white transition-colors even:bg-slate-50/40 hover:bg-indigo-50/30",
  td: "px-4 py-3",
  gradeCard:
    "rounded-xl border border-slate-100/80 bg-white p-4 shadow-sm",
  gradeCardCorrect: "border-emerald-100 bg-emerald-50/30",
  gradeCardWrong: "border-rose-100 bg-rose-50/30",
  gradeHeader:
    "rounded-xl border border-slate-100/80 bg-white p-5 shadow-sm",
  input:
    "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
  label: "text-xs font-medium text-slate-500",
  footerBar:
    "sticky bottom-0 z-10 -mx-6 mt-8 flex flex-wrap gap-2 border-t border-slate-200/80 bg-white/95 px-6 py-4 backdrop-blur-md supports-[backdrop-filter]:bg-white/90 lg:-mx-8",
  builderSection:
    "rounded-2xl border border-slate-100/80 bg-white p-4 shadow-sm lg:p-5",
  builderAside:
    "space-y-3 xl:sticky xl:top-6 xl:self-start",
} as const;
