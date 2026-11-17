import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PortalListEmptyProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  children?: ReactNode;
  iconWrapClassName?: string;
  iconClassName?: string;
}

export default function PortalListEmpty({
  icon: Icon,
  title,
  description,
  children,
  iconWrapClassName = "bg-slate-50",
  iconClassName = "text-slate-400",
}: PortalListEmptyProps) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm">
      <span
        className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${iconWrapClassName}`}
      >
        <Icon className={`h-6 w-6 ${iconClassName}`} aria-hidden />
      </span>
      <p className="mt-4 font-semibold text-slate-700">{title}</p>
      {description ? (
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>
      ) : null}
      {children ? <div className="mt-5">{children}</div> : null}
    </div>
  );
}
