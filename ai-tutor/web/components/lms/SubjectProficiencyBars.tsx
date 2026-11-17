import Link from "next/link";
import { TrendingUp } from "lucide-react";

interface SubjectRow {
  subject: string;
  accuracy: number;
  color: string;
}

export default function SubjectProficiencyBars({
  subjects,
  embedded = false,
}: {
  subjects: SubjectRow[];
  embedded?: boolean;
}) {
  const header = (
    <div className="flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <TrendingUp className="h-4 w-4 text-indigo-600" aria-hidden />
        Subject Accuracy
      </h2>
      <Link
        href="/student/analytics"
        className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
      >
        Details →
      </Link>
    </div>
  );

  const bars = (
      <div className="space-y-4">
        {subjects.map((s) => (
          <div key={s.subject}>
            <div className="mb-1.5 flex justify-between text-sm">
              <span className="font-medium text-slate-700">{s.subject}</span>
              <span className="font-semibold text-slate-600">{s.accuracy}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${s.accuracy}%`,
                  backgroundColor: s.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
  );

  if (embedded) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50/50">
        <div className="border-b border-slate-100 bg-white/80 px-5 py-3.5">{header}</div>
        <div className="p-5 pt-4">{bars}</div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
      <div className="mb-4">{header}</div>
      {bars}
    </div>
  );
}
