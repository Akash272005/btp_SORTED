"use client";

import { ExternalLink } from "lucide-react";

export type ChatSourceVideoItem = {
  url: string;
  title?: string;
  snippet?: string;
  type?: string;
};

/** Parse YouTube watch / short / embed URLs into an 11-char video id when possible. */
export function extractYoutubeVideoId(url: string): string | null {
  if (!url || typeof url !== "string") return null;
  const trimmed = url.trim();
  try {
    const u = new URL(trimmed);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    if (host.endsWith("youtube.com")) {
      if (u.pathname.startsWith("/embed/")) {
        const id = u.pathname.slice("/embed/".length).split("/")[0]?.split("?")[0];
        return id && /^[\w-]{11}$/.test(id) ? id : null;
      }
      if (u.pathname.startsWith("/shorts/")) {
        const id = u.pathname.split("/")[2]?.split("?")[0];
        return id && /^[\w-]{11}$/.test(id) ? id : null;
      }
      const v = u.searchParams.get("v");
      if (v && /^[\w-]{11}$/.test(v)) return v;
    }
  } catch {
    return null;
  }
  return null;
}

interface ChatSourceVideosProps {
  videos: ChatSourceVideoItem[];
  /** Max embeds (default 5). */
  max?: number;
  className?: string;
}

/**
 * Websearch / Tavily video citations: show inline YouTube embeds instead of link-only chips.
 */
export function ChatSourceVideos({ videos, max = 5, className = "" }: ChatSourceVideosProps) {
  const list = (videos || []).slice(0, max);
  if (!list.length) return null;

  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${className}`.trim()}
    >
      {list.map((v, i) => {
        const id = extractYoutubeVideoId(v.url);
        if (id) {
          return (
            <div
              key={`yt-${id}-${i}`}
              className="rounded-xl overflow-hidden border border-rose-200/90 dark:border-rose-900/45 bg-white dark:bg-slate-900 shadow-sm"
            >
              <div className="aspect-video w-full bg-black">
                <iframe
                  src={`https://www.youtube.com/embed/${id}?rel=0`}
                  title={v.title || "YouTube video"}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  className="w-full h-full border-0"
                  loading="lazy"
                />
              </div>
              <div className="px-3 py-2.5 flex items-start justify-between gap-2 border-t border-rose-100/80 dark:border-rose-900/30 bg-rose-50/40 dark:bg-slate-800/80">
                <p className="text-xs font-medium text-slate-800 dark:text-slate-100 line-clamp-2 min-w-0">
                  {v.title || "YouTube"}
                </p>
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 p-1 rounded-md text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/40"
                  title="Open on YouTube"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          );
        }
        return (
          <a
            key={`vid-fallback-${i}`}
            href={v.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-100 text-xs border border-rose-200 dark:border-rose-900/50 hover:bg-rose-100 dark:hover:bg-rose-950/60 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate font-medium">{v.title || "Video"}</span>
          </a>
        );
      })}
    </div>
  );
}
