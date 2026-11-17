"use client";

import { ExternalLink, Play, Youtube, BookOpen } from "lucide-react";

export interface VideoResultData {
  video_id: string;
  title: string;
  description: string;
  channel_title: string;
  thumbnail_url: string;
  embed_url: string;
  watch_url: string;
  source: "nptel" | "youtube";
  duration?: string;
  language?: string;
  tags?: string[];
}

interface VideoResultCardProps {
  video: VideoResultData;
  compact?: boolean;
}

export default function VideoResultCard({ video, compact = false }: VideoResultCardProps) {
  const isNPTEL = video.source === "nptel";
  const hasEmbed = !!video.embed_url && !!video.video_id;

  const accentColor = isNPTEL
    ? "border-orange-200 dark:border-orange-800"
    : "border-red-200 dark:border-red-900";

  const badgeColor = isNPTEL
    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300"
    : "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";

  const icon = isNPTEL ? (
    <BookOpen className="w-2.5 h-2.5" />
  ) : (
    <Youtube className="w-2.5 h-2.5" />
  );

  return (
    <div
      className={`rounded-xl border bg-white dark:bg-slate-800 shadow-sm overflow-hidden ${accentColor} ${
        compact ? "text-xs" : "text-sm"
      }`}
    >
      {/* Video Embed or Thumbnail */}
      {hasEmbed && !compact ? (
        <div className="w-full aspect-video bg-black">
          <iframe
            src={video.embed_url}
            title={video.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="w-full h-full"
            loading="lazy"
          />
        </div>
      ) : video.thumbnail_url ? (
        <div className="relative w-full aspect-video bg-slate-100 dark:bg-slate-700">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.thumbnail_url}
            alt={video.title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
          {/* Play overlay */}
          <a
            href={video.watch_url}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors group"
          >
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              <Play className="w-5 h-5 text-slate-800 fill-current ml-0.5" />
            </div>
          </a>
        </div>
      ) : null}

      {/* Card Body */}
      <div className="p-3">
        {/* Badges */}
        <div className="flex items-center gap-1.5 mb-2">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${badgeColor}`}
          >
            {icon}
            {isNPTEL ? "NPTEL" : "YouTube"}
          </span>

          {video.language && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
              {video.language === "hi" ? "🇮🇳 Hindi" : "🇬🇧 English"}
            </span>
          )}

          {video.tags?.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Title */}
        <a
          href={video.watch_url}
          target="_blank"
          rel="noreferrer"
          className="block font-semibold text-slate-800 dark:text-slate-100 hover:text-blue-600 dark:hover:text-blue-400 leading-snug mb-1 line-clamp-2"
        >
          {video.title}
        </a>

        {/* Channel */}
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
          {video.channel_title}
        </p>

        {/* Description (only when not compact) */}
        {!compact && video.description && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 line-clamp-2 mt-1">
            {video.description}
          </p>
        )}

        {/* Open Link */}
        <a
          href={video.watch_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
        >
          <ExternalLink className="w-3 h-3" />
          Watch on YouTube
        </a>
      </div>
    </div>
  );
}

/* ── Grid layout for multiple video cards ─────────────────────────────────── */

interface VideoResultsGridProps {
  videos: VideoResultData[];
  columns?: 1 | 2;
}

export function VideoResultsGrid({ videos, columns = 2 }: VideoResultsGridProps) {
  if (!videos || videos.length === 0) return null;

  return (
    <div
      className={`grid gap-3 mt-3 ${
        columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
      }`}
    >
      {videos.map((v, i) => (
        <VideoResultCard key={v.video_id || i} video={v} compact={columns === 2} />
      ))}
    </div>
  );
}
