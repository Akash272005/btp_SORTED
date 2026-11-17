import type { UserRole } from "@/types/lms";

/** Portal-scoped AI Chat route — keeps LMS sidebar for students and teachers. */
export function getPortalChatHref(role: UserRole | undefined): string {
  if (role === "teacher" || role === "admin") return "/teacher/chat";
  if (role === "student") return "/student/chat";
  return "/";
}
