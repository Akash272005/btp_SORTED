import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { portalDetail } from "@/lib/portalDetailUi";

interface PortalBuilderHeaderProps {
  backHref: string;
  backLabel: string;
  title?: string;
  subtitle?: ReactNode;
  secondaryLink?: { href: string; label: string };
  actions: ReactNode;
  steps?: { label: string; active?: boolean; done?: boolean }[];
  /** Arrow beside title (no “← Dashboard” row above). `none` = shell bar handles back navigation. */
  backPlacement?: "above" | "title" | "none";
  maxWidthClass?: string;
}

export default function PortalBuilderHeader({
  backHref,
  backLabel,
  title,
  subtitle,
  secondaryLink,
  actions,
  steps,
  backPlacement = "above",
  maxWidthClass = "max-w-[1280px]",
}: PortalBuilderHeaderProps) {
  const titleBackArrow =
    backPlacement === "title" ? (
      <Link
        href={backHref}
        className={portalDetail.titleBackBtn}
        aria-label={`Back to ${backLabel}`}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
      </Link>
    ) : null;

  return (
    <>
      {backPlacement === "above" ? (
        <Link href={backHref} className={portalDetail.backLink}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {backLabel}
        </Link>
      ) : null}

      {steps && steps.length > 0 ? (
        <nav
          aria-label="Builder steps"
          className="mb-5 flex flex-wrap items-center gap-2"
        >
          {steps.map((step, i) => (
            <span key={step.label} className="flex items-center gap-2">
              {i > 0 ? (
                <span className="h-px w-6 bg-slate-200" aria-hidden />
              ) : null}
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  step.active
                    ? "bg-indigo-600 text-white shadow-sm"
                    : step.done
                      ? "bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100"
                      : "bg-slate-100 text-slate-500"
                }`}
              >
                {step.label}
              </span>
            </span>
          ))}
        </nav>
      ) : null}

      {backPlacement === "title" || backPlacement === "none" ? (
        <header className="mb-6 space-y-4">
          {backPlacement === "title" && (titleBackArrow || title) ? (
            <div className="flex min-w-0 items-center gap-3">
              {titleBackArrow}
              {title ? (
                <h1 className={`${portalDetail.h1} min-w-0`}>{title}</h1>
              ) : null}
            </div>
          ) : null}
          {subtitle || secondaryLink ? (
            <div
              className={`${title ? portalDetail.titleSubtitleInset : ""} space-y-1`}
            >
              {subtitle ? <p className={portalDetail.meta}>{subtitle}</p> : null}
              {secondaryLink ? (
                <Link
                  href={secondaryLink.href}
                  className="inline-block text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  {secondaryLink.label}
                </Link>
              ) : null}
            </div>
          ) : null}
          <div
            className={`${title ? portalDetail.titleSubtitleInset : ""} flex max-w-full flex-wrap gap-2`}
          >
            {actions}
          </div>
        </header>
      ) : (
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className={portalDetail.h1}>{title}</h1>
            {subtitle ? <p className={portalDetail.meta}>{subtitle}</p> : null}
            {secondaryLink ? (
              <Link
                href={secondaryLink.href}
                className="mt-2 inline-block text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                {secondaryLink.label}
              </Link>
            ) : null}
          </div>
          <div className="flex max-w-full flex-wrap justify-end gap-2">{actions}</div>
        </header>
      )}
    </>
  );
}

export function portalBuilderPageWrap(maxWidthClass = "max-w-[1280px]") {
  return `min-h-full bg-[#F9FAFB] w-full ${maxWidthClass} px-6 py-6 lg:px-8 lg:py-8 mx-auto`;
}
