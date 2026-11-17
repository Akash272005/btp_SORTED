import { Skeleton } from "@/components/lms/Skeleton";
import { portalList } from "@/lib/portalListUi";

export default function PortalListLoading({
  rows = 5,
  label = "Loading…",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={label}>
      <p className="sr-only">{label}</p>
      <ul className={portalList.list}>
        {Array.from({ length: rows }).map((_, i) => (
          <li
            key={i}
            className="rounded-xl border border-slate-100/80 bg-white p-4 shadow-sm"
          >
            <div className="flex gap-4">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-full max-w-sm" />
              </div>
              <Skeleton className="hidden h-9 w-24 shrink-0 rounded-lg sm:block" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
