import type { UserRole } from "@/types/lms";

const COOKIE_NAME = "bixy-role";
const MAX_AGE_SEC = 60 * 60 * 24 * 30;

/** Client-only: mirror role so edge middleware can skip compiling heavy `/`. */
export function setRoleCookie(role: UserRole | null): void {
  if (typeof document === "undefined") return;
  if (!role) {
    document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
    return;
  }
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(role)}; path=/; max-age=${MAX_AGE_SEC}; SameSite=Lax`;
}
