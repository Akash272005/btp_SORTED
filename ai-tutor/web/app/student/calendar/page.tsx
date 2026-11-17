"use client";

import ProtectedRoute from "@/components/lms/ProtectedRoute";
import PortalPageShell, {
  PortalPageLink,
} from "@/components/lms/PortalPageShell";

export default function StudentCalendarPage() {
  return (
    <ProtectedRoute roles={["student"]}>
      <PortalPageShell
        title="Exam Calendar"
        description={
          <>
            Upcoming exams and assignment deadlines will show here. For work due
            soon, check your{" "}
            <PortalPageLink href="/student/dashboard">dashboard</PortalPageLink>
            .
          </>
        }
        action={{ href: "/student/dashboard", label: "Back to dashboard" }}
      />
    </ProtectedRoute>
  );
}
