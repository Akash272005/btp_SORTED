/**
 * Admin sidebar navigation groups — Main, School, Insights, Tools.
 * Used by PortalSidebar and portal breadcrumbs.
 */

import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  School,
  GraduationCap,
  Users,
  UserCog,
  BarChart3,
  Settings,
} from "lucide-react";

export type AdminNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  description?: string;
};

export type AdminNavGroup = {
  id: string;
  label: string;
  items: AdminNavItem[];
};

export const ADMIN_NAV_GROUPS: AdminNavGroup[] = [
  {
    id: "main",
    label: "Main",
    items: [
      {
        href: "/admin/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
      },
    ],
  },
  {
    id: "school",
    label: "School",
    items: [
      { href: "/admin/classes", label: "Classes", icon: School, description: "Class sections and join codes" },
      { href: "/admin/teachers", label: "Teachers", icon: GraduationCap, description: "Assign teachers to classes and subjects" },
      { href: "/admin/students", label: "Students", icon: Users, description: "Students by class and bulk import" },
      {
        href: "/admin/users",
        label: "All Users",
        icon: UserCog,
        description: "Create and manage student, teacher, and admin accounts",
      },
    ],
  },
  {
    id: "insights",
    label: "Insights",
    items: [
      {
        href: "/admin/analytics",
        label: "School Analytics",
        icon: BarChart3,
        description: "School-wide performance and at-risk rollup",
      },
    ],
  },
  {
    id: "tools",
    label: "Tools",
    items: [
      {
        href: "/admin/settings",
        label: "School Settings",
        icon: Settings,
        description: "School profile, NCERT curriculum, and academic year",
      },
    ],
  },
];

export function isAdminNavActive(pathname: string, href: string): boolean {
  if (href === "/admin/dashboard") {
    return pathname === "/admin/dashboard";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Flat list for breadcrumbs and title resolution */
export function getAdminNavEntries(): { href: string; label: string }[] {
  return ADMIN_NAV_GROUPS.flatMap((group) =>
    group.items.map((item) => ({ href: item.href, label: item.label })),
  );
}
