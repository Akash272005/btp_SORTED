"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";

interface Cell {
  topic: string;
  subject: string;
  score: number;
  level: string;
}

const LEVEL_BG: Record<string, string> = {
  high: "bg-indigo-200/90 text-indigo-900 hover:bg-indigo-300",
  medium: "bg-violet-200/80 text-violet-900 hover:bg-violet-300",
  low: "bg-rose-200/90 text-rose-900 hover:bg-rose-300",
};

export default function TopicHeatmap({
  cells,
  embedded = false,
}: {
  cells: Cell[];
  embedded?: boolean;
}) {
  const header = (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <BarChart3 className="h-4 w-4 text-indigo-600" aria-hidden />
        My Topic Heatmap
      </h2>
      <Link
        href="/student/analytics"
        className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
      >
        View all →
      </Link>
    </div>
  );

  const grid = (
      <div className="grid grid-cols-3 gap-2">
        {cells.map((c) => (
          <Link
            key={`${c.subject}-${c.topic}`}
            href={`/student/analytics?topic=${encodeURIComponent(c.topic)}`}
            title={`${c.topic}: ${c.score}%`}
            className={`flex min-h-[72px] flex-col items-center justify-center rounded-xl px-1 py-3 text-center transition-colors ${LEVEL_BG[c.level] || LEVEL_BG.medium}`}
          >
            <span className="text-[11px] font-bold leading-tight">
              {c.topic}
            </span>
            <span className="mt-1 text-sm font-bold">{c.score}%</span>
          </Link>
        ))}
      </div>
  );

  if (embedded) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50/50">
        <div className="border-b border-slate-100 bg-white/80 px-5 py-3.5">{header}</div>
        <div className="p-5 pt-4">{grid}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
      <div className="mb-4">{header}</div>
      {grid}
    </div>
  );
}
