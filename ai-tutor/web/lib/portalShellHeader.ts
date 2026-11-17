/** Fixed portal top bar (teacher shell). */
export const portalShellHeader = {
  bar: "sticky top-0 z-10 flex min-h-[3.75rem] shrink-0 items-center justify-between gap-4 border-b-2 border-slate-300 bg-white px-6 py-2 shadow-[0_1px_3px_rgba(15,23,42,0.06)] lg:px-8",
  titleBackBtn:
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200/80 bg-white text-slate-600 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-indigo-600",
  pageTitle:
    "truncate text-2xl font-bold tracking-tight text-slate-900",
  breadcrumb:
    "truncate text-xl font-semibold text-slate-600 transition-colors hover:text-indigo-700",
  breadcrumbCurrent: "truncate text-xl font-bold tracking-tight text-slate-900",
  toolbar:
    "border-b border-slate-200/80 bg-white/95 px-6 py-3.5 lg:px-8",
  toolbarInner:
    "mx-auto flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-3",
  userBtn:
    "flex items-center gap-2 rounded-full border border-slate-200/90 bg-slate-50/80 py-1 pl-3 pr-1.5 shadow-sm transition-all hover:border-slate-300 hover:bg-white hover:shadow",
  userName: "hidden max-w-[160px] truncate text-sm font-semibold text-slate-900 sm:inline",
} as const;
