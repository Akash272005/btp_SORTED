"use client";

/**
 * Top-right user menu — admin shows school name + logo; teacher/student show personal info.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import { portalShellHeader } from "@/lib/portalShellHeader";

function teacherProfileLine(user: {
  grade?: string | null;
  class_id?: string | null;
}): string {
  const formatClassLabel = (classId: string) => {
    const match = classId.match(/^class-(\d+)([a-z])?$/i);
    if (match) {
      const grade = match[1];
      const section = match[2] ? match[2].toUpperCase() : "";
      return section ? `Grade ${grade}-${section}` : `Grade ${grade}`;
    }
    return classId
      .replace(/^class[-_]?/i, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };
  const parts = [
    user.grade,
    user.class_id ? formatClassLabel(user.class_id) : null,
  ].filter(Boolean);
  return parts.join(" · ") || "Teacher";
}

export default function PortalHeaderUserMenu() {
  const { user, logout } = useAuthStore();
  const schoolBranding = usePortalStore((s) => s.schoolBranding);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  if (!user) return null;

  const isAdmin = user.role === "admin";
  const initials =
    user.avatar_initials || user.full_name.slice(0, 2).toUpperCase();
  const schoolName = schoolBranding?.school_name?.trim() || "School Portal";
  const schoolLogoUrl = isAdmin ? schoolBranding?.logo_url : null;
  const roleLine =
    user.role === "admin"
      ? "School Head"
      : user.role === "teacher"
        ? teacherProfileLine(user)
        : [user.grade, user.roll_no ? `Roll no. ${user.roll_no}` : null]
            .filter(Boolean)
            .join(" - ");
  const accountLine = `${user.full_name} · ${roleLine}`;

  const avatar = schoolLogoUrl ? (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-slate-200 shadow-sm"
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={schoolLogoUrl} alt="" className="h-full w-full object-contain p-0.5" />
    </span>
  ) : (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-xs font-bold text-white shadow-sm"
      aria-hidden
    >
      {initials}
    </span>
  );

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${portalShellHeader.userBtn} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className={portalShellHeader.userName} title={schoolName}>
          {schoolName}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
        {avatar}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200/90 bg-white py-1 shadow-lg ring-1 ring-slate-900/5"
        >
          <div className="border-b border-slate-100 bg-slate-50/50 px-4 py-3">
            <div className="flex items-center gap-3">
              {isAdmin && schoolLogoUrl ? (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={schoolLogoUrl}
                    alt=""
                    className="h-full w-full object-contain p-0.5"
                  />
                </span>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900" title={schoolName}>
                  {schoolName}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-500" title={accountLine}>
                  {accountLine}
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
              window.location.href = "/login";
            }}
            className="flex w-full items-center gap-2 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
