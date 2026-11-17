import Link from "next/link";
import { ClipboardList } from "lucide-react";
import AssignmentCard from "@/components/lms/AssignmentCard";
import type { AssignmentItem } from "@/types/lms";

export default function StudentAssignmentsPanel({
  assignments,
  embedded = false,
}: {
  assignments: AssignmentItem[];
  embedded?: boolean;
}) {
  const shell = embedded
    ? "overflow-hidden rounded-xl border border-slate-200/60 bg-slate-50/50"
    : "overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm";

  return (
    <div className={shell}>
      <div
        className={`flex items-center justify-between border-b border-slate-100 px-5 py-3.5 ${embedded ? "bg-white/80" : ""}`}
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ClipboardList className="h-4 w-4 text-indigo-600" aria-hidden />
          Assigned to me
        </h2>
        <Link
          href="/student/quizzes"
          className="text-xs font-medium text-indigo-600 hover:text-indigo-700"
        >
          View all →
        </Link>
      </div>
      <div>
        {assignments.map((a) => (
          <AssignmentCard key={a.id} assignment={a} compact />
        ))}
      </div>
    </div>
  );
}
