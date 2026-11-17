import type { ReactNode } from "react";
import TeacherDashboardToolbar from "@/components/lms/portal/TeacherDashboardToolbar";
import {
  dashboardPage,
  dashboardToolbar,
} from "@/lib/portalDashboardUi";

interface TeacherPortalListLayoutProps {
  /** Filters / search merged into the toolbar strip (left). */
  toolbarStart?: ReactNode;
  /** Right side actions (primary CTA, ghost links). */
  toolbarEnd?: ReactNode;
  children: ReactNode;
}

/** List pages: shell title + dashboard-style toolbar strip + scrollable content. */
export default function TeacherPortalListLayout({
  toolbarStart,
  toolbarEnd,
  children,
}: TeacherPortalListLayoutProps) {
  const showToolbar = toolbarStart || toolbarEnd;

  return (
    <div className={dashboardPage.wrap}>
      {showToolbar ? (
        <TeacherDashboardToolbar>
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
        </TeacherDashboardToolbar>
      ) : null}

      <div className={`${dashboardPage.inner} ${dashboardPage.teacherInner}`}>
        {children}
      </div>
    </div>
  );
}
