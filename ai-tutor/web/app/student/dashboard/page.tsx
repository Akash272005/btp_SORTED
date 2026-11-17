"use client";

/** Student dashboard — uses PortalDashboardWelcome for dynamic school name in header. */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Target,
  ClipboardList,
  FileText,
  Award,
  Zap,
  Flame,
  MessageCircle,
} from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import PortalDashboardWelcome from "@/components/lms/PortalDashboardWelcome";
import StatCard from "@/components/lms/StatCard";
import StudentPaperCard from "@/components/lms/student/StudentPaperCard";
import TopicHeatmap from "@/components/lms/TopicHeatmap";
import SubjectProficiencyBars from "@/components/lms/SubjectProficiencyBars";
import { DashboardSkeleton } from "@/components/lms/Skeleton";
import DashboardSection from "@/components/lms/DashboardSection";
import PortalDashboardError from "@/components/lms/PortalDashboardError";
import StudentTodayFocusCard from "@/components/lms/student/StudentTodayFocusCard";
import StudentUpcomingExams from "@/components/lms/student/StudentUpcomingExams";
import StudentAssignmentsPanel from "@/components/lms/student/StudentAssignmentsPanel";
import TeacherDashboardToolbar from "@/components/lms/portal/TeacherDashboardToolbar";
import { DASHBOARD_REFRESH_EVENT } from "@/lib/studentQuizSession";
import {
  dashboardHeader,
  dashboardPage,
  dashboardToolbar,
} from "@/lib/portalDashboardUi";
import { fetchStudentDashboard, type StudentPaperItem } from "@/services/lmsApi";
import { usePortalStore } from "@/store/portalStore";
import type { StudentDashboard } from "@/types/lms";

export default function StudentDashboardPage() {
  const [data, setData] = useState<StudentDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const setNavBadges = usePortalStore((s) => s.setNavBadges);

  const load = () => {
    fetchStudentDashboard()
      .then((dash) => {
        setData(dash);
        if (dash.nav_badges) setNavBadges(dash.nav_badges);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Load failed"));
  };

  useEffect(() => {
    load();
    const onRefresh = () => load();
    window.addEventListener(DASHBOARD_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(DASHBOARD_REFRESH_EVENT, onRefresh);
  }, []);

  return (
    <ProtectedRoute roles={["student"]}>
      {!data && !error ? (
        <DashboardSkeleton />
      ) : error ? (
        <PortalDashboardError message={error} />
      ) : data ? (
        <StudentDashboardView data={data} />
      ) : null}
    </ProtectedRoute>
  );
}

function StudentDashboardView({ data }: { data: StudentDashboard }) {
  return (
    <div className={dashboardPage.wrap}>
      <div className={`${dashboardPage.inner} pb-0`}>
        <PortalDashboardWelcome
          greetingName={data.greeting_name}
          subtitle={data.date_label}
          extraLine={data.class_label}
        />
      </div>
      <TeacherDashboardToolbar>
        <div className={`${dashboardHeader.pill} gap-1.5`}>
          <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden />
          {data.streak_days}-day streak
        </div>
        <div className={dashboardToolbar.actions}>
          <Link href="/student/chat" className={dashboardHeader.primaryBtn}>
            <MessageCircle className="h-4 w-4" aria-hidden />
            Ask AI Tutor
          </Link>
          <Link href="/student/quizzes" className={dashboardToolbar.ghostBtn}>
            My Quizzes
          </Link>
          <Link href="/student/papers" className={dashboardToolbar.ghostBtn}>
            Question Papers
          </Link>
        </div>
      </TeacherDashboardToolbar>

      <div className={`${dashboardPage.inner} ${dashboardPage.studentInner}`}>
        <DashboardSection variant="attention" title="Today's focus">
          <StudentTodayFocusCard
            examMessage={data.exam_message}
            aiInsight={data.ai_insight}
          />
        </DashboardSection>

        <StudentUpcomingExams />

        <DashboardSection variant="glance" title="At a glance">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard
              icon={Target}
              label="Overall Accuracy"
              value={`${data.overall_accuracy}%`}
              trend={
                data.accuracy_delta === 0
                  ? "No change from last week"
                  : `${data.accuracy_delta > 0 ? "↑" : "↓"} ${Math.abs(data.accuracy_delta)}% from last week`
              }
              href="/student/analytics"
              tone="emerald"
            />
            <StatCard
              icon={ClipboardList}
              label="Quizzes Pending"
              value={data.quizzes_pending}
              subtext={
                data.quizzes_pending === 0
                  ? "All assigned quizzes submitted"
                  : data.quizzes_due_tomorrow
                    ? `${data.quizzes_due_tomorrow} due tomorrow`
                    : "Not submitted yet"
              }
              href="/student/quizzes"
              tone="amber"
            />
            <StatCard
              icon={FileText}
              label="Papers Pending"
              value={data.papers_pending}
              subtext={
                data.papers_pending === 0
                  ? "All question papers submitted"
                  : data.papers_due_tomorrow
                    ? `${data.papers_due_tomorrow} due tomorrow`
                    : "Not submitted yet"
              }
              href="/student/papers"
              tone="rose"
            />
            <StatCard
              icon={Award}
              label="Topics Mastered"
              value={data.topics_mastered}
              subtext={`of ${data.topics_total} total`}
              href="/student/analytics"
              tone="violet"
            />
            <StatCard
              icon={Zap}
              label="XP This Week"
              value={data.xp_this_week}
              subtext={data.xp_rank_label}
              tone="indigo"
            />
          </div>
        </DashboardSection>

        {(data.papers_pending > 0 || data.recent_papers.length > 0) && (
          <DashboardSection
            variant="attention"
            title="Question papers"
            action={{ href: "/student/papers", label: "View all →" }}
          >
            <div className="space-y-3">
              {data.recent_papers.length > 0 ? (
                data.recent_papers.map((paper) => (
                  <StudentPaperCard
                    key={paper.distribution_id}
                    paper={paper as StudentPaperItem}
                    embedded
                  />
                ))
              ) : (
                <p className="text-sm text-slate-600">
                  {data.papers_pending} paper
                  {data.papers_pending === 1 ? "" : "s"} pending — open Question
                  Papers to continue.
                </p>
              )}
            </div>
          </DashboardSection>
        )}

        <DashboardSection variant="insights" title="Your progress">
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <StudentAssignmentsPanel assignments={data.assignments} embedded />
            </div>
            <div className="space-y-4 lg:col-span-2">
              <TopicHeatmap cells={data.topic_heatmap} embedded />
              <SubjectProficiencyBars
                subjects={data.subject_proficiency}
                embedded
              />
            </div>
          </div>
        </DashboardSection>
      </div>
    </div>
  );
}
