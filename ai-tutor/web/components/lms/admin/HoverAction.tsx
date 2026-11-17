"use client";

import type { ReactNode } from "react";

type HoverActionProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

/** Wraps an icon button/link with a visible label on hover (compact admin table actions). */
export function HoverAction({ label, children, className = "" }: HoverActionProps) {
  return (
    <div className={`group/action relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] font-medium text-white opacity-0 shadow-md transition-opacity duration-150 group-hover/action:opacity-100 dark:bg-slate-100 dark:text-slate-900"
      >
        {label}
      </span>
    </div>
  );
}
