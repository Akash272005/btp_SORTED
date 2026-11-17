"use client";

/**
 * ConceptSummary
 * ==============
 * Appended after every completed AI text response. Fetches a 3–5 sentence
 * student-friendly summary from `/api/v1/tts/concept-summary`, then lets the
 * student play it as audio via the existing `/api/v1/tts/synthesize` route.
 *
 * Language-aware:
 *   - Hindi query (Devanagari characters in `query`) → Hindi summary + Hindi TTS.
 *   - English query OR mixed UI in English → English summary + English TTS.
 *   - `uiLanguage` (the i18next locale) is used as an extra hint when the
 *     query doesn't disambiguate.
 *
 * The summary is fetched at most once per `text` value and cached in memory
 * for the message's lifetime; the rendered audio blob is also cached so the
 * student can replay instantly.
 *
 * Summaries are also persisted in `localStorage` (keyed by answer text + query +
 * request language) so a full page refresh does not re-call the LLM for the same
 * message.
 *
 * TTS audio is cached in memory (keyed by message + language + exact summary text)
 * and in the browser Cache API so replay and refresh do not call synthesize again.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Volume2,
  VolumeX,
  Loader2,
  Sparkles,
  Square,
  Play,
  Gauge,
  Minus,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import {
  buildConceptTtsCacheKey,
  deleteCachedTtsForMessage,
  getCachedTtsBlob,
  putCachedTtsBlob,
} from "@/lib/ttsAudioCache";
import { useTranslation } from "react-i18next";

/**
 * Available playback speeds. 1× is the default; 0.75× for slow learners,
 * 1.25× / 1.5× / 1.75× / 2× for quick recap. All applied via
 * `audio.playbackRate` with `preservesPitch` enabled so the voice stays natural.
 */
const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 1.75, 2.0] as const;
type PlaybackSpeed = (typeof PLAYBACK_SPEEDS)[number];

type SummaryLang = "en" | "hi";

interface ConceptSummaryProps {
  /** The full assistant message content (markdown allowed; we'll strip on the server). */
  text: string;
  /** The student's original question. Strongest signal for language. */
  query?: string;
  /** Optional UI-language hint (i18next `language`). */
  uiLanguage?: string;
  /** Force a language. Skips auto-detection. */
  forceLanguage?: SummaryLang;
  /** Optional extra wrapper classes. */
  className?: string;
}

type SummaryStatus = "idle" | "loading" | "ready" | "error";
type PlaybackStatus = "idle" | "loading" | "playing" | "error";

const DEVANAGARI_RE = /[\u0900-\u097F]/;

function detectClientLanguage(
  query: string | undefined,
  uiLanguage: string | undefined,
  text: string,
): "auto" | SummaryLang {
  // Defer to the server when we have no strong client-side signal.
  if (query && DEVANAGARI_RE.test(query)) return "hi";
  if (uiLanguage && uiLanguage.toLowerCase().startsWith("hi")) return "hi";
  // Lots of Hindi in the answer body → Hindi.
  const hits = text.match(/[\u0900-\u097F]/g);
  if (hits && hits.length > 20) return "hi";
  return "auto";
}

interface SummaryPayload {
  summary: string;
  language: SummaryLang;
  sentence_count: number;
}

/** One localStorage blob per assistant answer; holds summaries per request key. */
const LS_STORE_PREFIX = "bixy:conceptSummary:v1";

type SummaryRequestKey = "auto" | SummaryLang;

interface ConceptSummaryStore {
  v: 1;
  /** The first language we generated for this message; second language is a translation of this. */
  primaryLang?: SummaryLang;
  entries: Partial<Record<SummaryRequestKey, SummaryPayload>>;
}

