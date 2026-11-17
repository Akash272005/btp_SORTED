import type { ReactNode } from "react";
import {
  dashboardPage,
  dashboardToolbar,
} from "@/lib/portalDashboardUi";
import StudentDashboardToolbar from "@/components/lms/student/StudentDashboardToolbar";

interface StudentPortalListLayoutProps {
  toolbarStart?: ReactNode;
  toolbarEnd?: ReactNode;
  children: ReactNode;
}

export default function StudentPortalListLayout({
  toolbarStart,
  toolbarEnd,
  children,
}: StudentPortalListLayoutProps) {
  const showToolbar = toolbarStart || toolbarEnd;

  return (
    <div className={dashboardPage.wrap}>
      {showToolbar ? (
        <StudentDashboardToolbar>
          <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-3">
            {toolbarStart ? (
              <div className="flex min-w-0 flex-1 items-center">{toolbarStart}</div>
            ) : (
              <span className="min-w-0 flex-1" aria-hidden />
            )}
            {toolbarEnd ? (
              <div className={`${dashboardToolbar.actions} shrink-0`}>
                {toolbarEnd}
              </div>
            ) : null}
          </div>
        </StudentDashboardToolbar>
      ) : null}

      <div className={`${dashboardPage.inner} ${dashboardPage.studentInner}`}>
        {children}
      </div>
    </div>
  );
}
