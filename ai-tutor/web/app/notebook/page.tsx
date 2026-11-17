"use client";

import { Suspense } from "react";
import NotebookTabs from "./components/NotebookTabs";

export default function NotebookPage() {
  return (
    <Suspense fallback={null}>
      <NotebookTabs />
    </Suspense>
  );
}
