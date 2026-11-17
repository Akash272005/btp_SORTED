import { dashboardSection } from "@/lib/portalDashboardUi";

type Accent = "indigo" | "slate" | "rose" | "amber" | "emerald";

const ACCENT: Record<Accent, string> = {
  indigo: dashboardSection.accent.glance,
  slate: dashboardSection.accent.insights,
  rose: "bg-rose-500",
  amber: dashboardSection.accent.attention,
  emerald: dashboardSection.accent.exams,
};

export default function PortalListSectionHeading({
  title,
  accent = "slate",
  className = "",
}: {
  title: string;
  accent?: Accent;
  className?: string;
}) {
  return (
    <div className={`${dashboardSection.heading} mb-3 ${className}`.trim()}>
      <h2 className={dashboardSection.title}>
        <span className={dashboardSection.titleRow}>
          <span
            className={`${dashboardSection.accentDot} ${ACCENT[accent]}`}
            aria-hidden
          />
          {title}
        </span>
      </h2>
    </div>
  );
}
