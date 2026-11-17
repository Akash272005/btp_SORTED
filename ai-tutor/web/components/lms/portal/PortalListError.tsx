import { AlertCircle } from "lucide-react";

export default function PortalListError({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
      <p className="flex items-start gap-2">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{message}</span>
      </p>
    </div>
  );
}
