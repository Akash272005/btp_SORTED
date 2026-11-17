/**
 * Shared helpers for Video Learning localStorage session (transcript, doubts, resume time).
 * IDs must be compared as strings — backend / JSON may use mixed types.
 */

export const VIDEO_SESSION_STORAGE_KEY = "video-learning-data";

export function normalizeYtVideoId(id: unknown): string {
  if (id === undefined || id === null) return "";
  return String(id).trim();
}

export function ytIdsEqual(a: unknown, b: unknown): boolean {
  const na = normalizeYtVideoId(a);
  const nb = normalizeYtVideoId(b);
  return na.length > 0 && na === nb;
}
