import type { ReactNode } from "react";
import { portalDetail } from "@/lib/portalDetailUi";

interface PortalStudentTableProps {
  columns: ReactNode;
  children: ReactNode;
  minWidth?: string;
}

export default function PortalStudentTable({
  columns,
  children,
  minWidth = "640px",
}: PortalStudentTableProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <div className="overflow-x-auto">
      <table className={portalDetail.table} style={{ minWidth }}>
        <thead className={portalDetail.thead}>
          <tr>{columns}</tr>
        </thead>
        <tbody className={portalDetail.tbody}>{children}</tbody>
      </table>
      </div>
    </div>
  );
}

export function PortalTableTh({ children }: { children: ReactNode }) {
  return <th className={portalDetail.th}>{children}</th>;
}

export function PortalTableRow({ children }: { children: ReactNode }) {
  return <tr className={portalDetail.tr}>{children}</tr>;
}

export function PortalTableTd({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`${portalDetail.td} ${className}`.trim()}>{children}</td>;
}
