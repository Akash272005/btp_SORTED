"use client";

import { useState, useRef, useEffect } from "react";
import { Volume2, VolumeX, Loader2, Square } from "lucide-react";
import { apiUrl } from "@/lib/api";
import TalkingAvatar from "./TalkingAvatar";
import { useTranslation } from "react-i18next";

interface AvatarNarratorProps {
  text: string;
  language?: "en" | "hi";
  className?: string;
}

type NarratorState = "idle" | "loading" | "playing" | "error";

/** Match backend `MAX_TTS_CHARS` in `tts_router.py` (leave small headroom). */
const MAX_TTS_CHARS = 3900;

function stripForSpeech(raw: string): string {
  return raw
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}[\s\S]*?`{1,3}/g, "")
    .replace(/#+\s*/g, "")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/[-*•]\s+/g, ". ")
    .replace(/\n+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Split long cleaned text into chunks at sentence boundaries for multiple TTS calls. */
function splitIntoTtsChunks(clean: string, maxChunk = MAX_TTS_CHARS): string[] {
  if (!clean) return [];
  if (clean.length <= maxChunk) return [clean];

  const chunks: string[] = [];
  let pos = 0;
  while (pos < clean.length) {
    const end = Math.min(pos + maxChunk, clean.length);
    if (end >= clean.length) {
      const tail = clean.slice(pos).trim();
      if (tail) chunks.push(tail);
      break;
    }
    let slice = clean.slice(pos, end);
    const lastPeriod = slice.lastIndexOf(".");
    const lastQ = slice.lastIndexOf("?");
    const lastBang = slice.lastIndexOf("!");
    const lastBreak = Math.max(lastPeriod, lastQ, lastBang);
    const take =
      lastBreak > Math.floor(maxChunk * 0.55) ? lastBreak + 1 : slice.length;
    const piece = clean.slice(pos, pos + take).trim();
    if (piece) chunks.push(piece);
    pos += take;
    while (pos < clean.length && /\s/.test(clean[pos])) pos += 1;
  }
  return chunks.filter((c) => c.length > 0);
}

async function fetchAudioBlob(text: string, lang: "en" | "hi"): Promise<string> {
  const res = await fetch(apiUrl("/api/v1/tts/synthesize"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, language: lang, speed: 1.1 }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `TTS error ${res.status}`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export default function AvatarNarrator({
  text,
  language = "en",
  className = "",
}: AvatarNarratorProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<NarratorState>("idle");
  const [activeLang, setActiveLang] = useState<"en" | "hi">(language);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chunkInfo, setChunkInfo] = useState<string | null>(null);
  /** Bump after TTS / .env changes to drop cached MP3 blobs and re-fetch from server. */
  const [ttsCacheNonce, setTtsCacheNonce] = useState(0);

  // Cache blob URLs per language for this `text` (invalidated when text changes)
  const cacheRef = useRef<Partial<Record<"en" | "hi", string[]>>>({});
  const loadingRef = useRef<Partial<Record<"en" | "hi", Promise<string[]>>>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /** Increment to cancel in-flight chunk playback / stale prefetch. */
  const playbackGenerationRef = useRef(0);

  const revokeUrls = (urls: string[] | undefined) => {
    (urls || []).forEach((u) => {
      if (u) URL.revokeObjectURL(u);
    });
  };

  // Pre-fetch English audio for all chunks on mount / text change
  useEffect(() => {
    playbackGenerationRef.current += 1;
    revokeUrls(cacheRef.current.en);
    revokeUrls(cacheRef.current.hi);
    cacheRef.current = {};
    loadingRef.current = {};

    if (!text || text.length < 10) return;

    const cleaned = stripForSpeech(text);
    const chunks = splitIntoTtsChunks(cleaned);
    if (!chunks.length) return;

    const gen = playbackGenerationRef.current;

    const prefetch = async (lang: "en" | "hi"): Promise<string[]> => {
      const urls: string[] = [];
      for (const chunk of chunks) {
        if (playbackGenerationRef.current !== gen) break;
        urls.push(await fetchAudioBlob(chunk, lang));
      }
      return urls;
    };

    if (!loadingRef.current.en) {
      const p = prefetch("en")
        .then((urls) => {
          if (playbackGenerationRef.current === gen && urls.length) {
            cacheRef.current.en = urls;
          }
          return urls;
        })
        .catch(() => [] as string[]);
      loadingRef.current.en = p as Promise<string[]>;
    }

    return () => {
      playbackGenerationRef.current += 1;
      revokeUrls(cacheRef.current.en);
      revokeUrls(cacheRef.current.hi);
      cacheRef.current = {};
      audioRef.current?.pause();
    };
  }, [text, ttsCacheNonce]);

  const stopAudio = () => {
    playbackGenerationRef.current += 1;
    audioRef.current?.pause();
    if (audioRef.current) audioRef.current.currentTime = 0;
    audioRef.current = null;
    setState("idle");
    setChunkInfo(null);
  };

  const playUrlQueue = async (urls: string[], generation: number) => {
    for (let i = 0; i < urls.length; i += 1) {
      if (playbackGenerationRef.current !== generation) break;
      if (urls.length > 1) {
        setChunkInfo(`${i + 1} / ${urls.length}`);
      } else {
        setChunkInfo(null);
      }
      const url = urls[i];
      await new Promise<void>((resolve, reject) => {
        if (playbackGenerationRef.current !== generation) {
          resolve();
          return;
        }
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => resolve();
        audio.onerror = () => reject(new Error("Playback failed"));
        audio.play().catch(reject);
      });
    }
    if (playbackGenerationRef.current === generation) {
      setChunkInfo(null);
      setState("idle");
      audioRef.current = null;
    }
  };

  const narrate = async (lang: "en" | "hi") => {
    playbackGenerationRef.current += 1;
    const generation = playbackGenerationRef.current;
    audioRef.current?.pause();
    audioRef.current = null;
    setActiveLang(lang);
    setErrorMsg(null);

    try {
      let urls = cacheRef.current[lang];

      if (urls?.length && playbackGenerationRef.current === generation) {
        setState("playing");
        await playUrlQueue(urls, generation);
        return;
      }

      setState("loading");
      if (loadingRef.current[lang]) {
        urls = await loadingRef.current[lang];
      } else {
        const cleaned = stripForSpeech(text);
        const chunks = splitIntoTtsChunks(cleaned);
        const p = (async () => {
          const out: string[] = [];
          for (const chunk of chunks) {
            if (playbackGenerationRef.current !== generation) break;
            out.push(await fetchAudioBlob(chunk, lang));
          }
          return out;
        })();
        loadingRef.current[lang] = p;
        urls = await p;
        if (playbackGenerationRef.current === generation && urls.length) {
          cacheRef.current[lang] = urls;
        }
      }

      if (playbackGenerationRef.current !== generation) return;
      if (!urls?.length) throw new Error("Audio unavailable");

      setState("playing");
      await playUrlQueue(urls, generation);

      // Pre-fetch other language in background
      const other = lang === "en" ? "hi" : "en";
      const bgGen = playbackGenerationRef.current;
      if (!cacheRef.current[other]?.length && !loadingRef.current[other]) {
        const cleaned = stripForSpeech(text);
        const chunks = splitIntoTtsChunks(cleaned);
        const p = (async () => {
          const out: string[] = [];
          for (const chunk of chunks) {
            if (playbackGenerationRef.current !== bgGen) break;
            out.push(await fetchAudioBlob(chunk, other));
          }
          return out;
        })();
        loadingRef.current[other] = p;
        p.then((u) => {
          if (u.length && playbackGenerationRef.current === bgGen) {
            cacheRef.current[other] = u;
          }
        }).catch(() => {});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "TTS unavailable";
      setState("error");
      setErrorMsg(msg);
      setChunkInfo(null);
    }
  };

  const isPlaying = state === "playing";
  const enReady = !!cacheRef.current.en?.length;

  return (
    <div className={`mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 ${className}`}>
      <div className="flex items-end gap-3">
        <TalkingAvatar isPlaying={isPlaying} size={80} />

        <div className="flex flex-col gap-2 flex-1">
          <span className="text-xs text-slate-400 dark:text-slate-500">
            🔊 {t("narrator.listen_in")}
          </span>

          <div className="flex flex-wrap gap-1.5">
            <button
              id="tts-en"
              type="button"
              title={t("narrator.english_india_hint")}
              onClick={() => (activeLang === "en" && isPlaying ? stopAudio() : narrate("en"))}
              disabled={state === "loading" && activeLang === "en"}
              className={`relative px-3 py-1.5 text-xs rounded-lg border transition-all font-medium disabled:opacity-50 ${
                activeLang === "en" && (isPlaying || state === "loading")
                  ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-blue-400"
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <span aria-hidden>🗣️</span>
                {t("narrator.english_india")}
              </span>
              {enReady && state === "idle" && (
                <span
                  className="absolute -top-1 -right-1 w-2 h-2 bg-green-400 rounded-full"
                  title={t("narrator.ready_cached")}
                />
              )}
            </button>

            <button
              id="tts-hi"
              type="button"
              onClick={() => (activeLang === "hi" && isPlaying ? stopAudio() : narrate("hi"))}
              disabled={state === "loading" && activeLang === "hi"}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-all font-medium disabled:opacity-50 ${
                activeLang === "hi" && (isPlaying || state === "loading")
                  ? "bg-orange-500 text-white border-orange-500 shadow-sm"
                  : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-orange-400"
              }`}
            >
              <span className="inline-flex items-center gap-1">
                <span aria-hidden>🇮🇳</span>
                {t("narrator.hindi")}
              </span>
            </button>

            {isPlaying && (
              <button
                type="button"
                onClick={stopAudio}
                title={t("narrator.stop")}
                className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              stopAudio();
              setTtsCacheNonce((n) => n + 1);
            }}
            className="self-start text-[10px] text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 underline decoration-dotted underline-offset-2"
            title={t("narrator.regenerate_audio_title")}
          >
            {t("narrator.regenerate_audio")}
          </button>

          <div className="flex items-center gap-1.5 min-h-4">
            {state === "loading" && (
              <span className="flex items-center gap-1 text-xs text-slate-400">
                <Loader2 className="w-3 h-3 animate-spin" />
                {t("narrator.generating_audio")}
              </span>
            )}
            {isPlaying && (
              <span className="flex flex-wrap items-center gap-2 text-xs text-blue-500">
                <span className="inline-flex gap-0.5">
                  {[0, 0.1, 0.2, 0.1, 0].map((d, i) => (
                    <span
                      key={i}
                      style={{
                        display: "inline-block",
                        width: "3px",
                        height: "4px",
                        background: activeLang === "hi" ? "rgb(249 115 22)" : "rgb(59 130 246)",
                        borderRadius: "2px",
                        animation: "ttsWave 0.7s ease-in-out infinite alternate",
                        animationDelay: `${d}s`,
                      }}
                    />
                  ))}
                </span>
                {t("narrator.speaking")}
                {chunkInfo && (
                  <span className="text-slate-400 dark:text-slate-500 font-normal">({chunkInfo})</span>
                )}
                <style>{`@keyframes ttsWave { from { height:4px } to { height:14px } }`}</style>
              </span>
            )}
            {state === "error" && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <VolumeX className="w-3 h-3" /> {errorMsg}
              </span>
            )}
            {state === "idle" && <Volume2 className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" />}
          </div>
        </div>
      </div>
    </div>
  );
}
