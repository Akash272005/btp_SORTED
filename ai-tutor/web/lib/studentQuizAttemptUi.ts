import { dashboardPage, dashboardSection, dashboardToolbar } from "@/lib/portalDashboardUi";

export const studentQuizAttemptUi = {
  page: dashboardPage.wrap,
  inner: `${dashboardPage.inner} ${dashboardPage.studentInner}`,
  questionPanel: dashboardSection.panel.glance,
  answerSheet:
    "overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm",
  answerSheetHeader:
    "border-b border-slate-200 bg-slate-50/80 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-slate-500",
  questionSection:
    "scroll-mt-28 border-l-[3px] border-l-transparent px-5 py-5 sm:px-6 sm:py-6",
  questionSectionAnswered: "border-l-emerald-400 bg-emerald-50/20",
  questionSectionReview: "border-l-amber-400 bg-amber-50/25",
  questionDivider: "mx-5 h-px bg-slate-300 sm:mx-6",
  sidePanel:
    "overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm",
  sidePanelHeader:
    "border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-700",
  progressTrack: "h-1.5 overflow-hidden rounded-full bg-slate-100",
  progressFill: "h-full rounded-full bg-indigo-500 transition-all duration-300",
  timerOk:
    "inline-flex items-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 text-sm font-semibold tabular-nums text-slate-700 shadow-sm",
  timerUrgent:
    "inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm font-semibold tabular-nums text-rose-700 shadow-sm",
  exitBtn: dashboardToolbar.ghostBtn,
  navDot:
    "flex h-9 w-9 items-center justify-center rounded-lg text-xs font-semibold transition-colors",
  navDotCurrent: "bg-indigo-600 text-white shadow-sm",
  navDotAnswered: "bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80",
  navDotReview: "bg-amber-100 text-amber-800 ring-1 ring-amber-200/80",
  navDotEmpty:
    "border border-slate-200 bg-white text-slate-800 shadow-sm hover:border-indigo-200 hover:bg-indigo-50",
  optionBase:
    "flex w-full cursor-pointer items-start gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-all duration-150",
  optionIdle:
    "border-slate-200/90 bg-white hover:border-indigo-200 hover:bg-indigo-50/40",
  optionSelected:
    "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200/80",
  optionLetterIdle:
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-900",
  optionLetterActive:
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white shadow-sm ring-2 ring-indigo-200",
  footerBar:
    "fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/90 bg-white/95 px-4 py-3 backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none",
  primaryBtn:
    "inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500 active:scale-[0.98] lg:flex-none",
  secondaryBtn:
    "inline-flex min-h-11 flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200/90 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-40 lg:flex-none lg:px-4",
} as const;
