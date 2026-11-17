"use client";

/** Placeholder shell for admin sections not yet built (e.g. School Analytics). */

import Link from "next/link";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import { Construction } from "lucide-react";

interface AdminPlaceholderPageProps {
  title: string;
  description: string;
  /** Optional working page to link until this section is built */
  interimHref?: string;
  interimLabel?: string;
}

function AdminPlaceholderContent({
  title,
  description,
  interimHref,
  interimLabel,
}: AdminPlaceholderPageProps) {
  return (
    <div className="min-h-full bg-slate-50 px-6 py-8 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <Construction className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            {description}
          </p>
          <p className="mt-4 text-xs text-slate-400">
            Planned in Admin Phase B/C — see{" "}
            <code className="rounded bg-slate-100 px-1 py-0.5">
              docs/DEVELOPMENT_PLAN_INDEX.md
            </code>
          </p>
          {interimHref && interimLabel ? (
            <Link
              href={interimHref}
              className="mt-6 inline-flex text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              {interimLabel} →
            </Link>
          ) : (
            <Link
              href="/admin/dashboard"
              className="mt-6 inline-flex text-sm font-semibold text-indigo-600 hover:text-indigo-700"
            >
              Back to dashboard →
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminPlaceholderPage(props: AdminPlaceholderPageProps) {
  return (
    <ProtectedRoute roles={["admin"]}>
      <AdminPlaceholderContent {...props} />
    </ProtectedRoute>
  );
}
