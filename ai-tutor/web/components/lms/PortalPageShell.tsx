import Link from "next/link";
import type { ReactNode } from "react";

type PortalVariant = "student" | "teacher";

interface PortalPageShellProps {
  variant?: PortalVariant;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  action?: { href: string; label: string };
}

const shellStyles: Record<
  PortalVariant,
  { wrap: string; title: string; desc: string; card: string; action: string }
> = {
  student: {
    wrap: "min-h-full bg-[#F9FAFB]",
    title: "text-slate-900",
    desc: "text-slate-500",
    card: "border-slate-100/80 bg-white text-slate-600",
    action:
      "text-indigo-600 hover:text-indigo-700",
  },
  teacher: {
    wrap: "min-h-full bg-[#F9FAFB]",
    title: "text-slate-900",
    desc: "text-slate-500",
    card: "border-slate-100/80 bg-white text-slate-600",
    action: "text-indigo-600 hover:text-indigo-700",
  },
};

export function PortalPageLink({
  href,
  children,
  variant = "student",
}: {
  href: string;
  children: ReactNode;
  variant?: PortalVariant;
}) {
  const linkClass =
    "font-medium text-indigo-600 hover:text-indigo-700 hover:underline";
  return (
    <Link href={href} className={linkClass}>
      {children}
    </Link>
  );
}

export default function PortalPageShell({
  variant = "student",
  title,
  description,
  children,
  action,
}: PortalPageShellProps) {
  const s = shellStyles[variant];
  const maxW = variant === "teacher" ? "max-w-[1280px]" : "max-w-[1200px]";

  return (
    <div className={s.wrap}>
      <div className={`mx-auto ${maxW} px-6 py-6 lg:px-8 lg:py-8`}>
        <header className="mb-6">
          <h1 className={`text-2xl font-bold tracking-tight ${s.title}`}>
            {title}
          </h1>
          {description ? (
            <p className={`mt-2 max-w-2xl text-sm leading-relaxed ${s.desc}`}>
              {description}
            </p>
          ) : null}
        </header>

        {children ? (
          children
        ) : (
          <div
            className={`rounded-2xl border px-6 py-10 text-center text-sm shadow-sm ${s.card}`}
          >
            <p className="font-medium">Coming soon</p>
            <p className="mt-1 text-xs opacity-80">
              This section is being set up. Check back shortly.
            </p>
          </div>
        )}

        {action ? (
          <Link
            href={action.href}
            className={`mt-6 inline-flex text-sm font-semibold ${s.action}`}
          >
            {action.label} →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
