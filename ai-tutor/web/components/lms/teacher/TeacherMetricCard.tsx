import Link from "next/link";
import type { TeacherMetric } from "@/types/teacher";
import {
  teacherMetricCardAccent,
  teacherMetricCardShadow,
  teacherMetricCardShell,
  teacherMetricCardWash,
  teacherMetricIcon,
  teacherMetricIconHover,
  teacherMetricIconStyle,
  teacherMetricLabelHover,
  teacherMetricTrendIcon,
  teacherMetricValueClass,
  TEACHER_METRIC_TREND_STYLES,
} from "@/lib/teacherMetricVisuals";

export default function TeacherMetricCard({
  metric,
  href,
}: {
  metric: TeacherMetric;
  href?: string;
}) {
  const trendType = metric.trend_type || "neutral";
  const trendClass =
    TEACHER_METRIC_TREND_STYLES[trendType] || TEACHER_METRIC_TREND_STYLES.neutral;
  const Icon = teacherMetricIcon(metric.label);
  const TrendIcon = teacherMetricTrendIcon(trendType);
  const valueClass = teacherMetricValueClass(metric.label);
  const statusLine = metric.trend?.replace(/^[↑↓]\s*/, "") || metric.sublabel;

  const cardClass = `group relative overflow-hidden rounded-xl border px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 sm:px-5 sm:py-4 ${href ? "cursor-pointer" : "cursor-default"} ${teacherMetricCardShell(metric.label)} ${teacherMetricCardShadow(metric.label)} ${teacherMetricCardAccent(metric.label)}`;

  const card = (
    <div className={cardClass}>
      <div
        className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${teacherMetricCardWash(metric.label)}`}
        aria-hidden
      />
      <div className="relative flex items-start gap-3.5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 ${teacherMetricIconStyle(metric.label)} ${teacherMetricIconHover(metric.label)}`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-semibold uppercase tracking-wide text-slate-500 transition-colors duration-200 ${teacherMetricLabelHover(metric.label)}`}
          >
            {metric.label}
          </p>
          <p
            className={`mt-1 text-[1.75rem] font-bold leading-none tabular-nums tracking-tight ${valueClass}`}
          >
            {metric.value}
          </p>
          {statusLine ? (
            <p
              className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${metric.trend ? trendClass : "text-slate-500"}`}
            >
              {metric.trend ? (
                <TrendIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
              ) : null}
              <span>{statusLine}</span>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
      >
        {card}
      </Link>
    );
  }

  return card;
}
