"use client";

/** Dashboard welcome header — school name from portalStore with API fallbacks. */

import { usePortalStore } from "@/store/portalStore";
import { dashboardHeader } from "@/lib/portalDashboardUi";

type PortalDashboardWelcomeProps = {
  greetingName: string;
  subtitle?: string;
  extraLine?: string;
  schoolNameFallback?: string;
  academicYearFallback?: string;
  showAcademicYear?: boolean;
};

export default function PortalDashboardWelcome({
  greetingName,
  subtitle,
  extraLine,
  schoolNameFallback,
  academicYearFallback,
  showAcademicYear = true,
}: PortalDashboardWelcomeProps) {
  const branding = usePortalStore((s) => s.schoolBranding);
  const schoolName = branding?.school_name || schoolNameFallback;
  const academicYear = branding?.academic_year || academicYearFallback;

  return (
    <header className="mb-6">
      {schoolName ? (
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">
          {schoolName}
        </p>
      ) : null}
      <h1 className={`mt-1 ${dashboardHeader.title}`}>Good day, {greetingName}</h1>
      {subtitle ? <p className={`mt-1 ${dashboardHeader.subtitle}`}>{subtitle}</p> : null}
      {extraLine ? <p className="mt-0.5 text-sm text-slate-600">{extraLine}</p> : null}
      {showAcademicYear && academicYear && !extraLine?.includes(academicYear) ? (
        <p className="mt-0.5 text-sm text-slate-600">{academicYear}</p>
      ) : null}
    </header>
  );
}
