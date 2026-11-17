import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { WeakStudentRow } from "@/types/teacher";

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-blue-500",
  "bg-cyan-500",
];

function barColor(score: number): string {
  if (score < 45) return "bg-rose-500";
  if (score < 55) return "bg-orange-500";
  return "bg-amber-500";
}

export default function WeakStudentsPanel({
  students,
  embedded = false,
}: {
  students: WeakStudentRow[];
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
          <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden />
          Weak Students
        </h2>
        <Link
          href="/teacher/reports"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          All reports →
        </Link>
      </div>
      <ul className="divide-y divide-slate-100">
        {students.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 px-5 py-4">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${AVATAR_COLORS[i % AVATAR_COLORS.length]}`}
            >
              {s.initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900">{s.full_name}</p>
              <p className="truncate text-xs text-slate-500">{s.topics_label}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full ${barColor(s.avg_score)}`}
                  style={{ width: `${Math.min(s.avg_score, 100)}%` }}
                />
              </div>
            </div>
            <span
              className={`shrink-0 text-lg font-bold tabular-nums ${
                s.avg_score < 45
                  ? "text-rose-600"
                  : s.avg_score < 55
                    ? "text-orange-600"
                    : "text-amber-600"
              }`}
            >
              {Math.round(s.avg_score)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
