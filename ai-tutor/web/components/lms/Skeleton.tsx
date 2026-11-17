export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`}
      aria-hidden
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm">
      <Skeleton className="mb-4 h-10 w-10 rounded-xl" />
      <Skeleton className="mb-2 h-3 w-28" />
      <Skeleton className="mb-2 h-8 w-16" />
      <Skeleton className="h-3 w-full max-w-[140px]" />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="min-h-full bg-[#F9FAFB]">
      <Skeleton className="h-[3.25rem] w-full rounded-none border-b border-slate-200/80" />
      <div className="mx-auto max-w-[1280px] space-y-10 px-6 py-7 lg:px-8 lg:py-8">
        <Skeleton className="h-36 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
        <Skeleton className="h-36 w-full rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-[420px] rounded-2xl lg:col-span-3" />
          <div className="space-y-4 lg:col-span-2">
            <Skeleton className="h-[200px] rounded-2xl" />
            <Skeleton className="h-[200px] rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeacherDashboardSkeleton() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-8 bg-[#F9FAFB] p-6 lg:p-8">
      <div className="flex flex-wrap justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-9 w-80 max-w-full" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-40 rounded-xl" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-36 rounded-2xl" />
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-[380px] rounded-2xl lg:col-span-2" />
        <Skeleton className="h-[380px] rounded-2xl" />
      </div>
    </div>
  );
}