function fingerprintTextAndQuery(text: string, query: string | undefined): string {
  const payload = `${text}\u0000${query ?? ""}`;
  let h1 = 5381;
  let h2 = 52711;
  for (let i = 0; i < payload.length; i += 1) {
    const c = payload.charCodeAt(i);
    h1 = Math.imul(33, h1) ^ c;
    h2 = Math.imul(33, h2) ^ (c + i);
  }
  return `${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
}

function localStorageStoreKey(text: string, query: string | undefined): string {
  return `${LS_STORE_PREFIX}:${fingerprintTextAndQuery(text, query)}`;
}

function readConceptSummaryStore(text: string, query: string | undefined): ConceptSummaryStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localStorageStoreKey(text, query));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConceptSummaryStore>;
    if (parsed?.v !== 1 || !parsed.entries || typeof parsed.entries !== "object") return null;
    return {
      v: 1,
      primaryLang:
        parsed.primaryLang === "en" || parsed.primaryLang === "hi"
          ? parsed.primaryLang
          : undefined,
      entries: parsed.entries,
    };
  } catch {
    return null;
  }
}

function writeConceptSummaryEntry(
  text: string,
  query: string | undefined,
  requestKey: SummaryRequestKey,
  payload: SummaryPayload,
  primaryLang?: SummaryLang,
): void {
  if (typeof window === "undefined") return;
  const key = localStorageStoreKey(text, query);
  let store: ConceptSummaryStore = { v: 1, entries: {} };
  try {
    const existing = window.localStorage.getItem(key);
    if (existing) {
      const parsed = JSON.parse(existing) as Partial<ConceptSummaryStore>;
      if (parsed?.v === 1 && parsed.entries && typeof parsed.entries === "object") {
        store = {
          v: 1,
          primaryLang:
            parsed.primaryLang === "en" || parsed.primaryLang === "hi"
              ? parsed.primaryLang
              : undefined,
          entries: { ...parsed.entries },
        };
      }
    }
  } catch {
    /* keep fresh store */
  }
  store.entries[requestKey] = {
    summary: payload.summary,
    language: payload.language,
    sentence_count: payload.sentence_count,
  };
  // Record the primary language the first time we know it; never overwrite once set.
  if (primaryLang && !store.primaryLang) {
    store.primaryLang = primaryLang;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

function isValidSummaryPayload(x: unknown): x is SummaryPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Partial<SummaryPayload>;
  return (
    typeof o.summary === "string" &&
    o.summary.trim().length > 0 &&
    (o.language === "en" || o.language === "hi")
  );
}

/**
 * Error thrown by `fetchSummary` so the UI can react differently to
 * content-filter rejections vs. transient outages. Carries a stable `code`
 * so the UI can translate the message via i18n.
 */
class SummaryFetchError extends Error {
  readonly status: number;
  /** Stable, translatable error code (e.g. `content_filter`, `generic`). */
  readonly code: "content_filter" | "generic";
  /** Raw provider detail for logs only — never shown to the user. */
  readonly providerDetail: string;
  /** True when the LLM provider's safety/content filter blocked the answer. */
  readonly isContentFilter: boolean;

  constructor(
    status: number,
    code: "content_filter" | "generic",
    providerDetail: string,
    isContentFilter: boolean,
  ) {
    super(code === "content_filter" ? "content_filter" : "summary_unavailable");
    this.name = "SummaryFetchError";
    this.status = status;
    this.code = code;
    this.providerDetail = providerDetail;
    this.isContentFilter = isContentFilter;
  }
}

/** Shared error handler for both `fetchSummary` and `translateSummary`. */
async function throwIfErrorResponse(res: Response): Promise<void> {
  if (res.ok) return;
  const err = await res.json().catch(() => ({}));
  const detail = typeof err?.detail === "string" ? err.detail : "";
  const filterHit =
    res.status === 422 ||
    /content[_ ]filter|content management policy|responsibleaipolicyviolation|policy[_ ]violation/i.test(
      detail,
    );
  const code = filterHit ? "content_filter" : "generic";
  throw new SummaryFetchError(res.status, code, detail, filterHit);
}

async function fetchSummary(
  text: string,
  query: string | undefined,
  hintLang: "auto" | SummaryLang,
): Promise<SummaryPayload> {
  const res = await fetch(apiUrl("/api/v1/tts/concept-summary"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, query, language: hintLang }),
  });
  await throwIfErrorResponse(res);
  return (await res.json()) as SummaryPayload;
}

/**
 * Translate a previously-generated summary into the other language by calling
 * `/api/v1/tts/concept-summary/translate`. This is preferred over generating a
 * fresh summary so the EN ↔ HI toggle stays faithful to the original.
 */
async function translateSummary(
  text: string,
  sourceLang: SummaryLang,
  targetLang: SummaryLang,
): Promise<SummaryPayload> {
  const res = await fetch(apiUrl("/api/v1/tts/concept-summary/translate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      source_lang: sourceLang,
      target_lang: targetLang,
    }),
  });
  await throwIfErrorResponse(res);
  return (await res.json()) as SummaryPayload;
}

/**
 * Convert any caught error into a short, student-friendly string using i18n.
 * Falls back to a localised "unavailable" message rather than leaking raw
 * provider JSON.
 */
function describeSummaryError(e: unknown, t: (key: string) => string): string {
  if (e instanceof SummaryFetchError) {
    return e.code === "content_filter"
      ? t("summary.content_filter")
      : t("summary.unavailable");
  }
  const raw = e instanceof Error ? e.message : "";
  // Provider blobs commonly start with `[` (e.g. `[azure_openai] HTTP 400 ...`)
  // or `{` (raw JSON). Hide those — they're not useful to a student.
  if (!raw || /^[\[{]/.test(raw.trim())) return t("summary.unavailable");
  if (raw.length > 140) return t("summary.unavailable");
  return raw;
}

async function fetchTtsAudioAndBlob(
  text: string,
  language: SummaryLang,
  speed = 1.0,
): Promise<{ url: string; blob: Blob }> {
  const res = await fetch(apiUrl("/api/v1/tts/synthesize"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language, speed }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `TTS error ${res.status}`);
  }
  const blob = await res.blob();
  return { blob, url: URL.createObjectURL(blob) };
}

export default function ConceptSummary({
  text,
  query,
  uiLanguage,
  forceLanguage,
  className = "",
}: ConceptSummaryProps) {
  const { t } = useTranslation();

  const [summaryStatus, setSummaryStatus] = useState<SummaryStatus>("idle");
  const [summary, setSummary] = useState<string>("");
  /** Auto-detected language from the server (or `forceLanguage`). */
  const [autoLanguage, setAutoLanguage] = useState<SummaryLang>(forceLanguage || "en");
  /**
   * The "primary" language for this message — the one we generated first via
   * /concept-summary. The other language is always derived by *translating*
   * this one via /concept-summary/translate. Persisted to localStorage.
   */
  const [primaryLanguage, setPrimaryLanguage] = useState<SummaryLang | null>(null);
  /** Manual user override; `null` means "use auto/forced". */
  const [userLanguage, setUserLanguage] = useState<SummaryLang | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("idle");
  const [playbackError, setPlaybackError] = useState<string | null>(null);

  /** User-chosen playback speed (1× by default). Persisted across replays on this card. */
  const [speed, setSpeed] = useState<PlaybackSpeed>(1.0);
  /** YouTube-style speed panel popover open/closed. */
  const [speedPanelOpen, setSpeedPanelOpen] = useState(false);
  const speedPanelRef = useRef<HTMLDivElement | null>(null);
  const speedTriggerRef = useRef<HTMLButtonElement | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Cached blob URLs: key = message FP + language + summary FP (not just language). */
  const audioCacheRef = useRef<Map<string, string>>(new Map());
  /** Fingerprint of current message — prune disk TTS when assistant text changes. */
  const messageFingerprintRef = useRef<string | null>(null);
  /** Cached summary text per language (lazy-filled). */
  const summaryCacheRef = useRef<Map<SummaryLang, string>>(new Map());
  // Increment to cancel in-flight fetch + playback when text changes / unmount.
  const generationRef = useRef(0);

  /** Effective language: forced prop > user override > auto-detected. */
  const language: SummaryLang = forceLanguage || userLanguage || autoLanguage;

  /** Drop every cached audio blob (called on unmount and on text change). */
  const purgeCaches = useCallback(() => {
    audioCacheRef.current.forEach((url) => URL.revokeObjectURL(url));
    audioCacheRef.current.clear();
    summaryCacheRef.current.clear();
  }, []);

  // ── Fetch summary when `text` finalizes ───────────────────────────────────
  useEffect(() => {
    if (!text || text.length < 20) {
      messageFingerprintRef.current = null;
      setSummaryStatus("idle");
      setSummary("");
      return;
    }

    const messageFp = fingerprintTextAndQuery(text, query);
    if (
      messageFingerprintRef.current !== null &&
      messageFingerprintRef.current !== messageFp
    ) {
      void deleteCachedTtsForMessage(messageFingerprintRef.current);
    }
    messageFingerprintRef.current = messageFp;

    generationRef.current += 1;
    const gen = generationRef.current;

    setSummaryError(null);
    setUserLanguage(null); // new text → reset manual override
    setPrimaryLanguage(null);
    purgeCaches();

    const hintLang: SummaryRequestKey =
      forceLanguage || detectClientLanguage(query, uiLanguage, text);

    // ── Cache-first: prefer persisted primary; fall back to the hinted entry.
    const persisted = readConceptSummaryStore(text, query);
    const cachedPrimary =
      persisted?.primaryLang
        ? persisted.entries[persisted.primaryLang]
        : undefined;
    const cachedInitial =
      (cachedPrimary && isValidSummaryPayload(cachedPrimary) ? cachedPrimary : undefined) ||
      persisted?.entries[hintLang];

    if (cachedInitial && isValidSummaryPayload(cachedInitial)) {
      const lang: SummaryLang = forceLanguage || cachedInitial.language;
      summaryCacheRef.current.set(lang, cachedInitial.summary);
      setSummary(cachedInitial.summary);
      setAutoLanguage(lang);
      setPrimaryLanguage(persisted?.primaryLang || lang);
      // Also seed cache for the other language if we already have it on disk.
      (["en", "hi"] as SummaryLang[]).forEach((other) => {
        const cachedOther = persisted?.entries[other];
        if (cachedOther && isValidSummaryPayload(cachedOther)) {
          summaryCacheRef.current.set(other, cachedOther.summary);
        }
      });
      setSummaryStatus("ready");
      setSummaryError(null);
      return () => {
        generationRef.current += 1;
        audioRef.current?.pause();
        audioRef.current = null;
        purgeCaches();
      };
    }

    setSummaryStatus("loading");

    fetchSummary(text, query, hintLang)
      .then((payload) => {
        if (generationRef.current !== gen) return;
        const lang: SummaryLang = forceLanguage || payload.language;
        summaryCacheRef.current.set(lang, payload.summary);
        setSummary(payload.summary);
        setAutoLanguage(lang);
        setPrimaryLanguage(lang);
        setSummaryStatus("ready");
        writeConceptSummaryEntry(
          text,
          query,
          hintLang,
          {
            summary: payload.summary,
            language: lang,
            sentence_count: payload.sentence_count,
          },
          lang,
        );
        // Also persist under the exact language key so future toggles can hit cache.
        writeConceptSummaryEntry(
          text,
          query,
          lang,
          {
            summary: payload.summary,
            language: lang,
            sentence_count: payload.sentence_count,
          },
          lang,
        );
      })
      .catch((e: unknown) => {
        if (generationRef.current !== gen) return;
        setSummaryError(describeSummaryError(e, t));
        setSummaryStatus("error");
      });

    return () => {
      generationRef.current += 1;
      audioRef.current?.pause();
      audioRef.current = null;
      purgeCaches();
    };
  }, [text, query, uiLanguage, forceLanguage, purgeCaches, t]);

  /**
   * Produce a summary in `targetLang` using the best available strategy:
   *   1. In-memory cache hit (when `useCache` is true).
   *   2. Disk cache hit (when `useCache` is true).
   *   3. Translate the primary summary into `targetLang`.
   *   4. Fall back to a fresh `/concept-summary` call with `language=targetLang`.
   *
   * Used by both the language-toggle effect and the manual Retry button. The
   * Retry button passes `useCache=false` so a failed-summary state is always
   * re-fetched against the server.
   */
  const produceSummaryInLanguage = useCallback(
    (targetLang: SummaryLang, useCache: boolean) => {
      if (useCache) {
        const cached = summaryCacheRef.current.get(targetLang);
        if (cached) {
          setSummary(cached);
          setSummaryStatus("ready");
          setSummaryError(null);
          return;
        }
        const persistedCache = readConceptSummaryStore(text, query);
        const disk = persistedCache?.entries[targetLang];
        if (disk && isValidSummaryPayload(disk)) {
          summaryCacheRef.current.set(targetLang, disk.summary);
          setSummary(disk.summary);
          setSummaryStatus("ready");
          setSummaryError(null);
          return;
        }
      }

      const persisted = readConceptSummaryStore(text, query);
      const primary: SummaryLang | null =
        primaryLanguage || (persisted?.primaryLang ?? null);
      const primaryText: string | undefined = primary
        ? summaryCacheRef.current.get(primary) ||
          (persisted?.entries[primary]?.summary ?? undefined)
        : undefined;

      generationRef.current += 1;
      const gen = generationRef.current;
      setSummaryStatus("loading");
      setSummaryError(null);

      const handleSuccess = (payload: SummaryPayload) => {
        if (generationRef.current !== gen) return;
        summaryCacheRef.current.set(targetLang, payload.summary);
        setSummary(payload.summary);
        setSummaryStatus("ready");
        // If we had no primary yet (e.g. retry after a failed first fetch),
        // adopt this language as primary so future toggles can translate.
        if (!primary) setPrimaryLanguage(targetLang);
        writeConceptSummaryEntry(
          text,
          query,
          targetLang,
          {
            summary: payload.summary,
            language: payload.language,
            sentence_count: payload.sentence_count,
          },
          primary || targetLang,
        );
      };
      const handleError = (e: unknown) => {
        if (generationRef.current !== gen) return;
        setSummaryError(describeSummaryError(e, t));
        setSummaryStatus("error");
      };

      if (primary && primaryText && primary !== targetLang) {
        // Translation path — preferred.
        translateSummary(primaryText, primary, targetLang)
          .then(handleSuccess)
          .catch((e: unknown) => {
            // If translation hits a content filter, fall back to fresh summary
            // generation rather than showing an error — better than nothing.
            if (e instanceof SummaryFetchError && e.code === "content_filter") {
              fetchSummary(text, query, targetLang)
                .then(handleSuccess)
                .catch(handleError);
              return;
            }
            handleError(e);
          });
      } else {
        // No primary available (edge case / retry after failure) → fresh call.
        fetchSummary(text, query, targetLang).then(handleSuccess).catch(handleError);
      }
    },
    [text, query, primaryLanguage, t],
  );

  // ── Switch to another language (translate from primary, never re-summarise) ──
  useEffect(() => {
    if (summaryStatus === "idle" || summaryStatus === "loading") return;
    produceSummaryInLanguage(language, /* useCache */ true);
    // We intentionally only react to `language` changes; `text`/`query` resets
    // happen in the effect above which also clears `summaryCacheRef`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  /** Manually re-fetch the current language (skips cache). */
  const retrySummary = useCallback(() => {
    summaryCacheRef.current.delete(language);
    produceSummaryInLanguage(language, /* useCache */ false);
  }, [language, produceSummaryInLanguage]);

  // ── Play / stop the cached audio ─────────────────────────────────────────
  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    audioRef.current = null;
    setPlaybackStatus("idle");
  }, []);

  /**
   * Play the summary in the current `language` at the current `speed`.
   *
   * Audio bytes are loaded once per (message, language, exact summary text):
   * in-memory blob URLs first, then the Cache API (survives refresh), then
   * `/api/v1/tts/synthesize`. Playback speed is always via `playbackRate` at
   * 1.0× from the server.
   */
  const play = useCallback(async () => {
    if (summaryStatus !== "ready" || !summary) return;
    setPlaybackError(null);
    const gen = generationRef.current;

    const messageFp = fingerprintTextAndQuery(text, query);
    const summaryFp = fingerprintTextAndQuery(summary, "");
    const blobCacheKey = buildConceptTtsCacheKey(messageFp, language, summaryFp);

    try {
      let url = audioCacheRef.current.get(blobCacheKey);
      if (!url) {
        const diskBlob = await getCachedTtsBlob(blobCacheKey);
        if (generationRef.current !== gen) return;
        if (diskBlob) {
          url = URL.createObjectURL(diskBlob);
          audioCacheRef.current.set(blobCacheKey, url);
        }
      }
      if (!url) {
        setPlaybackStatus("loading");
        const { url: freshUrl, blob } = await fetchTtsAudioAndBlob(summary, language, 1.0);
        if (generationRef.current !== gen) {
          URL.revokeObjectURL(freshUrl);
          return;
        }
        url = freshUrl;
        audioCacheRef.current.set(blobCacheKey, url);
        void putCachedTtsBlob(blobCacheKey, blob);
      }

      const audio = new Audio(url);
      audio.playbackRate = speed;
      // `preservesPitch` keeps the voice natural at non-1× rates (Chrome/Firefox/Safari).
      type PitchAudio = HTMLAudioElement & {
        preservesPitch?: boolean;
        mozPreservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      const pa = audio as PitchAudio;
      pa.preservesPitch = true;
      pa.mozPreservesPitch = true;
      pa.webkitPreservesPitch = true;

      audioRef.current = audio;
      setPlaybackStatus("playing");
      audio.onended = () => {
        if (generationRef.current === gen) {
          setPlaybackStatus("idle");
          audioRef.current = null;
        }
      };
      audio.onerror = () => {
        if (generationRef.current === gen) {
          setPlaybackStatus("error");
          setPlaybackError("Playback failed");
        }
      };
      await audio.play();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Audio unavailable";
      setPlaybackError(msg);
      setPlaybackStatus("error");
    }
  }, [summaryStatus, summary, language, speed, text, query]);

  /**
   * Change the speed. If audio is currently playing, apply it live so the user
   * hears the change instantly. New plays will use the updated value.
   */
  const handleSpeedChange = useCallback((newSpeed: PlaybackSpeed) => {
    setSpeed(newSpeed);
    const a = audioRef.current;
    if (a) a.playbackRate = newSpeed;
  }, []);

  /** Step current speed by one preset (used by the `−` / `+` buttons in the panel). */
  const nudgeSpeed = useCallback(
    (direction: -1 | 1) => {
      const idx = PLAYBACK_SPEEDS.indexOf(speed);
      const next = Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, idx + direction));
      handleSpeedChange(PLAYBACK_SPEEDS[next]);
    },
    [speed, handleSpeedChange],
  );

  /** Close the speed popover on outside click / Escape. */
  useEffect(() => {
    if (!speedPanelOpen) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node | null;
      if (
        speedPanelRef.current &&
        !speedPanelRef.current.contains(t) &&
        speedTriggerRef.current &&
        !speedTriggerRef.current.contains(t)
      ) {
        setSpeedPanelOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSpeedPanelOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer, { passive: true });
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [speedPanelOpen]);

  /**
   * Manual language override. Stops current playback. Audio for each language is
   * cached separately (memory + disk); switching back replays without synthesizing again.
   */
  const handleLanguageChange = useCallback(
    (next: SummaryLang) => {
      if (forceLanguage) return; // parent forces the language; user can't override
      if (next === language) return;
      audioRef.current?.pause();
      audioRef.current = null;
      setPlaybackStatus("idle");
      setUserLanguage(next);
    },
    [forceLanguage, language],
  );

  // Hide entirely when there's no text worth summarizing.
  if (!text || text.length < 20) return null;

  const isLoading = summaryStatus === "loading";
  const isReady = summaryStatus === "ready";
  const isError = summaryStatus === "error";
  const isPlaying = playbackStatus === "playing";
  const isLoadingAudio = playbackStatus === "loading";

  const accent =
    language === "hi"
      ? "from-orange-500/10 via-amber-500/10 to-yellow-500/10 border-orange-200 dark:border-orange-500/30"
      : "from-indigo-500/10 via-blue-500/10 to-sky-500/10 border-indigo-200 dark:border-indigo-500/30";

  const dotColor =
    language === "hi" ? "rgb(249 115 22)" /* orange-500 */ : "rgb(99 102 241)" /* indigo-500 */;

  return (
    <div
      className={`mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 ${className}`}
      aria-live="polite"
    >
      <div
        className={`relative rounded-2xl border bg-gradient-to-br ${accent} p-4 shadow-sm`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`inline-flex items-center justify-center w-7 h-7 rounded-full ${
                language === "hi"
                  ? "bg-orange-500/15 text-orange-600 dark:text-orange-300"
                  : "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </span>
            <div className="min-w-0">
              <h4 className="text-[13px] font-semibold text-slate-700 dark:text-slate-100 leading-tight">
                {t("summary.title")}
              </h4>
            </div>
          </div>

          {/* Language toggle + Play / Stop control */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Manual language selector — hidden when parent forces a language. */}
            {!forceLanguage && (
              <div
                role="radiogroup"
                aria-label={t("summary.switch_lang")}
                className="inline-flex items-center rounded-lg border border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 p-0.5 text-[10px] font-semibold uppercase tracking-wide"
              >
                {(["en", "hi"] as SummaryLang[]).map((lang) => {
                  const active = language === lang;
                  const activeClass =
                    lang === "hi"
                      ? "bg-orange-500 text-white shadow-sm"
                      : "bg-indigo-600 text-white shadow-sm";
                  return (
                    <button
                      key={lang}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => handleLanguageChange(lang)}
                      disabled={isLoading}
                      className={`px-2 py-1 rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        active
                          ? activeClass
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      }`}
                    >
                      {lang === "hi" ? t("summary.lang_hi_short") : t("summary.lang_en_short")}
                    </button>
                  );
                })}
              </div>
            )}

            {isPlaying ? (
              <button
                type="button"
                onClick={stopAudio}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                title={t("summary.stop")}
              >
                <Square className="w-3 h-3 fill-current" />
                <span>{t("summary.stop")}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={play}
                disabled={!isReady || isLoadingAudio}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  language === "hi"
                    ? "bg-orange-500 hover:bg-orange-600 text-white border-orange-500 shadow-sm"
                    : "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-sm"
                }`}
                title={t("summary.play")}
              >
                {isLoadingAudio ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3 fill-current" />
                )}
                <span>{t("summary.play")}</span>
              </button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="text-[13px] leading-relaxed text-slate-700 dark:text-slate-200 min-h-[3.5rem]">
          {isLoading && (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 italic">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t("summary.loading")}
            </div>
          )}
          {isError && (
            <div className="flex flex-wrap items-center gap-2 text-red-500 dark:text-red-400">
              <VolumeX className="w-3.5 h-3.5 shrink-0" />
              <span className="flex-1 min-w-0">
                {summaryError || t("summary.unavailable")}
              </span>
              <button
                type="button"
                onClick={retrySummary}
                className="inline-flex items-center gap-1 rounded-full border border-red-300 dark:border-red-700/60 bg-white/70 dark:bg-red-950/40 px-2.5 py-1 text-[11px] font-medium text-red-600 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/40 transition-colors"
                aria-label={t("summary.retry")}
              >
                <RefreshCw className="w-3 h-3" />
                {t("summary.retry")}
              </button>
            </div>
          )}
          {isReady && summary && (
            <p className="whitespace-pre-wrap font-normal" lang={language}>
              {summary}
            </p>
          )}
        </div>

        {/* Playback indicators + speed control */}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 min-h-4 text-xs">
          <div className="inline-flex items-center gap-2">
            {isPlaying && (
              <span className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <span className="inline-flex gap-0.5">
                  {[0, 0.1, 0.2, 0.1, 0].map((d, i) => (
                    <span
                      key={i}
                      style={{
                        display: "inline-block",
                        width: "3px",
                        height: "4px",
                        background: dotColor,
                        borderRadius: "2px",
                        animation: "summaryWave 0.7s ease-in-out infinite alternate",
                        animationDelay: `${d}s`,
                      }}
                    />
                  ))}
                </span>
                {t("summary.speaking")}
                <style>{`@keyframes summaryWave { from { height:4px } to { height:14px } }`}</style>
              </span>
            )}
            {playbackStatus === "error" && (
              <span className="inline-flex items-center gap-1 text-red-500 dark:text-red-400">
                <VolumeX className="w-3 h-3" />
                {playbackError}
              </span>
            )}
            {!isPlaying && playbackStatus !== "error" && (
              <Volume2 className="w-3 h-3 text-slate-300 dark:text-slate-600" />
            )}
          </div>

          {/* Speed trigger: opens YouTube-style popover with slider + preset chips. */}
          {isReady && (
            <div className="relative">
              <button
                ref={speedTriggerRef}
                type="button"
                onClick={() => setSpeedPanelOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={speedPanelOpen}
                aria-label={t("summary.speed")}
                title={t("summary.speed")}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11px] font-semibold tabular-nums transition-colors ${
                  speedPanelOpen
                    ? language === "hi"
                      ? "border-orange-400 bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300"
                      : "border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                    : "border-slate-200 dark:border-slate-600 bg-white/70 dark:bg-slate-800/70 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                }`}
              >
                <Gauge className="w-3 h-3" aria-hidden />
                <span>{`${speed}×`}</span>
              </button>

              {speedPanelOpen && (
                <SpeedPanel
                  panelRef={speedPanelRef}
                  speed={speed}
                  language={language}
                  t={t}
                  onClose={() => setSpeedPanelOpen(false)}
                  onChange={handleSpeedChange}
                  onNudge={nudgeSpeed}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── YouTube-style Playback Speed Panel ────────────────────────────────────

interface SpeedPanelProps {
  panelRef: React.RefObject<HTMLDivElement | null>;
  speed: PlaybackSpeed;
  language: SummaryLang;
  t: (key: string) => string;
  onClose: () => void;
  onChange: (s: PlaybackSpeed) => void;
  onNudge: (direction: -1 | 1) => void;
}

function SpeedPanel({
  panelRef,
  speed,
  language,
  t,
  onClose,
  onChange,
  onNudge,
}: SpeedPanelProps) {
  const idx = PLAYBACK_SPEEDS.indexOf(speed);
  const accent =
    language === "hi" ? "bg-orange-500" : "bg-indigo-600";
  const accentText =
    language === "hi" ? "text-orange-600 dark:text-orange-300" : "text-indigo-600 dark:text-indigo-300";

  const sliderProgress = (idx / (PLAYBACK_SPEEDS.length - 1)) * 100;

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("summary.speed_panel_title")}
      className="absolute z-50 right-0 bottom-full mb-2 w-[14.5rem] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg ring-1 ring-slate-900/5 dark:ring-white/10 p-2.5 animate-in fade-in slide-in-from-bottom-1 duration-150"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <h5 className="text-[11px] font-semibold text-slate-700 dark:text-slate-100">
          {t("summary.speed_panel_title")}
        </h5>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("summary.stop")}
          className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Big readout */}
      <div className="text-center mb-1.5">
        <span className={`text-base font-semibold tabular-nums ${accentText}`}>
          {speed.toFixed(2)}×
        </span>
      </div>

      {/* − / slider / + */}
      <div className="flex items-center gap-2 mb-2.5">
        <button
          type="button"
          onClick={() => onNudge(-1)}
          disabled={idx === 0}
          aria-label="Decrease speed"
          className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="w-2.5 h-2.5" />
        </button>

        <div className="relative flex-1 h-4 flex items-center">
          {/* Track */}
          <div className="absolute inset-x-0 h-0.5 rounded-full bg-slate-200 dark:bg-slate-700" />
          {/* Progress */}
          <div
            className={`absolute left-0 h-0.5 rounded-full ${accent}`}
            style={{ width: `${sliderProgress}%` }}
          />
          {/* Tick marks at each preset */}
          {PLAYBACK_SPEEDS.map((_, i) => {
            const pct = (i / (PLAYBACK_SPEEDS.length - 1)) * 100;
            const reached = i <= idx;
            return (
              <span
                key={i}
                className={`absolute w-0.5 h-0.5 rounded-full -translate-x-1/2 ${
                  reached ? accent : "bg-slate-300 dark:bg-slate-600"
                }`}
                style={{ left: `${pct}%` }}
                aria-hidden
              />
            );
          })}
          {/* Range input — snaps to discrete presets */}
          <input
            type="range"
            min={0}
            max={PLAYBACK_SPEEDS.length - 1}
            step={1}
            value={idx}
            onChange={(e) => {
              const i = Number(e.target.value);
              onChange(PLAYBACK_SPEEDS[i]);
            }}
            aria-label={t("summary.speed")}
            className="absolute inset-0 w-full appearance-none bg-transparent cursor-pointer concept-speed-slider"
          />
        </div>

        <button
          type="button"
          onClick={() => onNudge(1)}
          disabled={idx === PLAYBACK_SPEEDS.length - 1}
          aria-label="Increase speed"
          className="inline-flex w-5 h-5 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Plus className="w-2.5 h-2.5" />
        </button>
      </div>

      {/* Preset chips — fixed 3-column grid so 6 presets sit as a clean 2×3. */}
      <div className="grid grid-cols-3 gap-1">
        {PLAYBACK_SPEEDS.map((s) => {
          const active = speed === s;
          const isNormal = s === 1.0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onChange(s)}
              aria-pressed={active}
              className={`inline-flex flex-col items-center justify-center px-1 py-1 rounded-md text-[10px] font-semibold tabular-nums leading-none transition-all ${
                active
                  ? `${accent} text-white shadow-sm`
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
              }`}
            >
              <span>{`${s}×`}</span>
              {isNormal && (
                <span
                  className={`text-[8px] font-medium uppercase tracking-wide mt-0.5 ${
                    active
                      ? "text-white/85"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {t("summary.normal")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Slider thumb styling — keeps thumb above tick marks and matches accent. */}
      <style>{`
        .concept-speed-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 11px;
          height: 11px;
          border-radius: 9999px;
          background: ${language === "hi" ? "rgb(249 115 22)" : "rgb(79 70 229)"};
          border: 2px solid white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.25);
          cursor: pointer;
        }
        .concept-speed-slider::-moz-range-thumb {
          width: 11px;
          height: 11px;
          border-radius: 9999px;
          background: ${language === "hi" ? "rgb(249 115 22)" : "rgb(79 70 229)"};
          border: 2px solid white;
          box-shadow: 0 1px 2px rgba(0,0,0,0.25);
          cursor: pointer;
        }
        .concept-speed-slider::-webkit-slider-runnable-track {
          background: transparent;
        }
        .concept-speed-slider::-moz-range-track {
          background: transparent;
        }
      `}</style>
    </div>
  );
}
