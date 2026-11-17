"use client";

import { portalList } from "@/lib/portalListUi";

export type PortalTabItem<T extends string> = {
  id: T;
  label: string;
  count?: number;
  /** Amber active state (e.g. To grade). */
  accent?: "default" | "warning";
};

type PortalFilterTabsVariant = "segmented" | "toolbar";

interface PortalFilterTabsProps<T extends string> {
  tabs: PortalTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  variant?: PortalFilterTabsVariant;
}

export default function PortalFilterTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
  variant = "segmented",
}: PortalFilterTabsProps<T>) {
  const tablistClass =
    variant === "toolbar"
      ? "flex min-w-0 flex-1 flex-wrap items-center gap-x-0.5 gap-y-1"
      : "flex w-full flex-wrap gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-1";

  return (
    <div className={tablistClass} role="tablist" aria-label={ariaLabel}>
      {tabs.map((t) => {
        const isActive = active === t.id;
        const isWarn = t.accent === "warning";
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.id)}
            className={`relative text-sm font-bold transition-all ${
              variant === "toolbar"
                ? `rounded-lg px-3 py-2 ${
                    isActive
                      ? isWarn
                        ? "bg-amber-600 text-white shadow-sm"
                        : "text-indigo-800"
                      : "text-slate-900 hover:bg-slate-50 hover:text-slate-950"
                  }`
                : `rounded-lg px-4 py-2 ${
                    isActive
                      ? isWarn
                        ? "bg-amber-600 text-white shadow-sm"
                        : "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/80"
                      : "border border-transparent text-slate-600 hover:bg-white/60 hover:text-slate-900"
                  }`
            }`}
          >
            {t.label}
            {t.count !== undefined ? (
              <span
                className={`ml-2 rounded-md px-1.5 py-0.5 text-xs tabular-nums ${
                  isActive
                    ? isWarn
                      ? "bg-amber-500/80 text-white"
                      : "bg-indigo-50 text-indigo-700"
                    : "bg-slate-200/80 text-slate-800"
                }`}
              >
                {t.count}
              </span>
            ) : null}
            {isActive ? (
              <span
                className={`absolute inset-x-2 -bottom-px h-0.5 rounded-full ${
                  isWarn ? "bg-amber-300" : "bg-indigo-500"
                }`}
                aria-hidden
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Compact secondary filters (e.g. Ready: not sent / all). */
export function PortalSubFilterTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive
                ? t.id === "all"
                  ? "bg-slate-700 text-white shadow-sm"
                  : "bg-emerald-600 text-white shadow-sm"
                : "rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
