/** Parse NCERT class number (1–12) from LMS profile grade, e.g. "Grade 8-A" → "8". */
export function parseClassLevelFromGrade(grade?: string | null): string | null {
  if (!grade?.trim()) return null;
  const match = grade.match(/(\d{1,2})/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  if (n < 1 || n > 12) return null;
  return String(n);
}

/** NCERT knowledge-base id used by Smart Solver for a given class. */
export function kbNameForClass(classLevel: string): string {
  return `ncert-class-${classLevel}`;
}
