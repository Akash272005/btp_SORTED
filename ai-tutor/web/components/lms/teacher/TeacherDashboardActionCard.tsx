import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";

type ActionCardTone = "amber" | "indigo";

const TONE_STYLES: Record<
  ActionCardTone,
  { shell: string; icon: string; cta: string }
> = {
  amber: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-amber-500 bg-white hover:border-amber-200 hover:bg-amber-50/40",
    icon: "bg-amber-500 text-white shadow-sm",
    cta: "text-amber-700 group-hover:text-amber-800",
  },
  indigo: {
    shell:
      "border-slate-200/90 border-l-[3px] border-l-indigo-500 bg-white hover:border-indigo-200 hover:bg-indigo-50/40",
    icon: "bg-indigo-500 text-white shadow-sm",
    cta: "text-indigo-700 group-hover:text-indigo-800",
  },
};

const MUTED_SHELL =
  "border-slate-200/90 border-l-[3px] border-l-slate-200 bg-slate-50/80 opacity-90 hover:border-slate-300 hover:bg-slate-50";

export default function TeacherDashboardActionCard({
  href,
  icon: Icon,
  tone,
  title,
  description,
  ctaLabel,
  muted = false,
}: {
  href: string;
  icon: LucideIcon;
  tone: ActionCardTone;
  title: string;
  description: string;
  ctaLabel: string;
  muted?: boolean;
}) {
  const styles = TONE_STYLES[tone];

  return (
    <Link
      href={href}
      className={`group flex items-start gap-4 rounded-xl border p-4 shadow-sm transition-all duration-200 hover:-translate-y-px hover:shadow-md sm:p-5 ${
        muted ? MUTED_SHELL : styles.shell
      }`}
    >
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
          muted ? "bg-slate-400 text-white" : styles.icon
        }`}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">{description}</p>
        <p
          className={`mt-2.5 inline-flex items-center gap-1 text-sm font-semibold ${
            muted ? "text-slate-500" : styles.cta
          }`}
        >
          {ctaLabel}
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </p>
      </div>
    </Link>
  );
}
