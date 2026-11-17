"use client";

import { useParams } from "next/navigation";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import QuizAttemptWorkspace from "@/components/lms/student/QuizAttemptWorkspace";

/** Route shell — attempt logic lives in QuizAttemptWorkspace. */
export default function QuizAttemptPage() {
  const params = useParams();
  const assignmentId = String(params.assignmentId ?? "");

  return (
    <ProtectedRoute roles={["student"]}>
      <QuizAttemptWorkspace assignmentId={assignmentId} />
    </ProtectedRoute>
  );
}
