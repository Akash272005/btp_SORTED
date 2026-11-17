"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/store/authStore";

const HomePageClient = dynamic(() => import("@/components/home/HomePageClient"), {
  loading: () => <HomeRouteLoading />,
});

function HomeRouteLoading() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center">
      <Loader2
        className="h-8 w-8 animate-spin text-indigo-500"
        aria-label="Loading"
      />
    </div>
  );
}

/**
 * Lightweight `/` entry: students redirect to dashboard without compiling the
 * heavy chat home (mermaid, katex, markdown, etc.).
 */
export default function Page() {
  const router = useRouter();
  const { user, hydrated } = useAuthStore();

  useEffect(() => {
    if (!hydrated) return;
    if (user?.role === "student") {
      router.replace("/student/dashboard");
    }
  }, [hydrated, user, router]);

  if (!hydrated) return <HomeRouteLoading />;
  if (user?.role === "student") return <HomeRouteLoading />;
  return <HomePageClient />;
}
