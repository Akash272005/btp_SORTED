import { RefreshCw } from "lucide-react";
import { portalList } from "@/lib/portalListUi";

export default function PortalRefreshButton({
  refreshing,
  disabled,
  onClick,
  label = "Refresh",
}: {
  refreshing: boolean;
  disabled?: boolean;
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled || refreshing}
      onClick={onClick}
      className={portalList.actionGhost}
    >
      <RefreshCw
        className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
        aria-hidden
      />
      {refreshing ? "Refreshing…" : label}
    </button>
  );
}
