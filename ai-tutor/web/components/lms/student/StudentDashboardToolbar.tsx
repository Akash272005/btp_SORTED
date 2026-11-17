import type { ReactNode } from "react";
import { portalShellHeader } from "@/lib/portalShellHeader";

export default function StudentDashboardToolbar({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className={portalShellHeader.toolbar}>
      <div className={portalShellHeader.toolbarInner}>{children}</div>
    </div>
  );
}
