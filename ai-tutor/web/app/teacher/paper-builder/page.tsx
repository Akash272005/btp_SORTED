"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import PaperBuilderWorkspace from "@/components/lms/teacher/PaperBuilderWorkspace";

function PaperBuilderContent() {
  const searchParams = useSearchParams();
  const paperId = searchParams.get("paper_id")?.trim() || "new";
  return <PaperBuilderWorkspace key={paperId} />;
}

function PaperBuilderPageContent() {
  return (
    <ProtectedRoute roles={["teacher", "admin"]}>
      <Suspense
        fallback={
          <div className="min-h-full bg-[#F9FAFB] p-8 text-slate-500">
            Loading Paper Builder...
          </div>
        }
      >
        <PaperBuilderContent />
      </Suspense>
    </ProtectedRoute>
  );
}


export default function PaperBuilderPage() {
  return (
    <Suspense fallback={null}>
      <PaperBuilderPageContent />
    </Suspense>
  );
}
