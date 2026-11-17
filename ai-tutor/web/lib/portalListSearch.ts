/** Client-side list filter (display only; does not change API). */
export function matchesPortalListSearch(
  query: string,
  ...parts: (string | null | undefined)[]
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}
