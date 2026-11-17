"use client";

/** Teacher dashboard — class selector scoped to admin-assigned mappings; school welcome header. */

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Edit3, FileText, MessageCircle, Plus, Radio } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import PortalDashboardWelcome from "@/components/lms/PortalDashboardWelcome";
import DashboardSection from "@/components/lms/DashboardSection";
import PortalDashboardError from "@/components/lms/PortalDashboardError";
import { TeacherDashboardSkeleton } from "@/components/lms/Skeleton";
import ClassHeatmap from "@/components/lms/teacher/ClassHeatmap";
import WeakStudentsPanel from "@/components/lms/teacher/WeakStudentsPanel";
import TeacherDashboardActionCard from "@/components/lms/teacher/TeacherDashboardActionCard";
import TeacherMetricCard from "@/components/lms/teacher/TeacherMetricCard";
import TeacherUpcomingExams from "@/components/lms/teacher/TeacherUpcomingExams";
import TeacherDashboardToolbar from "@/components/lms/portal/TeacherDashboardToolbar";
import { TEACHER_PORTAL_REFRESH_EVENT } from "@/lib/teacherPortalRefresh";
import {
  dashboardHeader,
  dashboardPage,
  dashboardToolbar,
} from "@/lib/portalDashboardUi";
import { fetchTeacherDashboard } from "@/services/lmsApi";
import { usePortalStore } from "@/store/portalStore";
import { useTeacherClassStore } from "@/store/teacherClassStore";
import type { TeacherDashboard } from "@/types/teacher";

export default function TeacherDashboardPage() {
  const [data, setData] = useState<TeacherDashboard | null>(null);
  const classId = useTeacherClassStore((s) => s.classId);
  const setClassId = useTeacherClassStore((s) => s.setClassId);
  const [error, setError] = useState<string | null>(null);
  const setNavBadges = usePortalStore((s) => s.setNavBadges);

  useEffect(() => {
    if (!data?.classes?.length) return;
    const valid = data.classes.map((c) => c.id);
    if (!classId || !valid.includes(classId)) {
      setClassId(data.class_id);
    }
  }, [data, classId, setClassId]);

  useEffect(() => {
    const load = () => {
      fetchTeacherDashboard(classId)
        .then((d) => {
          const dash = d as TeacherDashboard;
          setData(dash);
          if (dash.nav_badges) setNavBadges(dash.nav_badges);
        })
        .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
    };
    load();
    const onRefresh = () => load();
    window.addEventListener(TEACHER_PORTAL_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(TEACHER_PORTAL_REFRESH_EVENT, onRefresh);
  }, [classId, setNavBadges]);

  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      {!data && !error ? (
        <TeacherDashboardSkeleton />
      ) : error ? (
        <PortalDashboardError message={error} />
      ) : data ? (
        <div className={dashboardPage.wrap}>
          <div className={`${dashboardPage.inner} pb-0`}>
            <PortalDashboardWelcome
              greetingName={data.greeting_name}
              subtitle={data.date_label}
              extraLine={data.header_subtitle}
            />
          </div>
          <TeacherDashboardToolbar>
            <select
              value={classId || data.class_id}
              onChange={(e) => setClassId(e.target.value)}
              className={`${dashboardHeader.select} min-w-[10rem]`}
              aria-label="Select class"
            >
              {data.classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <div className={dashboardToolbar.actions}>
              <Link href="/teacher/chat" className={dashboardToolbar.ghostBtn}>
                <MessageCircle className="h-4 w-4" aria-hidden />
                Ask AI Tutor
              </Link>
              <div className={dashboardToolbar.primaryGroup}>
                <Link href="/teacher/quiz-builder" className={dashboardHeader.primaryBtn}>
                  <Plus className="h-4 w-4" aria-hidden />
                  New Quiz
                </Link>
                <Link href="/teacher/paper-builder" className={dashboardHeader.accentBtn}>
                  <FileText className="h-4 w-4" aria-hidden />
                  New Paper
                </Link>
              </div>
              <Link
                href="/teacher/quizzes?tab=live"
                className={dashboardToolbar.ghostBtn}
              >
                Submissions
              </Link>
              <Link href="/teacher/review" className={dashboardToolbar.ghostBtn}>
                <Bell className="h-4 w-4" aria-hidden />
                Alerts
              </Link>
            </div>
          </TeacherDashboardToolbar>

          <div className={`${dashboardPage.inner} ${dashboardPage.teacherInner}`}>
            <DashboardSection variant="glance" title="At a glance">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {data.metrics.map((m) => (
                  <TeacherMetricCard key={m.label} metric={m} />
                ))}
              </div>
            </DashboardSection>

            <DashboardSection variant="attention" title="Needs attention">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <TeacherDashboardActionCard
                  href="/co_writer"
                  icon={Edit3}
                  tone="indigo"
                  title="Prepare class notes"
                  description="Ground lesson plans and briefings in NCERT with AI Co-Writer"
                  ctaLabel="Open Co-Writer"
                />
                <TeacherDashboardActionCard
                  href="/teacher/papers?tab=grade"
                  icon={FileText}
                  tone="amber"
                  title="Papers to grade"
                  muted={data.papers_pending_review === 0}
                  description={
                    data.papers_pending_review === 0
                      ? "No exam or written submissions awaiting your review"
                      : `${data.papers_pending_review} submission${data.papers_pending_review === 1 ? "" : "s"} awaiting your review`
                  }
                  ctaLabel="Open papers to grade"
                />
                <TeacherDashboardActionCard
                  href="/teacher/papers?tab=live"
                  icon={Radio}
                  tone="indigo"
                  title="Live in class"
                  muted={data.papers_distributed_count === 0}
                  description={
                    data.papers_distributed_count === 0
                      ? "No papers sent to this class yet"
                      : `${data.papers_distributed_count} active distribution${data.papers_distributed_count === 1 ? "" : "s"} for ${data.class_name}`
                  }
                  ctaLabel="View tracking & progress"
                />
              </div>
            </DashboardSection>

            <TeacherUpcomingExams classId={classId || data.class_id} />

            <DashboardSection variant="insights" title="Class insights">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <ClassHeatmap
                    embedded
                    topics={data.heatmap_topics}
                    students={data.heatmap_students}
                  />
                </div>
                <div>
                  <WeakStudentsPanel embedded students={data.weak_students} />
                </div>
              </div>
            </DashboardSection>
          </div>
        </div>
      ) : null}
    </ProtectedRoute>
  );
}
