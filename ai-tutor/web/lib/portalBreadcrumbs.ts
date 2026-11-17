/**
 * Breadcrumbs and page titles for admin, teacher, and student portal shell bar.
 */

import {
  STUDENT_NAV_GROUPS,
  type StudentNavItem,
} from "@/lib/studentNav";
import {
  TEACHER_NAV_GROUPS,
  type TeacherNavItem,
} from "@/lib/teacherNav";
import { getAdminNavEntries } from "@/lib/adminNav";
import type { UserRole } from "@/types/lms";

export type PortalBreadcrumb = {
  label: string;
  /** Present only for safe, static parent routes (no workflow change). */
  href?: string;
};

type NavEntry = { href: string; label: string };

/** Builder sub-routes that belong to a hub page but are not nested in the URL. */
const TEACHER_BUILDER_ROUTES: Record<
  string,
  { parentHref: string; parentLabel: string; label: string }
> = {
  "/teacher/quiz-builder": {
    parentHref: "/teacher/quizzes",
    parentLabel: "Quizzes",
    label: "Quiz Builder",
  },
  "/teacher/paper-builder": {
    parentHref: "/teacher/papers",
    parentLabel: "Question Papers",
    label: "Paper Builder",
  },
};

function teacherBuilderRoute(pathname: string) {
  return TEACHER_BUILDER_ROUTES[pathname] ?? null;
}

/** Live assignment submissions — title is rendered in-page, not from the URL id. */
function isTeacherAssignmentDetail(pathname: string): boolean {
  return /^\/teacher\/assignments\/[^/]+$/.test(pathname);
}

/** Human-readable labels for nested portal paths (display only). */
const SEGMENT_LABELS: Record<string, string> = {
  admin: "Admin",
  "quiz-builder": "Quiz Builder",
  "paper-builder": "Paper Builder",
  assignments: "Quizzes",
  quizzes: "Quizzes",
  papers: "Question Papers",
  "exam-calendar": "Exam Calendar",
  analytics: "Analytics",
  reports: "Reports",
  review: "Evaluation",
  distributions: "Distribution",
  "exam-attempts": "Exam attempt",
  "practice-attempts": "Practice attempt",
  "written-submissions": "Written submission",
  grade: "Grading",
  attempt: "Attempt",
  exam: "Exam",
  practice: "Practice",
  submit: "Submit",
  result: "Result",
  materials: "Materials",
  planner: "Planner",
  calendar: "Calendar",
  notes: "Notes",
  chat: "AI Chat",
  classes: "Classes",
  teachers: "Teachers",
  students: "Students",
  users: "All Users",
  settings: "School Settings",
  co_writer: "Co-Writer",
};

function collectNavEntries(role: UserRole | undefined): NavEntry[] {
  if (role === "admin") {
    return getAdminNavEntries();
  }
  if (role === "teacher") {
    const items: NavEntry[] = [];
    for (const group of TEACHER_NAV_GROUPS) {
      for (const item of group.items as TeacherNavItem[]) {
        items.push({ href: item.href, label: item.label });
      }
    }
    return items;
  }
  const items: NavEntry[] = [];
  for (const group of STUDENT_NAV_GROUPS) {
    for (const item of group.items as StudentNavItem[]) {
      items.push({ href: item.href, label: item.label });
    }
  }
  return items;
}

function longestNavMatch(pathname: string, entries: NavEntry[]): NavEntry | null {
  let best: NavEntry | null = null;
  for (const entry of entries) {
    const exact = pathname === entry.href;
    const nested = pathname.startsWith(`${entry.href}/`);
    if (!exact && !nested) continue;
    if (!best || entry.href.length > best.href.length) {
      best = entry;
    }
  }
  return best;
}

