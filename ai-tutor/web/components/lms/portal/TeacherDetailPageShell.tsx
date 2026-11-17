import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { portalDetail } from "@/lib/portalDetailUi";

interface TeacherDetailPageShellProps {
  backHref: string;
  backLabel: string;
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export default function TeacherDetailPageShell({
  backHref,
  backLabel,
  title,
  subtitle,
  badge,
  actions,
  children,
}: TeacherDetailPageShellProps) {
  return (
    <div className={portalDetail.page}>
      <div className={portalDetail.inner}>
        <Link href={backHref} className={portalDetail.backLink}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>

        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className={portalDetail.title}>{title}</h1>
              {badge}
            </div>
            {subtitle ? <div className={portalDetail.meta}>{subtitle}</div> : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-col items-end gap-1">{actions}</div>
          ) : null}
        </header>

        {children}
      </div>
    </div>
  );
}
