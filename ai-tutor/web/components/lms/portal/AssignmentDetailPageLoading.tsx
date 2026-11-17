import { Skeleton } from "@/components/lms/Skeleton";
import { portalList } from "@/lib/portalListUi";

export default function AssignmentDetailPageLoading({
  label = "Loading submissions",
}: {
  label?: string;
}) {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={label}>
      <p className="sr-only">{label}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-slate-200/90 bg-white px-4 py-3.5 sm:px-5"
          >
            <div className="flex items-center gap-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-10" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <Skeleton className="h-16 w-full rounded-xl" />
      <div className={portalList.listPanel}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="border-b border-slate-50 px-4 py-4 last:border-0 sm:px-5"
          >
            <div className="flex items-center gap-4">
              <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40 max-w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="h-7 w-20 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
