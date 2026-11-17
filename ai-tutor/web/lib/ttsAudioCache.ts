/**
 * Browser Cache Storage for TTS audio blobs so replay / page refresh does not
 * call `/api/v1/tts/synthesize` again for the same passage + language + summary text.
 */

export const CONCEPT_TTS_CACHE_NAME = "bixy:conceptSummary:tts:v1";

const CACHE_ORIGIN = "https://tts-cache.local";

function cacheRequestForKey(cacheKey: string): Request {
  return new Request(`${CACHE_ORIGIN}/c/${encodeURIComponent(cacheKey)}`);
}

/** Stable key: message fingerprint | language | summary fingerprint */
export function buildConceptTtsCacheKey(
  messageFingerprint: string,
  language: "en" | "hi",
  summaryFingerprint: string,
): string {
  return `${messageFingerprint}|${language}|${summaryFingerprint}`;
}

export async function getCachedTtsBlob(cacheKey: string): Promise<Blob | null> {
  if (typeof window === "undefined" || typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CONCEPT_TTS_CACHE_NAME);
    const hit = await cache.match(cacheRequestForKey(cacheKey));
    if (!hit || !hit.ok) return null;
    return hit.blob();
  } catch {
    return null;
  }
}

export async function putCachedTtsBlob(cacheKey: string, blob: Blob): Promise<void> {
  if (typeof window === "undefined" || typeof caches === "undefined") return;
  try {
    const cache = await caches.open(CONCEPT_TTS_CACHE_NAME);
    const req = cacheRequestForKey(cacheKey);
    await cache.put(req, new Response(blob, { status: 200, statusText: "OK" }));
  } catch {
    /* quota / private mode */
  }
}

/** Remove all cached audio for one assistant message (when `text`/`query` changes). */
export async function deleteCachedTtsForMessage(messageFingerprint: string): Promise<void> {
  if (typeof window === "undefined" || typeof caches === "undefined") return;
  const prefix = `${messageFingerprint}|`;
  try {
    const cache = await caches.open(CONCEPT_TTS_CACHE_NAME);
    const keys = await cache.keys();
    await Promise.all(
      keys.map(async (req) => {
        try {
          const u = new URL(req.url);
          const segment = u.pathname.startsWith("/c/") ? u.pathname.slice(3) : "";
          const decoded = decodeURIComponent(segment);
          if (decoded.startsWith(prefix)) await cache.delete(req);
        } catch {
          /* ignore */
        }
      }),
    );
  } catch {
    /* ignore */
  }
}
