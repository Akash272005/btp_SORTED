import type { ReactNode } from "react";
import { portalShellHeader } from "@/lib/portalShellHeader";

export default function TeacherDashboardToolbar({
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
