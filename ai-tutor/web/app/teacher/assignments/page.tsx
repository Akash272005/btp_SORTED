"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import PortalAssignmentPageLoading from "@/components/lms/portal/PortalAssignmentPageLoading";
import { dashboardPage } from "@/lib/portalDashboardUi";

function AssignmentsRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get("create") === "1" && params.get("quiz_id")) {
      params.set("tab", "ready");
      if (!params.has("ready")) params.set("ready", "not_assigned");
    } else if (!params.has("tab")) {
      params.set("tab", "live");
    }
    router.replace(`/teacher/quizzes?${params.toString()}`);
  }, [router, searchParams]);

  return null;
}

function TeacherAssignmentsRedirectPageContent() {
  return (
    <Suspense
      fallback={
        <div className={`${dashboardPage.wrap} p-8`}>
          <PortalAssignmentPageLoading label="Loading quizzes" />
        </div>
      }
    >
      <AssignmentsRedirect />
    </Suspense>
  );
}


export default function TeacherAssignmentsRedirectPage() {
  return (
    <Suspense fallback={null}>
      <TeacherAssignmentsRedirectPageContent />
    </Suspense>
  );
}
