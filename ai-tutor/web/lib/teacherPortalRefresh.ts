/** Ask teacher dashboard / papers pages to refetch counts after grading, etc. */
export function notifyTeacherPortalRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("lms-teacher-portal-refresh"));
}

export const TEACHER_PORTAL_REFRESH_EVENT = "lms-teacher-portal-refresh";
