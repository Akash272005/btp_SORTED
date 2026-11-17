"use client";

/**
 * LMS portal sidebar — role-based nav (admin / teacher / student) + school branding header.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import SchoolBrandMark from "@/components/lms/SchoolBrandMark";
import { LanguageSelect } from "@/components/LanguageSelect";
import { useGlobal } from "@/context/GlobalContext";
import { useAuthStore } from "@/store/authStore";
import {
  usePortalStore,
  PORTAL_SIDEBAR_WIDTH_COLLAPSED,
  PORTAL_SIDEBAR_WIDTH_EXPANDED,
} from "@/store/portalStore";
import {
  STUDENT_NAV_GROUPS,
  isNavItemActive,
  type StudentNavItem,
} from "@/lib/studentNav";
import {
  TEACHER_NAV_GROUPS,
  isTeacherNavActive,
  type TeacherNavItem,
} from "@/lib/teacherNav";
import {
  ADMIN_NAV_GROUPS,
  isAdminNavActive,
  type AdminNavItem,
} from "@/lib/adminNav";
import type { UserRole } from "@/types/lms";
import {
  portalNavGroupDividerClassName,
  portalNavLinkClassName,
} from "@/lib/portalShellNav";

function NavTooltip({
  label,
  show,
  children,
}: {
  label: string;
  show: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      {children}
      {show ? (
        <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg">
          {label}
        </span>
      ) : null}
    </div>
  );
}

function StudentNavLink({
  item,
  pathname,
  badge,
  collapsed,
}: {
  item: StudentNavItem;
  pathname: string;
  badge?: number;
  collapsed: boolean;
}) {
  const active = isNavItemActive(pathname, item.href);
  const Icon = item.icon;
  const [hovered, setHovered] = useState(false);
  const badgeCls =
    item.badgeColor === "blue"
      ? "bg-blue-500 text-white"
      : "bg-red-500 text-white";

  const link = (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={portalNavLinkClassName(active, collapsed)}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${
          active ? "text-indigo-600" : item.colorClass || "text-slate-600"
        }`}
      />
      {!collapsed ? <span className="flex-1">{item.label}</span> : null}
      {!collapsed && badge ? (
        <span
          className={`flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${badgeCls}`}
        >
          {badge}
        </span>
      ) : null}
      {collapsed && badge ? (
        <span
          className={`absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold ${badgeCls}`}
        >
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <NavTooltip label={badge ? `${item.label} (${badge})` : item.label} show={hovered}>
      {link}
    </NavTooltip>
  );
}

function TeacherNavLink({
  item,
  pathname,
  badge,
  collapsed,
}: {
  item: TeacherNavItem;
  pathname: string;
  badge?: number;
  collapsed: boolean;
}) {
  const active = isTeacherNavActive(pathname, item.href);
  const Icon = item.icon;
  const [hovered, setHovered] = useState(false);

  const link = (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={portalNavLinkClassName(active, collapsed)}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${
          active ? "text-indigo-600" : item.colorClass || "text-slate-600"
        }`}
      />
      {!collapsed ? <span className="flex-1">{item.label}</span> : null}
      {!collapsed && badge ? (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
          {badge}
        </span>
      ) : null}
      {collapsed && badge ? (
        <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <NavTooltip label={badge ? `${item.label} (${badge})` : item.label} show={hovered}>
      {link}
    </NavTooltip>
  );
}

function AdminNavLink({
  item,
  pathname,
  collapsed,
}: {
  item: AdminNavItem;
  pathname: string;
  collapsed: boolean;
}) {
  const active = isAdminNavActive(pathname, item.href);
  const Icon = item.icon;
  const [hovered, setHovered] = useState(false);

  const link = (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      onMouseEnter={() => collapsed && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={portalNavLinkClassName(active, collapsed)}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className={`h-[18px] w-[18px] shrink-0 ${active ? "text-indigo-600" : "text-slate-600"}`}
      />
      {!collapsed ? <span className="flex-1">{item.label}</span> : null}
    </Link>
  );

  if (!collapsed) return link;
  return (
    <NavTooltip label={item.label} show={hovered}>
      {link}
    </NavTooltip>
  );
}

export default function PortalSidebar() {
  const pathname = usePathname();
  const { user } = useAuthStore();
  const navBadges = usePortalStore((s) => s.navBadges);
  const schoolBranding = usePortalStore((s) => s.schoolBranding);
  const collapsed = usePortalStore((s) => s.sidebarCollapsed);
  const hydrateSidebar = usePortalStore((s) => s.hydrateSidebar);
  const toggleSidebar = usePortalStore((s) => s.toggleSidebar);
  const { uiSettings, updateLanguage } = useGlobal();
  const role = user?.role as UserRole | undefined;
  const isAdmin = role === "admin";
  const isTeacher = role === "teacher";
  const isStudent = role === "student";
  const portalSubtitle = isAdmin
    ? "Admin Portal"
    : isTeacher
      ? "Teacher Portal"
      : "Student Portal";

  useEffect(() => {
    hydrateSidebar();
  }, [hydrateSidebar]);

  const width = collapsed
    ? PORTAL_SIDEBAR_WIDTH_COLLAPSED
    : PORTAL_SIDEBAR_WIDTH_EXPANDED;

  return (
    <aside
      data-portal-sidebar
      className="z-20 flex h-screen shrink-0 flex-col overflow-hidden border-r border-slate-200/80 bg-white shadow-[1px_0_12px_-4px_rgba(15,23,42,0.08)] transition-[width] duration-300 ease-in-out"
      style={{ width }}
    >
      <div
        className={`border-b border-slate-100 transition-all duration-300 ${
          collapsed ? "px-2 py-3" : "px-5 pb-4 pt-6"
        }`}
      >
        <div
          className={`flex items-center ${collapsed ? "flex-col gap-2" : "gap-3"}`}
        >
          <SchoolBrandMark
            branding={schoolBranding}
            portalSubtitle={portalSubtitle}
            collapsed={collapsed}
          />
          <button
            type="button"
            onClick={toggleSidebar}
            className={`shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors outline-none hover:bg-slate-100 hover:text-indigo-600 focus-visible:ring-2 focus-visible:ring-indigo-500/30 ${
              collapsed ? "" : "ml-auto"
            }`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronsRight className="h-4 w-4" />
            ) : (
              <ChevronsLeft className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <nav
        className={`flex-1 overflow-y-auto overflow-x-hidden pb-4 transition-all duration-300 [scrollbar-width:thin] ${
          collapsed ? "space-y-1 px-2" : "space-y-1 px-2"
        }`}
      >
        {isAdmin
          ? ADMIN_NAV_GROUPS.map((group, groupIndex) => (
              <div key={group.id}>
                <div
                  className={portalNavGroupDividerClassName(
                    groupIndex === 0,
                    collapsed,
                  )}
                  aria-hidden
                />
                {!collapsed ? (
                  <p className="mb-1.5 px-3 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
                    {group.label}
                  </p>
                ) : null}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <AdminNavLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      collapsed={collapsed}
                    />
                  ))}
                </div>
              </div>
            ))
          : isTeacher
          ? TEACHER_NAV_GROUPS.map((group, groupIndex) => (
              <div key={group.id}>
                <div
                  className={portalNavGroupDividerClassName(
                    groupIndex === 0,
                    collapsed,
                  )}
                  aria-hidden
                />
                {!collapsed ? (
                  <p className="mb-1.5 px-3 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
                    {group.label}
                  </p>
                ) : null}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <TeacherNavLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      collapsed={collapsed}
                      badge={
                        item.badgeKey ? navBadges[item.badgeKey] : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            ))
          : STUDENT_NAV_GROUPS.map((group, groupIndex) => (
              <div key={group.id}>
                <div
                  className={portalNavGroupDividerClassName(
                    groupIndex === 0,
                    collapsed,
                  )}
                  aria-hidden
                />
                {!collapsed ? (
                  <p className="mb-1.5 px-3 pt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-600">
                    {group.label}
                  </p>
                ) : null}
                <div className="space-y-0.5">
                  {group.items.map((item) => (
                    <StudentNavLink
                      key={item.href}
                      item={item}
                      pathname={pathname}
                      collapsed={collapsed}
                      badge={
                        item.badgeKey ? navBadges[item.badgeKey] : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
      </nav>

      {user && isStudent && !collapsed ? (
        <div className="border-t border-slate-100/90 bg-slate-50/30 p-4">
          <p className="mb-1.5 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Language
          </p>
          <LanguageSelect
            showLabel
            value={uiSettings.language}
            onChange={updateLanguage}
            className="flex-col items-stretch gap-1.5"
          />
        </div>
      ) : null}
    </aside>
  );
}
