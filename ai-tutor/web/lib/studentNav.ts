import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  MessageCircle,
  ClipboardList,
  FileText,
  BookOpen,
  History,
  Book,
  PenTool,
  Calculator,
  GraduationCap,
  Microscope,
  // Youtube,
  BarChart3,
  Calendar,
  Settings,
} from "lucide-react";

export type StudentNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: string;
  badgeColor?: "red" | "blue";
  colorClass?: string;
};

export type StudentNavGroup = {
  id: string;
  label: string;
  items: StudentNavItem[];
};

/** LMS + curriculum */
export const LEARN_GROUP: StudentNavGroup = {
  id: "learn",
  label: "Learn",
  items: [
    {
      href: "/student/dashboard",
      label: "Home",
      icon: LayoutDashboard,
    },
    {
      href: "/student/chat",
      label: "AI Chat",
      icon: MessageCircle,
      colorClass: "text-indigo-500",
    },
    {
      href: "/student/quizzes",
      label: "My Quizzes",
      icon: ClipboardList,
    },
    {
      href: "/student/papers",
      label: "Question Papers",
      icon: FileText,
      badgeKey: "papers",
      badgeColor: "red",
    },
    {
      href: "/knowledge",
      label: "Study Materials",
      icon: BookOpen,
      colorClass: "text-emerald-500",
    },
  ],
};

/** Former AI Tutor workspace */
export const WORKSPACE_GROUP: StudentNavGroup = {
  id: "workspace",
  label: "Workspace",
  items: [
    {
      href: "/history",
      label: "History",
      icon: History,
      colorClass: "text-orange-500",
    },
    {
      href: "/notebook",
      label: "Notebooks",
      icon: Book,
      colorClass: "text-pink-500",
    },
  ],
};

/** Former AI Tutor learn & research */
export const AI_TOOLS_GROUP: StudentNavGroup = {
  id: "ai-tools",
  label: "AI Tutor",
  items: [
    {
      href: "/question",
      label: "Question Generator",
      icon: PenTool,
      colorClass: "text-purple-500",
    },
    {
      href: "/solver",
      label: "Smart Solver",
      icon: Calculator,
      colorClass: "text-indigo-500",
    },
    {
      href: "/guide",
      label: "Guided Learning",
      icon: GraduationCap,
      colorClass: "text-yellow-500",
    },
    {
      href: "/research",
      label: "Deep Research",
      icon: Microscope,
      colorClass: "text-cyan-500",
    },
    // {
    //   href: "/video",
    //   label: "Video Learning",
    //   icon: Youtube,
    //   colorClass: "text-red-500",
    // },
  ],
};

export const PROGRESS_GROUP: StudentNavGroup = {
  id: "progress",
  label: "Progress",
  items: [
    {
      href: "/student/analytics",
      label: "My Analytics",
      icon: BarChart3,
    },
    {
      href: "/student/exam-calendar",
      label: "Exam Calendar",
      icon: Calendar,
    },
    {
      href: "/settings",
      label: "Settings",
      icon: Settings,
      colorClass: "text-slate-500",
    },
  ],
};

export const STUDENT_NAV_GROUPS: StudentNavGroup[] = [
  LEARN_GROUP,
  WORKSPACE_GROUP,
  AI_TOOLS_GROUP,
  PROGRESS_GROUP,
];

/** Routes that use the student portal shell (sidebar) when logged in as student */
export const STUDENT_PORTAL_AI_ROUTES = [
  "/",
  "/history",
  "/knowledge",
  "/notebook",
  "/question",
  "/solver",
  "/guide",
  "/research",
  // "/video",
  "/settings",
];

export function isStudentPortalAiRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  return STUDENT_PORTAL_AI_ROUTES.some(
    (r) => r !== "/" && (pathname === r || pathname.startsWith(`${r}/`)),
  );
}

export function isNavItemActive(pathname: string, href: string): boolean {
  if (href === "/student/dashboard") {
    return pathname === "/student/dashboard";
  }
  if (href === "/student/chat") {
    return pathname === "/student/chat";
  }
  if (href === "/") {
    return pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
