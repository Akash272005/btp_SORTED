"use client";

/** Top bar — back link, breadcrumbs, page title, and PortalHeaderUserMenu. */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import PortalHeaderUserMenu from "@/components/lms/portal/PortalHeaderUserMenu";
import { useAuthStore } from "@/store/authStore";
import {
  getPortalBreadcrumbs,
  getPortalPageTitle,
  getPortalShellBackHref,
} from "@/lib/portalBreadcrumbs";
import { portalShellHeader } from "@/lib/portalShellHeader";
import type { UserRole } from "@/types/lms";

export default function PortalShellBar() {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const role = user?.role as UserRole | undefined;
  const crumbs = getPortalBreadcrumbs(pathname, role);
  const pageTitle = getPortalPageTitle(pathname, role);
  const backHref = getPortalShellBackHref(pathname, role);
  const isAdmin = role === "admin";
  const isTeacher = role === "teacher";
  const isStudent = role === "student";
  const showShellBar = isAdmin || isTeacher || isStudent;
  const backLabel =
    crumbs.length > 0 && crumbs[0].href === backHref
      ? `Back to ${crumbs[0].label}`
      : isAdmin || isTeacher
        ? "Back to Dashboard"
        : "Back to Home";

  if (!showShellBar && crumbs.length === 0) return null;

  return (
    <header className={portalShellHeader.bar}>
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {backHref ? (
          <Link
            href={backHref}
            className={portalShellHeader.titleBackBtn}
            aria-label={backLabel}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
          </Link>
        ) : null}
        {pageTitle ? (
          <h1 className={portalShellHeader.pageTitle}>{pageTitle}</h1>
        ) : null}
        {crumbs.length > 0 ? (
          <nav
            aria-label="Breadcrumb"
            className="flex min-w-0 flex-1 items-center text-slate-500"
          >
            <ol className="flex min-w-0 flex-wrap items-center gap-1.5">
              {crumbs.map((crumb, i) => {
                const isLast = i === crumbs.length - 1;
                return (
                  <li
                    key={`${crumb.label}-${i}`}
                    className="flex min-w-0 items-center gap-1.5"
                  >
                    {i > 0 ? (
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-slate-400"
                        aria-hidden
                      />
                    ) : null}
                    {crumb.href && !isLast ? (
                      <Link
                        href={crumb.href}
                        className={portalShellHeader.breadcrumb}
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span
                        className={
                          isLast
                            ? portalShellHeader.breadcrumbCurrent
                            : portalShellHeader.breadcrumb
                        }
                        aria-current={isLast ? "page" : undefined}
                      >
                        {crumb.label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </nav>
        ) : null}
      </div>
      {showShellBar ? <PortalHeaderUserMenu /> : null}
    </header>
  );
}
