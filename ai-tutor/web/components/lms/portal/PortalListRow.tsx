import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { portalList } from "@/lib/portalListUi";

interface PortalListRowProps {
  icon?: LucideIcon;
  iconClassName?: string;
  highlight?: boolean;
  /** Use inside `portalList.listPanel` + `divide-y` list. */
  variant?: "card" | "divided";
  title: ReactNode;
  badge?: ReactNode;
  meta?: ReactNode;
  actions: ReactNode;
}

export default function PortalListRow({
  icon: Icon,
  iconClassName = "bg-indigo-50 text-indigo-600",
  highlight = false,
  variant = "card",
  title,
  badge,
  meta,
  actions,
}: PortalListRowProps) {
  const rowClass =
    variant === "divided"
      ? `${portalList.rowDivided}${highlight ? " bg-amber-50/25" : ""}`
      : `${portalList.row} ${highlight ? portalList.rowHighlight : ""}`;

  return (
    <li className={rowClass}>
      <div className={portalList.rowInner}>
        <div className={portalList.rowMain}>
          {Icon ? (
            <span className={`${portalList.rowIcon} ${iconClassName}`}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={portalList.rowTitle}>{title}</h3>
              {badge}
            </div>
            {meta ? <div className={portalList.rowMeta}>{meta}</div> : null}
          </div>
        </div>
        <div className="relative z-10 flex shrink-0 flex-wrap items-center justify-end gap-2 sm:ml-auto">
          {actions}
        </div>
      </div>
    </li>
  );
}

export function PortalStatusBadge({
  children,
  variant = "draft",
}: {
  children: ReactNode;
  variant?: "published" | "draft" | "indigo" | "warn";
}) {
  const variantClass =
    variant === "published"
      ? portalList.badgePublished
      : variant === "indigo"
        ? portalList.badgeIndigo
        : variant === "warn"
          ? portalList.badgeWarn
          : portalList.badgeDraft;
  return (
    <span className={`${portalList.badge} ${variantClass}`}>{children}</span>
  );
}
