import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { portalDetail } from "@/lib/portalDetailUi";

interface PortalGradeLayoutProps {
  backHref: string;
  backLabel?: string;
  loading: boolean;
  loadingLabel?: string;
  header?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}

export default function PortalGradeLayout({
  backHref,
  backLabel = "Back to distribution",
  loading,
  loadingLabel = "Loading…",
  header,
  children,
  footer,
}: PortalGradeLayoutProps) {
  return (
    <div className={portalDetail.page}>
      <div className={portalDetail.inner}>
        <Link href={backHref} className={portalDetail.backLink}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>

        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            {loadingLabel}
          </p>
        ) : null}

        {header}
        {children}
        {footer ? <div className="mt-6 flex flex-wrap gap-2">{footer}</div> : null}
      </div>
    </div>
  );
}

export function PortalGradeStudentHeader({
  studentName,
  distributionTitle,
  modeHint,
  scoreLine,
  statusLine,
}: {
  studentName: string;
  distributionTitle: string;
  modeHint: string;
  scoreLine: ReactNode;
  statusLine?: string;
}) {
  return (
    <header className={`mb-6 ${portalDetail.gradeHeader}`}>
      <h1 className={portalDetail.title}>{studentName}</h1>
      <p className={portalDetail.meta}>{distributionTitle}</p>
      <p className="mt-1 text-xs font-medium text-indigo-600">{modeHint}</p>
      <p className="mt-2 text-sm text-slate-700">{scoreLine}</p>
      {statusLine ? (
        <p className="mt-1 text-xs text-slate-500">Status: {statusLine}</p>
      ) : null}
    </header>
  );
}
