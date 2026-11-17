/**
 * LMS API datetimes are UTC (naive on the server, often without a "Z" suffix in JSON).
 * Parse them as UTC so exam timers and due dates match the backend.
 */
export function parseApiUtc(iso: string | undefined | null): Date | null {
  if (!iso?.trim()) return null;
  const s = iso.trim();
  const normalized =
    s.endsWith("Z") || /[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`;
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format due datetime for student-facing UI (local timezone). */
export function formatStudentDueDateTime(iso: string | undefined | null): string {
  const d = parseApiUtc(iso);
  if (!d) return "";
  return d.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
