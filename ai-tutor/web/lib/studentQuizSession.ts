/**
 * Small helpers for the student quiz attempt UX (focus mode, dashboard refresh).
 */

/** Tell the layout to dim the sidebar while the student is taking a quiz. */
export function setQuizFocusMode(enabled: boolean): void {
  if (typeof document === "undefined") return;
  if (enabled) {
    document.documentElement.setAttribute("data-student-quiz-focus", "true");
  } else {
    document.documentElement.removeAttribute("data-student-quiz-focus");
  }
}

/** Ask dashboard / quiz list pages to refetch after submit. */
export function notifyDashboardRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("lms-student-dashboard-refresh"));
}

export const DASHBOARD_REFRESH_EVENT = "lms-student-dashboard-refresh";