function tailLabel(pathname: string, navHref: string): string | null {
  if (pathname === navHref) return null;
  const suffix = pathname.slice(navHref.length).replace(/^\//, "");
  if (!suffix) return null;
  const segments = suffix.split("/").filter(Boolean);
  const staticParts = segments.filter(
    (s) => !s.startsWith("[") && SEGMENT_LABELS[s],
  );
  if (staticParts.length > 0) {
    const key = staticParts[staticParts.length - 1];
    return SEGMENT_LABELS[key] ?? null;
  }
  const lastNamed = segments.find((s) => SEGMENT_LABELS[s]);
  if (lastNamed) return SEGMENT_LABELS[lastNamed];
  return "Details";
}

function crumbsFromPathSegments(pathname: string): PortalBreadcrumb[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [];
  const last = parts[parts.length - 1];
  const label =
    SEGMENT_LABELS[last] ??
    last
      .replace(/-/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  return [{ label }];
}

/** Student list pages that render their own title row (back arrow + h1). */
const STUDENT_IN_PAGE_TITLE_PATHS = new Set<string>();

function usesInPageTitle(pathname: string, role: UserRole | undefined): boolean {
  return role === "student" && STUDENT_IN_PAGE_TITLE_PATHS.has(pathname);
}

function roleDashboardHref(role: UserRole | undefined): string | null {
  if (role === "admin") return "/admin/dashboard";
  if (role === "teacher") return "/teacher/dashboard";
  if (role === "student") return "/student/dashboard";
  return null;
}

/** Back target for shell bar arrow (parent section or dashboard home). */
export function getPortalShellBackHref(
  pathname: string,
  role: UserRole | undefined,
): string | null {
  if (!pathname || pathname === "/login") return null;

  const dashboardHref = roleDashboardHref(role);

  if (role === "admin") {
    if (pathname === "/admin/dashboard") return null;
  } else if (role === "teacher") {
    if (pathname === "/teacher/dashboard") return null;
  } else if (role === "student") {
    if (pathname === "/student/dashboard") return null;
    if (usesInPageTitle(pathname, role)) return null;
  } else {
    return null;
  }

  if (role === "teacher") {
    const builder = teacherBuilderRoute(pathname);
    if (builder) {
      return builder.parentHref;
    }

    if (isTeacherAssignmentDetail(pathname)) {
      return "/teacher/quizzes?tab=live";
    }
  }

  const match = longestNavMatch(pathname, collectNavEntries(role));
  if (
    match &&
    pathname !== match.href &&
    pathname.startsWith(`${match.href}/`)
  ) {
    return match.href;
  }

  return dashboardHref;
}

/** Current top-level nav page title (e.g. Dashboard on /teacher/dashboard). */
export function getPortalPageTitle(
  pathname: string,
  role: UserRole | undefined,
): string | null {
  if (!pathname || pathname === "/login") return null;
  if (usesInPageTitle(pathname, role)) {
    return null;
  }
  const match = longestNavMatch(pathname, collectNavEntries(role));
  if (match && pathname === match.href) return match.label;
  return null;
}

/**
 * Breadcrumbs for portal shell (read-only orientation).
 * Hidden on top-level nav pages to avoid duplicating page titles.
 */
export function getPortalBreadcrumbs(
  pathname: string,
  role: UserRole | undefined,
): PortalBreadcrumb[] {
  if (!pathname || pathname === "/login") return [];

  if (role === "teacher" && isTeacherAssignmentDetail(pathname)) {
    return [
      { label: "Quizzes", href: "/teacher/quizzes?tab=live" },
      { label: "Quiz Submissions" },
    ];
  }

  if (role === "teacher") {
    const builder = teacherBuilderRoute(pathname);
    if (builder) {
      return [
        { label: builder.parentLabel, href: builder.parentHref },
        { label: builder.label },
      ];
    }
  }

  const entries = collectNavEntries(role);
  const match = longestNavMatch(pathname, entries);

  if (match && pathname === match.href) {
    return [];
  }

  if (match) {
    const tail = tailLabel(pathname, match.href);
    const crumbs: PortalBreadcrumb[] = [
      { label: match.label, href: match.href },
    ];
    if (tail) crumbs.push({ label: tail });
    return crumbs;
  }

  const fallback = crumbsFromPathSegments(pathname);
  if (fallback.length === 1 && fallback[0].label) {
    return fallback;
  }
  return fallback;
}
