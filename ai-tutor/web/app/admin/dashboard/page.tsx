"use client";

/**
 * Admin dashboard — school KPIs, class performance, at-risk list, activity feed.
 * Route: /admin/dashboard
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Plus, UserPlus } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import AdminListPagination from "@/components/lms/admin/AdminListPagination";
import PortalDashboardWelcome from "@/components/lms/PortalDashboardWelcome";
import PortalDashboardError from "@/components/lms/PortalDashboardError";
import { TeacherDashboardSkeleton } from "@/components/lms/Skeleton";
import TeacherMetricCard from "@/components/lms/teacher/TeacherMetricCard";
import { ADMIN_NAV_GROUPS } from "@/lib/adminNav";
import {
  dashboardHeader,
  dashboardPage,
} from "@/lib/portalDashboardUi";
import { fetchAdminDashboard, type AdminDashboard } from "@/services/lmsApi";
import { useClientPagination } from "@/hooks/useClientPagination";
import type { TeacherMetric } from "@/types/teacher";

const CLASS_PAGE_SIZE = 6;
const AT_RISK_PAGE_SIZE = 5;
const ACTIVITY_PAGE_SIZE = 5;

function studentsHref(params: { classId?: string; search?: string; studentId?: number }) {
  const q = new URLSearchParams();
  if (params.classId) q.set("class_id", params.classId);
  if (params.search) q.set("search", params.search);
  if (params.studentId != null) q.set("highlight", String(params.studentId));
  const qs = q.toString();
  return qs ? `/admin/students?${qs}` : "/admin/students";
}

const METRIC_LINKS: Record<string, string> = {
  Students: "/admin/students",
  Teachers: "/admin/teachers",
  Classes: "/admin/classes",
  "Avg Score": "/admin/students",
  "At-Risk Students": "#needs-attention",
  "Pending Reviews": "/admin/teachers",
};

function activityHref(kind: string | null | undefined): string {
  switch (kind) {
    case "student":
      return "/admin/students";
    case "assignment":
      return "/admin/classes";
    case "quiz":
      return "/admin/students";
    default:
      return "/admin/students";
  }
}

function formatActivityTime(iso: string): string {
  try {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    if (isToday) return `Today ${time}`;
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function toTeacherMetric(
  metric: AdminDashboard["metrics"][number],
): TeacherMetric {
  return {
    label: metric.label,
    value: metric.value,
    sublabel: metric.sublabel,
    trend: metric.trend ?? undefined,
    trend_type: metric.trend_type ?? undefined,
  };
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  const classPagination = useClientPagination(
    data?.class_performance ?? [],
    CLASS_PAGE_SIZE,
  );
  const atRiskPagination = useClientPagination(
    data?.at_risk_students ?? [],
    AT_RISK_PAGE_SIZE,
  );
  const activityPagination = useClientPagination(
    data?.recent_activity ?? [],
    ACTIVITY_PAGE_SIZE,
  );

  useEffect(() => {
    fetchAdminDashboard()
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load dashboard"),
      );
  }, []);

  const quickLinks = ADMIN_NAV_GROUPS.flatMap((g) => g.items).filter(
    (item) => item.href !== "/admin/dashboard",
  );

  return (
    <ProtectedRoute roles={["admin"]}>
      {!data && !error ? (
        <TeacherDashboardSkeleton />
      ) : error ? (
        <PortalDashboardError message={error} />
      ) : data ? (
        <div className={`${dashboardPage.wrap} ${dashboardPage.inner}`}>
          <PortalDashboardWelcome
            greetingName={data.greeting_name}
            subtitle={data.date_label}
            extraLine={`${data.header_subtitle} · ${data.academic_year}`}
            schoolNameFallback={data.school_name}
            academicYearFallback={data.academic_year}
            showAcademicYear={false}
          />
          <div className="mb-6 flex flex-wrap gap-2">
            <Link
              href="/admin/students?create=student"
              className={dashboardHeader.primaryBtn}
            >
              <UserPlus className="h-4 w-4" aria-hidden />
              Add student
            </Link>
            <Link
              href="/admin/classes?create=1"
              className={dashboardHeader.secondaryBtn}
            >
              <Plus className="h-4 w-4" aria-hidden />
              Add class
            </Link>
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.metrics.map((metric) => (
              <TeacherMetricCard
                key={metric.label}
                metric={toTeacherMetric(metric)}
                href={METRIC_LINKS[metric.label]}
              />
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <section className="lg:col-span-2 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Class performance
                </h2>
                <Link
                  href="/admin/classes"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  Manage classes →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-5 py-3">Class</th>
                      <th className="px-5 py-3">Students</th>
                      <th className="px-5 py-3">Avg score</th>
                      <th className="px-5 py-3">At-risk</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.class_performance.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-5 py-8 text-center text-slate-500"
                        >
                          No classes configured yet.
                        </td>
                      </tr>
                    ) : (
                      classPagination.slice.map((row) => {
                        const classStudentsHref = studentsHref({ classId: row.id });
                        return (
                          <tr
                            key={row.id}
                            role="link"
                            tabIndex={0}
                            onClick={() => router.push(classStudentsHref)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                router.push(classStudentsHref);
                              }
                            }}
                            className="cursor-pointer border-b border-slate-50 last:border-0 transition-colors hover:bg-indigo-50/40"
                          >
                            <td className="px-5 py-3 font-medium text-slate-900">
                              {row.name}
                            </td>
                            <td className="px-5 py-3 text-slate-600">
                              {row.student_count}
                            </td>
                            <td className="px-5 py-3 text-slate-600">
                              {row.avg_score != null ? `${row.avg_score}%` : "—"}
                            </td>
                            <td className="px-5 py-3">
                              {row.at_risk_count > 0 ? (
                                <Link
                                  href={classStudentsHref}
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-100"
                                >
                                  {row.at_risk_count}
                                </Link>
                              ) : (
                                <span className="text-slate-400">0</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <AdminListPagination
                page={classPagination.page}
                pageSize={CLASS_PAGE_SIZE}
                total={classPagination.total}
                onPageChange={classPagination.setPage}
              />
            </section>

            <section
              id="needs-attention"
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm scroll-mt-6"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h2 className="text-sm font-semibold text-slate-900">
                  Needs attention
                </h2>
                <Link
                  href="/admin/students"
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
                >
                  View all →
                </Link>
              </div>
              <ul className="divide-y divide-slate-50">
                {data.at_risk_students.length === 0 ? (
                  <li className="px-5 py-8 text-center text-sm text-slate-500">
                    No at-risk students detected.
                  </li>
                ) : (
                  atRiskPagination.slice.map((student) => (
                    <li key={student.student_id} className="px-5 py-3.5">
                      <Link
                        href={studentsHref({
                          classId: student.class_id ?? undefined,
                          search: student.full_name.split(" ")[0],
                          studentId: student.student_id,
                        })}
                        className="block rounded-lg transition-colors hover:bg-amber-50/60 -mx-2 px-2 py-1"
                      >
                        <p className="font-medium text-slate-900">
                          {student.full_name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {student.class_name ?? "—"} · avg {student.avg_score}%
                        </p>
                        <p className="mt-1 text-xs text-amber-700">
                          {student.subjects.join(", ")}
                        </p>
                      </Link>
                    </li>
                  ))
                )}
              </ul>
              <AdminListPagination
                page={atRiskPagination.page}
                pageSize={AT_RISK_PAGE_SIZE}
                total={atRiskPagination.total}
                onPageChange={atRiskPagination.setPage}
              />
            </section>
          </div>

          <section className="mt-6 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900">
                Recent activity
              </h2>
              <Link
                href="/admin/students"
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-700"
              >
                View all →
              </Link>
            </div>
            <ul className="divide-y divide-slate-50">
              {data.recent_activity.length === 0 ? (
                <li className="px-5 py-8 text-center text-sm text-slate-500">
                  No recent activity yet.
                </li>
              ) : (
                activityPagination.slice.map((item, i) => (
                  <li key={`${item.timestamp}-${i}`}>
                    <Link
                      href={activityHref(item.kind)}
                      className="flex gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-slate-50"
                    >
                      <span className="shrink-0 tabular-nums text-xs text-slate-400">
                        {formatActivityTime(item.timestamp)}
                      </span>
                      <span className="text-slate-700">{item.label}</span>
                    </Link>
                  </li>
                ))
              )}
            </ul>
            <AdminListPagination
              page={activityPagination.page}
              pageSize={ACTIVITY_PAGE_SIZE}
              total={activityPagination.total}
              onPageChange={activityPagination.setPage}
            />
          </section>

          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">
              Quick links
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quickLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm transition-shadow hover:shadow-md"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-slate-900">
                        {item.label}
                      </span>
                      {item.description ? (
                        <span className="block truncate text-xs text-slate-500">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-indigo-500" />
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}
    </ProtectedRoute>
  );
}
