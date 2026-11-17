import { Skeleton } from "@/components/lms/Skeleton";
import { portalList } from "@/lib/portalListUi";

export default function StudentQuizPageLoading({
  label = "Loading quizzes",
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
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-28 max-w-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className={portalList.listPanel}>
        <ul className="divide-y divide-slate-100">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:gap-6">
                <div className="flex min-w-0 flex-1 gap-4">
                  <Skeleton className="h-11 w-11 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-48 max-w-full" />
                    <Skeleton className="h-3 w-36 max-w-full" />
                  </div>
                </div>
                <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
