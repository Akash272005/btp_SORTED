/** Modal & form field tokens (teacher + student portals). */
export const portalModal = {
  overlay:
    "fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] transition-opacity",
  panel:
    "relative max-h-[min(90vh,900px)] w-full overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-2xl",
  panelSm: "max-w-md",
  panelMd: "max-w-lg",
  panelLg: "max-w-2xl",
  panelXl: "max-w-4xl",
  closeBtn:
    "absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40",
  closeBtnInline:
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40",
  title: "pr-10 text-lg font-semibold text-slate-900",
  subtitle: "mt-1 text-sm text-slate-500",
  body: "mt-4 space-y-3",
  label: "text-xs font-medium text-slate-500",
  input:
    "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
  textarea:
    "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
  error: "text-sm text-rose-600",
  footer: "mt-6 flex flex-wrap justify-end gap-2",
  btnCancel:
    "rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]",
  btnPrimary:
    "rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-500 active:scale-[0.98] disabled:opacity-50",
  btnSuccess:
    "rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-emerald-500 active:scale-[0.98] disabled:opacity-50",
  btnDanger:
    "inline-flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-rose-500 active:scale-[0.98] disabled:opacity-50",
} as const;
