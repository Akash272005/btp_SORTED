/**
 * Normalize exam mark notation in question text (e.g. "10 M" → "10 Marks").
 */

function marksLabel(value: string): string {
  const n = parseInt(value, 10);
  if (Number.isNaN(n)) return value;
  return n === 1 ? "1 Mark" : `${n} Marks`;
}

function formatSlashMarks(nums: string): string {
  const parts = nums.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 6) return nums;
  if (!parts.every((p) => /^\d{1,2}$/.test(p) && parseInt(p, 10) >= 1 && parseInt(p, 10) <= 100)) {
    return nums;
  }
  return parts.map(marksLabel).join(" / ");
}

const SLASH_GROUP = /\b(\d{1,2}(?:\/\d{1,2}){1,5})\b/g;

/** Make mark values readable in generated exam questions. */
export function normalizeExamMarks(text: string): string {
  if (!text?.trim()) return text;

  let result = text;

  // **10 M** (markdown bold)
  result = result.replace(/\*\*(\d{1,3})\s*M\*\*/gi, (_m, n: string) => `**${marksLabel(n)}**`);

  // [5/6/1] or (5/6/1)
  result = result.replace(
    /([\[(])(\d{1,2}(?:\/\d{1,2}){1,5})([\])])/g,
    (_m, open: string, nums: string, close: string) =>
      `${open}${formatSlashMarks(nums)}${close}`,
  );

  // : 5/6/1 at end of line
  result = result.replace(
    /:\s*(\d{1,2}(?:\/\d{1,2}){1,5})(?=\s*$)/gm,
    (_m, nums: string) => `: ${formatSlashMarks(nums)}`,
  );

  // Integer + M (skip molarity like "1 M NaCl")
  result = result.replace(
    /\b(\d{1,3})\s*M\b(?!\s*[A-Za-z])/g,
    (_m, n: string) => marksLabel(n),
  );

  // Remaining slash groups
  result = result.replace(SLASH_GROUP, (_m, nums: string) => formatSlashMarks(nums));

  // "2 marks" → "2 Marks"
  result = result.replace(/\b(\d{1,3})\s*marks\b/gi, (_m, n: string) => marksLabel(n));

  return result;
}
