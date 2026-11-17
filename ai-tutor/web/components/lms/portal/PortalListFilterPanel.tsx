import type { ReactNode } from "react";
import { portalList } from "@/lib/portalListUi";

type PortalListFilterPanelVariant = "card" | "toolbar";

export default function PortalListFilterPanel({
  children,
  variant = "card",
}: {
  children: ReactNode;
  variant?: PortalListFilterPanelVariant;
}) {
  if (variant === "toolbar") {
    return (
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-2">
        {children}
      </div>
    );
  }

  return (
    <div className={`${portalList.filterPanel} flex w-full flex-col gap-4`}>
      {children}
    </div>
  );
}
