/** Shared layout tokens for teacher & student dashboards (visual only). */
export const dashboardPage = {
  wrap: "min-h-full bg-[#F9FAFB]",
  inner: "w-full px-6 py-7 lg:px-8 lg:py-8",
  teacherInner: "mx-auto max-w-[1280px]",
  studentInner: "mx-auto max-w-[1280px]",
} as const;

export type DashboardSectionVariant =
  | "default"
  | "glance"
  | "attention"
  | "exams"
  | "insights";

const PANEL_BASE =
  "overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm sm:p-6";

export const dashboardSection = {
  root: "mb-10 last:mb-6",
  heading: "mb-4 flex flex-wrap items-center justify-between gap-3",
  title: "text-base font-bold tracking-tight text-slate-900",
  description: "mt-1 text-sm text-slate-500",
  titleRow: "flex items-center gap-2.5",
  accentDot: "h-2 w-2 shrink-0 rounded-full",
  action:
    "text-sm font-semibold text-indigo-600 transition-colors hover:text-indigo-700",
  panel: {
    default: "",
    glance: `${PANEL_BASE} border-l-[3px] border-l-indigo-500`,
    attention: `${PANEL_BASE} border-l-[3px] border-l-amber-500`,
    exams: `${PANEL_BASE} border-l-[3px] border-l-teal-500`,
    insights: `${PANEL_BASE} border-l-[3px] border-l-slate-300`,
  },
  accent: {
    glance: "bg-indigo-500",
    attention: "bg-amber-500",
    exams: "bg-teal-500",
    insights: "bg-slate-400",
    default: "bg-slate-400",
  },
  /** Inner cards inside white panels */
  innerCard: "rounded-xl border border-slate-200/90 bg-white shadow-sm",
} as const;

export const dashboardToolbar = {
  actions: "flex flex-wrap items-center gap-2",
  primaryGroup: "flex flex-wrap items-center gap-2",
  ghostBtn:
    "inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-sm font-medium text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50",
} as const;

export const upcomingExamsUi = {
  list: "space-y-2.5",
  headerIcon:
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-600 ring-1 ring-teal-100",
  row:
    "group flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-slate-50/40 p-4 transition-all duration-200 hover:border-teal-200/90 hover:bg-teal-50/50 hover:shadow-sm sm:flex-row sm:items-center sm:gap-4",
  dateBlock:
    "flex w-[4rem] shrink-0 flex-col items-center justify-center rounded-lg bg-teal-600 px-2 py-2 text-white shadow-sm",
  dateDay: "text-lg font-bold tabular-nums leading-none",
  dateMonth: "mt-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-100",
  expandBtn:
    "inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800",
  headerActions: "flex flex-wrap items-center justify-end gap-2 sm:gap-3",
} as const;

export const dashboardHeader = {
  date: "text-xs font-semibold uppercase tracking-[0.12em] text-slate-400",
  title: "text-[1.65rem] font-bold tracking-tight text-slate-900",
  subtitle: "text-sm text-slate-500",
  pill:
    "inline-flex items-center rounded-full border border-indigo-200/80 bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700",
  primaryBtn:
    "inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 active:scale-[0.98]",
  secondaryBtn:
    "inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50",
  accentBtn:
    "inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-500 active:scale-[0.98]",
  select:
    "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-slate-300 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
} as const;
