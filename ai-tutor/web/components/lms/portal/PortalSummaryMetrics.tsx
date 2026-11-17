import { portalDetail } from "@/lib/portalDetailUi";

export default function PortalSummaryMetrics({
  items,
}: {
  items: { label: string; value: number | string }[];
}) {
  if (!items.length) return null;
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((c) => (
        <div key={c.label} className={portalDetail.metricCard}>
          <p className={portalDetail.metricValue}>{c.value}</p>
          <p className={portalDetail.metricLabel}>{c.label}</p>
        </div>
      ))}
    </div>
  );
}
