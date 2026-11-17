"use client";

import { Search, X } from "lucide-react";
import { portalList } from "@/lib/portalListUi";

type PortalListSearchVariant = "full" | "inline";

interface PortalListSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  resultCount?: number;
  totalCount?: number;
  variant?: PortalListSearchVariant;
}

export default function PortalListSearch({
  value,
  onChange,
  placeholder = "Search by title or subject…",
  resultCount,
  totalCount,
  variant = "full",
}: PortalListSearchProps) {
  const showCount =
    value.trim().length > 0 &&
    resultCount !== undefined &&
    totalCount !== undefined;

  const isInline = variant === "inline";

  return (
    <div
      className={
        isInline
          ? "w-full shrink-0 sm:w-52 lg:w-60"
          : "w-full space-y-2"
      }
    >
      <div className="relative w-full">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={
            isInline
              ? `${portalList.search} py-2 text-sm`
              : portalList.search
          }
          aria-label="Search list"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {showCount && !isInline ? (
        <p className="text-xs text-slate-500">
          Showing {resultCount} of {totalCount}
        </p>
      ) : null}
      {showCount && isInline ? (
        <p className="mt-1 text-[11px] text-slate-500 tabular-nums">
          {resultCount} of {totalCount}
        </p>
      ) : null}
    </div>
  );
}
