/** Validate pre-parsed exam folder paths for Mimic Exam mode. */

export type MimicExamSample = {
  id: string;
  label: string;
  question_count?: number | null;
};

export function isValidMimicPaperPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed) return false;
  // Users often type question count (e.g. "5") here by mistake
  if (/^\d+$/.test(trimmed)) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  if (/\s/.test(trimmed)) return false;
  if (trimmed.length < 2 || trimmed.length > 128) return false;
  if (trimmed.includes("..")) return false;
  return /^[a-zA-Z0-9_\-]+(?:\/[a-zA-Z0-9_\-]+)*$/.test(trimmed);
}

export function getMimicPaperPathError(path: string, t?: (key: string) => string): string | null {
  const trimmed = path.trim();
  if (!trimmed) return null;

  const tr = t ?? ((k: string) => k);

  if (/^\d+$/.test(trimmed)) {
    return tr("mimic.paper_path_is_number").replace("{{value}}", trimmed);
  }
  if (/\s/.test(trimmed) || trimmed.split(/\s+/).length > 1) {
    return tr("mimic.paper_path_has_spaces");
  }
  if (!/[a-zA-Z]/.test(trimmed)) {
    return tr("mimic.paper_path_needs_letters");
  }
  if (!isValidMimicPaperPath(trimmed)) {
    return tr("mimic.paper_path_invalid");
  }
  return null;
}
