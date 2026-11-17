"use client";

import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { dashboardSection, upcomingExamsUi } from "@/lib/portalDashboardUi";
import StudentNextExamCard from "@/components/lms/student/StudentNextExamCard";

export default function StudentUpcomingExams() {
  const panelClass = dashboardSection.panel.exams;

  return (
    <section className={dashboardSection.root}>
      <div className={panelClass}>
        <div className={dashboardSection.heading}>
          <div className="flex min-w-0 items-center gap-3">
            <span className={upcomingExamsUi.headerIcon}>
              <CalendarDays className="h-5 w-5" aria-hidden />
            </span>
            <h2 className={dashboardSection.title}>
              <span className={dashboardSection.titleRow}>
                <span
                  className={`${dashboardSection.accentDot} ${dashboardSection.accent.exams}`}
                  aria-hidden
                />
                Upcoming exams
              </span>
            </h2>
          </div>
          <Link href="/student/exam-calendar" className={dashboardSection.action}>
            View calendar →
          </Link>
        </div>
        <StudentNextExamCard embedded />
      </div>
    </section>
  );
}
