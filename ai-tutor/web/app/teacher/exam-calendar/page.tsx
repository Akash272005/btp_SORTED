"use client";

import { Suspense } from "react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import ExamCalendarBuilder from "@/components/lms/teacher/ExamCalendarBuilder";
import PortalAssignmentPageLoading from "@/components/lms/portal/PortalAssignmentPageLoading";
import { dashboardPage } from "@/lib/portalDashboardUi";

export default function TeacherExamCalendarPage() {
  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <Suspense
        fallback={
          <div className={`${dashboardPage.wrap} p-8`}>
            <PortalAssignmentPageLoading label="Loading exam calendar" />
          </div>
        }
      >
        <ExamCalendarBuilder />
      </Suspense>
    </ProtectedRoute>
  );
}
