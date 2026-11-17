import Link from "next/link";
import type { ReactNode } from "react";
import {
  dashboardSection,
  type DashboardSectionVariant,
} from "@/lib/portalDashboardUi";

interface DashboardSectionProps {
  title: string;
  description?: string;
  action?: { href: string; label: string };
  variant?: DashboardSectionVariant;
  children: ReactNode;
  className?: string;
}

function accentClass(variant: DashboardSectionVariant): string {
  return dashboardSection.accent[variant] ?? dashboardSection.accent.default;
}

export default function DashboardSection({
  title,
  description,
  action,
  variant = "default",
  children,
  className = "",
}: DashboardSectionProps) {
  const heading = (
    <div className={dashboardSection.heading}>
      <div className="min-w-0">
        <h2 className={dashboardSection.title}>
          <span className={dashboardSection.titleRow}>
            <span
              className={`${dashboardSection.accentDot} ${accentClass(variant)}`}
              aria-hidden
            />
            {title}
          </span>
        </h2>
        {description ? (
          <p className={dashboardSection.description}>{description}</p>
        ) : null}
      </div>
      {action ? (
        <Link href={action.href} className={dashboardSection.action}>
          {action.label}
        </Link>
      ) : null}
    </div>
  );

  const panelClass = dashboardSection.panel[variant];

  return (
    <section className={`${dashboardSection.root} ${className}`.trim()}>
      {variant === "default" ? (
        <>
          {heading}
          {children}
        </>
      ) : (
        <div className={panelClass}>
          {heading}
          {children}
        </div>
      )}
    </section>
  );
}
