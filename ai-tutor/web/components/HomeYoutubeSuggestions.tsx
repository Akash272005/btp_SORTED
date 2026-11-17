"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { apiUrl } from "@/lib/api";

type HomeYoutubeApiVideo = {
  video_id: string;
  title: string;
  channel_title: string;
  thumbnail_url: string;
  watch_url: string;
  duration?: string | null;
};

type HomeYoutubePayload = {
  videos: HomeYoutubeApiVideo[];
  suggested_prompts?: string[];
  fallback: boolean;
};

/** Bumps when API shape or ranking strategy changes (avoids stale client cache). */
const HOME_YT_CACHE_VERSION = "v13-video-prompt-chips";

const responseCache = new Map<string, HomeYoutubePayload>();

/**
 * Related YouTube picks for the inferred topic — Home chat only (fetched lazily).
 */
export function HomeYoutubeSuggestions({
  topicQuery,
  uiLanguage,
  onPickPrompt,
}: {
  topicQuery: string;
  uiLanguage: string;
  onPickPrompt?: (prompt: string) => void;
}) {
  const { t } = useTranslation();

  const cacheKey = useMemo(() => {
    const raw = topicQuery.trim();
    if (raw.length < 2) return "";
    const lang = (uiLanguage || "en").toLowerCase().startsWith("hi") ? "hi" : "en";
    return `${HOME_YT_CACHE_VERSION}::${lang}::${raw.toLowerCase()}`;
  }, [topicQuery, uiLanguage]);

  const langParam = useMemo(() => {
    return (uiLanguage || "en").toLowerCase().startsWith("hi") ? "hi" : "en";
  }, [uiLanguage]);

  const [payload, setPayload] = useState<HomeYoutubePayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!cacheKey) {
      setPayload(null);
      setLoading(false);
      setFailed(false);
      return;
    }

    const cached = responseCache.get(cacheKey);
    if (cached) {
      setPayload({
        videos: cached.videos ?? [],
        suggested_prompts: cached.suggested_prompts ?? [],
        fallback: !!cached.fallback,
      });
      setLoading(false);
      setFailed(false);
      return;
    }

    setPayload(null);
    setFailed(false);
    setLoading(true);

    const ac = new AbortController();

    (async () => {
      try {
        const res = await fetch(apiUrl("/api/v1/content/youtube-home"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: topicQuery.trim(),
            language: langParam,
            max_results: 3,
          }),
          signal: ac.signal,
        });
        if (!res.ok) {
          throw new Error(`youtube-home ${res.status}`);
        }
        const data = (await res.json()) as HomeYoutubePayload;
        responseCache.set(cacheKey, {
          videos: data.videos ?? [],
          suggested_prompts: data.suggested_prompts ?? [],
          fallback: !!data.fallback,
        });
        setPayload({
          videos: data.videos ?? [],
          suggested_prompts: data.suggested_prompts ?? [],
          fallback: !!data.fallback,
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setFailed(true);
      } finally {
        if (!ac.signal.aborted) setLoading(false);
      }
    })();

    return () => ac.abort();
  }, [cacheKey, topicQuery, langParam]);

  if (!cacheKey) return null;

  if (loading && !payload) {
    return (
      <div className="mt-6 rounded-2xl border border-rose-200/70 dark:border-rose-900/40 bg-rose-50/30 dark:bg-slate-900/40 px-4 py-4">
        <div className="flex items-center gap-2 text-[13px] text-rose-800/90 dark:text-rose-200/90">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>{t("home.youtube.loading")}</span>
        </div>
      </div>
    );
  }

  if (failed && (!payload || !payload.videos?.length)) {
    return null;
  }

  const rawVideos = payload?.videos ?? [];
  const playable = rawVideos.filter(
    (v) => typeof v.video_id === "string" && v.video_id.trim().length > 0,
  );
  const videos =
    playable.length > 0 ? playable.slice(0, 3) : rawVideos.slice(0, 1);
  const showFallbackHint = !!(payload?.fallback && playable.length === 0);
  const promptSuggestions = (payload?.suggested_prompts ?? [])
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 4);

  if (!videos.length) return null;

  return (
    <div className="mt-6 rounded-2xl border border-rose-200/70 dark:border-rose-900/40 bg-rose-50/25 dark:bg-slate-900/35 px-4 py-4 space-y-4">
      <div>
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
            {t("home.youtube.relatedTitle")}
          </p>
          {showFallbackHint && (
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {t("home.youtube.curatedNote")}
            </span>
          )}
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory scrollbar-thin">
          {videos.map((v, i) => (
            <a
              key={v.video_id || `${i}`}
              href={v.watch_url}
              target="_blank"
              rel="noopener noreferrer"
              className="snap-start shrink-0 w-[11.5rem] sm:w-[12.5rem] rounded-xl overflow-hidden border border-rose-200/85 dark:border-rose-900/45 bg-white dark:bg-slate-950 shadow-sm hover:shadow-md hover:border-rose-300 dark:hover:border-rose-700 transition-all group"
            >
              <div className="relative aspect-video bg-slate-900">
                {v.thumbnail_url ? (
                  <img
                    src={v.thumbnail_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 bg-gradient-to-br from-rose-500/40 to-indigo-600/40" />
                )}
                {v.duration ? (
                  <span className="absolute bottom-1.5 right-1.5 rounded bg-black/70 text-white text-[10px] font-medium px-1.5 py-0.5">
                    {v.duration}
                  </span>
                ) : null}
              </div>
              <div className="px-2.5 py-2 space-y-1">
                <p className="text-[11.5px] font-medium text-slate-900 dark:text-slate-50 line-clamp-2 leading-snug">
                  {v.title}
                </p>
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 min-w-0">
                    {v.channel_title}
                  </p>
                  <ExternalLink
                    className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400 mt-0.5 opacity-70"
                    aria-hidden
                  />
                </div>
              </div>
            </a>
          ))}
        </div>
        {playable.length === 0 ? (
          <p className="sr-only">{t("home.youtube.opensYoutube")}</p>
        ) : null}
        {promptSuggestions.length > 0 ? (
          <div className="mt-4 border-t border-rose-100/80 dark:border-rose-900/40 pt-3">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("home.youtube.promptSuggestionsTitle")}
            </p>
            <div className="flex flex-wrap gap-2">
              {promptSuggestions.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => onPickPrompt?.(prompt)}
                  className="rounded-full border border-rose-200/90 bg-white/85 px-3 py-1.5 text-left text-[11px] font-medium text-slate-700 shadow-sm transition-colors hover:border-rose-300 hover:bg-rose-50 dark:border-rose-900/50 dark:bg-slate-950/70 dark:text-slate-200 dark:hover:border-rose-700 dark:hover:bg-rose-950/30"
                  aria-label={t("home.youtube.usePromptSuggestion", { prompt })}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
