"use client";

import Link from "next/link";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import TeacherListPageShell from "@/components/lms/portal/TeacherListPageShell";
import TeacherPortalListLayout from "@/components/lms/portal/TeacherPortalListLayout";
import { portalList } from "@/lib/portalListUi";

export default function TeacherReportsPage() {
  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <TeacherPortalListLayout>
        <TeacherListPageShell
          title="Student Reports"
          titleInShell
          subtitle="Per-student progress reports, weak-area summaries, and export tools for parents and admins."
        >
          <div
            className={`${portalList.listPanel} px-6 py-10 text-center text-sm text-slate-600`}
          >
            <p className="font-medium text-slate-700">Coming soon</p>
            <p className="mt-1 text-xs text-slate-500">
              This section is being set up. Check back shortly.
            </p>
          </div>

          <Link
            href="/teacher/dashboard"
            className="mt-6 inline-flex text-sm font-semibold text-indigo-600 hover:text-indigo-700"
          >
            Back to dashboard →
          </Link>
        </TeacherListPageShell>
      </TeacherPortalListLayout>
    </ProtectedRoute>
  );
}
