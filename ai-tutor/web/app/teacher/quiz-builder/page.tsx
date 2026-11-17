"use client";

import { Suspense } from "react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import QuizBuilderWorkspace from "@/components/lms/teacher/QuizBuilderWorkspace";
import { dashboardPage } from "@/lib/portalDashboardUi";

function QuizBuilderContent() {
  return <QuizBuilderWorkspace />;
}

export default function QuizBuilderPage() {
  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <Suspense
        fallback={
          <div className={`${dashboardPage.wrap} p-8 text-slate-500`}>
            Loading Quiz Builder…
          </div>
        }
      >
        <QuizBuilderContent />
      </Suspense>
    </ProtectedRoute>
  );
}
