"use client";

/** School logo + name mark for sidebar and login; shows "Powered by LearningBix". */

import { BookMarked } from "lucide-react";
import { LEARNINGBIX_COMPANY_NAME } from "@/services/lmsApi";
import type { SchoolBranding } from "@/services/lmsApi";

type SchoolBrandMarkProps = {
  branding: SchoolBranding | null;
  portalSubtitle: string;
  collapsed?: boolean;
  showPlatformCredit?: boolean;
  size?: "sidebar" | "login";
};

export default function SchoolBrandMark({
  branding,
  portalSubtitle,
  collapsed = false,
  showPlatformCredit = true,
  size = "sidebar",
}: SchoolBrandMarkProps) {
  const schoolName = branding?.school_name?.trim() || "School Portal";
  const logoUrl = branding?.logo_url;
  const iconSize = size === "login" ? "h-14 w-14" : "h-10 w-10";
  const iconInner = size === "login" ? "h-8 w-8" : "h-5 w-5";

  const logo = (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm ${iconSize}`}
    >
      {logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoUrl} alt="" className="h-full w-full object-contain bg-white" />
      ) : (
        <BookMarked className={`${iconInner} text-white`} />
      )}
    </div>
  );

  if (collapsed) {
    return logo;
  }

  if (size === "login") {
    return (
      <div className="flex flex-col items-center text-center">
        {logo}
        <p className="mt-4 text-xl font-bold tracking-tight text-vidya-800" title={schoolName}>
          {schoolName}
        </p>
        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          {portalSubtitle}
        </p>
        {showPlatformCredit ? (
          <p className="mt-1 text-xs text-slate-400">Powered by {LEARNINGBIX_COMPANY_NAME}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3">
      {logo}
      <div className="min-w-0 flex-1">
        <p
          className="truncate text-base font-bold tracking-tight text-slate-900"
          title={schoolName}
        >
          {schoolName}
        </p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          {portalSubtitle}
        </p>
        {showPlatformCredit ? (
          <p className="mt-0.5 text-[10px] text-slate-400">
            Powered by {LEARNINGBIX_COMPANY_NAME}
          </p>
        ) : null}
      </div>
    </div>
  );
}
