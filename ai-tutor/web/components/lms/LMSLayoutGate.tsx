"use client";

/**
 * Switches between legacy AI sidebar and LMS portal layout (sidebar + shell bar).
 * Loads school branding when the portal layout is active.
 */

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import PortalSidebar from "./PortalSidebar";
import PortalShellBar from "./PortalShellBar";
import SchoolBrandingLoader from "./SchoolBrandingLoader";
import { useAuthStore } from "@/store/authStore";
import { isStudentPortalAiRoute } from "@/lib/studentNav";
import { isTeacherPortalAiRoute } from "@/lib/teacherNav";

const LMS_PREFIXES = ["/login", "/student", "/teacher", "/admin"];

export function isLmsRoute(path: string): boolean {
  return LMS_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function usePortalShell(): boolean {
  const pathname = usePathname();
  const { user, hydrated } = useAuthStore();

  if (!hydrated) return isLmsRoute(pathname);
  if (user?.role === "student") {
    return isLmsRoute(pathname) || isStudentPortalAiRoute(pathname);
  }
  if (user?.role === "teacher" || user?.role === "admin") {
    return isLmsRoute(pathname) || isTeacherPortalAiRoute(pathname);
  }
  return isLmsRoute(pathname);
}

/** Routes where the chat fills the full height — no inner scroll on the outer shell */
function useChatFullHeight(pathname: string): boolean {
  return (
    pathname === "/student/chat" ||
    pathname === "/teacher/chat" ||
    // Smart Solver uses its own internal scroll areas (chat + canvas).
    pathname === "/solver" ||
    pathname.startsWith("/solver/") ||
    pathname === "/"
  );
}

interface LMSLayoutGateProps {
  children: React.ReactNode;
  mainSidebar: React.ReactNode;
}

export default function LMSLayoutGate({
  children,
  mainSidebar,
}: LMSLayoutGateProps) {
  const pathname = usePathname();
  const usePortal = usePortalShell();
  const chatFull = useChatFullHeight(pathname);

  if (pathname === "/login") {
    return (
      <div className="min-h-screen bg-background text-foreground">{children}</div>
    );
  }

  if (usePortal) {
    return (
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <SchoolBrandingLoader />
        <PortalSidebar />
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <PortalShellBar />
          <main
            className={`min-h-0 flex-1 bg-background ${
              chatFull ? "overflow-hidden" : "overflow-y-auto"
            }`}
          >
            <div
              className={`portal-page-enter ${
                chatFull ? "h-full min-h-0" : "min-h-full"
              }`}
            >
              {children}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground transition-colors duration-200">
      {mainSidebar}
      <main
        className={`min-h-0 flex-1 bg-background ${
          chatFull ? "overflow-hidden" : "overflow-y-auto"
        }`}
      >
        <div className={chatFull ? "h-full min-h-0" : undefined}>{children}</div>
      </main>
    </div>
  );
}

/** Redirect logged-in students from legacy `/` to dashboard */
export function StudentRootRedirect() {
  const pathname = usePathname();
  const { user, hydrated } = useAuthStore();

  useEffect(() => {
    if (hydrated && user?.role === "student" && pathname === "/") {
      window.location.replace("/student/dashboard");
    }
  }, [hydrated, user, pathname]);

  return null;
}
