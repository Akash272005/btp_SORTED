import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  MessageCircle,
  ClipboardList,
  FileText,
  Book,
  Calculator,
  BarChart3,
  Users,
  ClipboardCheck,
  Calendar,
  Settings,
  Edit3,
} from "lucide-react";

export type TeacherNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badgeKey?: string;
  colorClass?: string;
};

export type TeacherNavGroup = {
  id: string;
  label: string;
  items: TeacherNavItem[];
};

export const TEACHER_NAV_GROUPS: TeacherNavGroup[] = [
  {
    id: "main",
    label: "Main",
    items: [
      { href: "/teacher/dashboard", label: "Dashboard", icon: LayoutDashboard },
      {
        href: "/teacher/quizzes",
        label: "Quizzes",
        icon: ClipboardList,
        badgeKey: "assignments",
      },
      {
        href: "/teacher/papers",
        label: "Question Papers",
        icon: FileText,
        badgeKey: "papers",
      },
      { href: "/teacher/exam-calendar", label: "Exam Calendar", icon: Calendar },
    ],
  },
  {
    id: "analytics",
    label: "Analytics",
    items: [
      { href: "/teacher/analytics", label: "Class Analytics", icon: BarChart3 },
      { href: "/teacher/reports", label: "Student Reports", icon: Users },
      { href: "/teacher/review", label: "Evaluation", icon: ClipboardCheck },
    ],
  },
  {
    id: "ai-tutor",
    label: "AI Tutor",
    items: [
      {
        href: "/teacher/chat",
        label: "AI Chat",
        icon: MessageCircle,
        colorClass: "text-indigo-500",
      },
      {
        href: "/notebook",
        label: "Notebooks",
        icon: Book,
        colorClass: "text-pink-500",
      },
      {
        href: "/solver",
        label: "Smart Solver",
        icon: Calculator,
        colorClass: "text-indigo-500",
      },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    items: [
      { href: "/co_writer", label: "Co-Writer", icon: Edit3 },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Shared AI Tutor routes that use the teacher portal shell (sidebar) */
export const TEACHER_PORTAL_AI_ROUTES = [
  "/notebook",
  "/solver",
  "/co_writer",
  "/settings",
];

export function isTeacherPortalAiRoute(pathname: string): boolean {
  return TEACHER_PORTAL_AI_ROUTES.some(
    (r) => pathname === r || pathname.startsWith(`${r}/`),
  );
}

export function isTeacherNavActive(pathname: string, href: string): boolean {
  if (href === "/teacher/dashboard") {
    return pathname === "/teacher/dashboard";
  }
  if (href === "/teacher/chat") {
    return pathname === "/teacher/chat";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
