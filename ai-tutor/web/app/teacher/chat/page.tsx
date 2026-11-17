"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";

const HomePageClient = dynamic(
  () => import("@/components/home/HomePageClient"),
  {
    loading: () => (
      <div className="flex h-full min-h-[40vh] items-center justify-center">
        <Loader2
          className="h-8 w-8 animate-spin text-indigo-500"
          aria-label="Loading"
        />
      </div>
    ),
  },
);

/** Teacher portal AI Chat — same NCERT journey + chat as students. */
export default function TeacherChatPage() {
  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <div className="flex h-full min-h-0 flex-col">
        <HomePageClient variant="student" />
      </div>
    </ProtectedRoute>
  );
}
