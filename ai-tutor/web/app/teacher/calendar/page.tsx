"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/lms/ProtectedRoute";

/** Legacy route — redirects to Exam Calendar builder. */
export default function TeacherCalendarRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/teacher/exam-calendar");
  }, [router]);
  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <div className="flex min-h-[200px] items-center justify-center text-slate-400">
        Opening Exam Calendar…
      </div>
    </ProtectedRoute>
  );
}
