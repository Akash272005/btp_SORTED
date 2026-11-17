import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { TrendingUp } from "lucide-react";
import {
  studentStatTheme,
  type StudentStatTone,
} from "@/lib/studentMetricVisuals";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtext?: string;
  trend?: string;
  href?: string;
  tone?: StudentStatTone;
  /** @deprecated use tone */
  iconClassName?: string;
}

export default function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  trend,
  href,
  tone = "indigo",
}: StatCardProps) {
  const theme = studentStatTheme(tone);

  const inner = (
    <div
      className={`group relative h-full overflow-hidden rounded-xl border px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 sm:px-5 sm:py-4 ${theme.shell} ${theme.shadow} ${theme.accent}`}
    >
      <div
        className={`pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${theme.wash}`}
        aria-hidden
      />
      <div className="relative flex items-start gap-3.5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 ${theme.icon} ${theme.iconHover}`}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={`text-xs font-semibold uppercase tracking-wide text-slate-500 transition-colors duration-200 ${theme.labelHover}`}
          >
            {label}
          </p>
          <p
            className={`mt-1 text-[1.75rem] font-bold leading-none tabular-nums tracking-tight ${theme.value}`}
          >
            {value}
          </p>
          {trend ? (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-emerald-600">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{trend}</span>
            </p>
          ) : null}
          {subtext ? (
            <p className="mt-1.5 text-xs font-medium text-slate-500">{subtext}</p>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 focus-visible:ring-offset-2"
      >
        {inner}
      </Link>
    );
  }
  return inner;
}
