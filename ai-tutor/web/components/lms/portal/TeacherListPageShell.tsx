import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { portalList } from "@/lib/portalListUi";

interface TeacherListPageShellProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  toolbar?: ReactNode;
  backHref?: string;
  backLabel?: string;
  /** Arrow beside title (no “← Dashboard” row above). */
  backPlacement?: "above" | "title";
  /** Title shown in fixed shell bar — hide duplicate h1/back on page. */
  titleInShell?: boolean;
  children: ReactNode;
}

export default function TeacherListPageShell({
  title,
  subtitle,
  action,
  toolbar,
  backHref = "/teacher/dashboard",
  backLabel = "Dashboard",
  backPlacement = "above",
  titleInShell = false,
  children,
}: TeacherListPageShellProps) {
  const titleBackArrow =
    !titleInShell && backPlacement === "title" ? (
      <Link
        href={backHref}
        className={portalList.titleBackBtn}
        aria-label={`Back to ${backLabel}`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </Link>
    ) : null;

  if (titleInShell) {
    return (
      <>
        {subtitle ? (
          <p className={`${portalList.subtitle} mb-6`}>{subtitle}</p>
        ) : null}

        {toolbar ? <div className="mb-6">{toolbar}</div> : null}

        {children}
      </>
    );
  }

  return (
    <>
      {backPlacement === "above" ? (
        <Link href={backHref} className={portalList.backLink}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>
      ) : null}

      {backPlacement === "title" ? (
        <header className="mb-6">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              {titleBackArrow}
              <h1 className={`${portalList.h1} min-w-0`}>{title}</h1>
            </div>
            {action ? (
              <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
            ) : null}
          </div>
          {subtitle ? (
            <div
              className={`${portalList.subtitle} ${portalList.titleSubtitleInset} mt-2`}
            >
              {subtitle}
            </div>
          ) : null}
        </header>
      ) : (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className={portalList.h1}>{title}</h1>
            {subtitle ? (
              <div className={`${portalList.subtitle} mt-1`}>{subtitle}</div>
            ) : null}
          </div>
          {action ? (
            <div className="flex shrink-0 flex-wrap gap-2">{action}</div>
          ) : null}
        </header>
      )}

      {toolbar ? (
        <div className={`${portalList.toolbarStack} mb-6`}>{toolbar}</div>
      ) : null}

      {children}
    </>
  );
}
