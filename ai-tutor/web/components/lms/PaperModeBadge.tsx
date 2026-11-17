const DARK_STYLES: Record<string, string> = {
  online_exam: "bg-indigo-500/20 text-indigo-300",
  written: "bg-amber-500/20 text-amber-300",
  practice: "bg-emerald-500/20 text-emerald-300",
  download: "bg-slate-600/50 text-slate-300",
  other: "bg-slate-700 text-slate-400",
};

const LIGHT_STYLES: Record<string, string> = {
  online_exam: "bg-indigo-100 text-indigo-700 ring-indigo-200",
  written: "bg-amber-100 text-amber-800 ring-amber-200",
  practice: "bg-emerald-100 text-emerald-700 ring-emerald-200",
  download: "bg-slate-100 text-slate-600 ring-slate-200",
  other: "bg-slate-100 text-slate-600 ring-slate-200",
};

type Props = {
  mode: string;
  label?: string;
  className?: string;
  variant?: "light" | "dark";
};

export default function PaperModeBadge({
  mode,
  label,
  className = "",
  variant = "dark",
}: Props) {
  const styles = variant === "light" ? LIGHT_STYLES : DARK_STYLES;
  const cls = styles[mode] || styles.other;
  const text =
    label ||
    ({
      online_exam: "Online test",
      written: "Written",
      practice: "Practice",
      download: "Download",
    }[mode] ||
      "Paper");
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${variant === "light" ? "ring-1" : ""} ${cls} ${className}`}
    >
      {text}
    </span>
  );
}
