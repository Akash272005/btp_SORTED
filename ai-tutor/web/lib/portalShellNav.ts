/** Shared nav link styles for portal sidebar (visual only). */
export function portalNavLinkClassName(
  active: boolean,
  collapsed: boolean,
): string {
  const base =
    "relative flex items-center rounded-lg text-[15px] font-semibold leading-snug transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 focus-visible:ring-offset-1";
  const layout = collapsed
    ? "justify-center px-2 py-2.5"
    : "gap-3 px-3 py-2.5";
  if (active) {
    const rail =
      "before:pointer-events-none before:absolute before:top-1/2 before:h-7 before:w-[3px] before:-translate-y-1/2 before:rounded-r-full before:bg-indigo-600 before:content-['']";
    const railPos = collapsed ? "before:left-0.5" : "before:left-0";
    return `${base} ${layout} ${rail} ${railPos} bg-indigo-50/95 text-indigo-800 shadow-sm ring-1 ring-inset ring-indigo-100/70`;
  }
  return `${base} ${layout} text-slate-900 hover:bg-slate-50/90 hover:text-slate-950`;
}

export function portalNavGroupDividerClassName(
  isFirst: boolean,
  collapsed: boolean,
): string {
  if (isFirst) return "hidden";
  return collapsed
    ? "mx-2 my-3 h-px shrink-0 bg-slate-200/70"
    : "mx-3 mb-1 mt-4 h-px shrink-0 bg-slate-100";
}
