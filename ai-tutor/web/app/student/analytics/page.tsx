"use client";

import ProtectedRoute from "@/components/lms/ProtectedRoute";
import StudentListPageShell from "@/components/lms/student/StudentListPageShell";
import StudentPortalListLayout from "@/components/lms/student/StudentPortalListLayout";
import TopicHeatmap from "@/components/lms/TopicHeatmap";
import { useEffect, useState } from "react";
import { fetchStudentDashboard } from "@/services/lmsApi";

export default function StudentAnalyticsPage() {
  const [cells, setCells] = useState<
    { topic: string; subject: string; score: number; level: string }[]
  >([]);

  useEffect(() => {
    fetchStudentDashboard().then((d) => setCells(d.topic_heatmap));
  }, []);

  return (
    <ProtectedRoute roles={["student"]}>
      <StudentPortalListLayout>
        <StudentListPageShell title="My Analytics" titleInShell>
          <div className="overflow-hidden rounded-2xl border border-slate-100/80 bg-white p-5 shadow-sm">
            <TopicHeatmap cells={cells} />
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Tap any topic for more detail. Export and sharing options will appear
            here soon.
          </p>
        </StudentListPageShell>
      </StudentPortalListLayout>
    </ProtectedRoute>
  );
}
