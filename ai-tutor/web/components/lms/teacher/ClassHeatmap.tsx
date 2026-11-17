"use client";

import Link from "next/link";
import { BarChart3 } from "lucide-react";
import type { HeatmapStudent } from "@/types/teacher";

function cellStyle(score: number): string {
  if (score >= 80) return "bg-emerald-600/90 text-white";
  if (score >= 60) return "bg-emerald-500/70 text-white";
  if (score >= 40) return "bg-amber-500/80 text-white";
  return "bg-rose-600/90 text-white";
}

export default function ClassHeatmap({
  topics,
  students,
  embedded = false,
}: {
  topics: string[];
  students: HeatmapStudent[];
  /** Inside a dashboard section panel — no extra outer card chrome. */
  embedded?: boolean;
}) {
  const shell = embedded
    ? "overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50/50"
    : "overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm";

  return (
    <div className={shell}>
      <div
        className={`flex items-center justify-between border-b border-slate-100 px-5 py-3.5 ${embedded ? "bg-white/80" : ""}`}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <BarChart3 className="h-4 w-4 text-indigo-600" aria-hidden />
          Class Proficiency Heatmap
        </h2>
        <Link
          href="/teacher/analytics"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          Full view →
        </Link>
      </div>
      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[520px] border-collapse text-center text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-2 py-2 text-left font-medium text-slate-500" />
              {topics.map((t) => (
                <th
                  key={t}
                  className="px-1.5 py-2 font-semibold text-slate-700"
                >
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-left text-sm font-medium text-slate-800">
                  {s.short_name}
                </td>
                {topics.map((t) => {
                  const score = s.scores[t] ?? 0;
                  return (
                    <td key={t} className="p-1">
                      <div
                        className={`rounded-lg px-2 py-2 font-bold tabular-nums ${cellStyle(score)}`}
                        title={`${s.name} · ${t}: ${score}%`}
                      >
                        {Math.round(score)}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
