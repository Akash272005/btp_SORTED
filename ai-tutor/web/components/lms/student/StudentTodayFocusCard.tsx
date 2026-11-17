import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export default function StudentTodayFocusCard({
  examMessage,
  aiInsight,
}: {
  examMessage: string;
  aiInsight: string;
}) {
  return (
    <div className="group flex items-start gap-4 rounded-xl border border-slate-200/90 border-l-[3px] border-l-amber-500 bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-px hover:border-amber-200 hover:bg-amber-50/40 hover:shadow-md sm:p-5">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
        <Sparkles className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold text-slate-900">{examMessage}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{aiInsight}</p>
        <Link
          href="/student/planner"
          className="mt-2.5 inline-flex items-center gap-1 text-sm font-semibold text-amber-700 transition-colors group-hover:text-amber-800"
        >
          Study planner
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Soon
          </span>
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      </div>
    </div>
  );
}
