"use client";

import ProtectedRoute from "@/components/lms/ProtectedRoute";
import PortalPageShell from "@/components/lms/PortalPageShell";

export default function StudyPlannerPage() {
  return (
    <ProtectedRoute roles={["student"]}>
      <PortalPageShell
        title="Study Planner"
        description="Your personalized daily plan based on progress, upcoming exams, and topics to revise. Plans refresh weekly and can be shared with your teacher."
        action={{ href: "/student/dashboard", label: "Back to dashboard" }}
      />
    </ProtectedRoute>
  );
}
