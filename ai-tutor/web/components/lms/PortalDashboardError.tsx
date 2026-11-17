import { AlertCircle } from "lucide-react";

export default function PortalDashboardError({ message }: { message: string }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-[#F9FAFB] px-6 py-12">
      <div className="max-w-md rounded-2xl border border-rose-100 bg-white p-8 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
          <AlertCircle className="h-6 w-6 text-rose-600" aria-hidden />
        </span>
        <h2 className="mt-4 text-base font-semibold text-slate-900">
          Couldn&apos;t load dashboard
        </h2>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
        <p className="mt-4 text-xs text-slate-400">
          Refresh the page or try again in a moment.
        </p>
      </div>
    </div>
  );
}
