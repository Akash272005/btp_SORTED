"use client";

import {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  Suspense,
} from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Youtube,
  Search,
  Loader2,
  Copy,
  Check,
  AlertCircle,
  Play,
  X,
  MessageCircleQuestion,
  Send,
  Clock,
  Hash,
  Bot,
  User,
  ChevronDown,
  ChevronUp,
  Pause,
  Plus,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { apiUrl } from "@/lib/api";
import {
  VIDEO_SESSION_STORAGE_KEY,
  normalizeYtVideoId,
  ytIdsEqual,
} from "@/lib/videoSession";
import { processLatexContent } from "@/lib/latex";
import { useTranslation } from "react-i18next";

// ─── YouTube IFrame API types ─────────────────────────────────────────────────
declare global {
  interface Window {
    YT: {
      Player: new (
        elementId: string,
        options: {
          videoId?: string;
          playerVars?: Record<string, unknown>;
          events?: {
            onReady?: (e: { target: YTPlayer }) => void;
            onStateChange?: (e: { data: number }) => void;
          };
        },
      ) => YTPlayer;
      PlayerState: {
        UNSTARTED: number;
        ENDED: number;
        PLAYING: number;
        PAUSED: number;
        BUFFERING: number;
        CUED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayer {
  getCurrentTime(): number;
  getDuration(): number;
  loadVideoById(
    videoIdOrOpts: string | { videoId: string; startSeconds?: number },
  ): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  pauseVideo(): void;
  playVideo(): void;
  destroy(): void;
}

// ─── App Types ────────────────────────────────────────────────────────────────
interface TranscriptChunk {
  text: string;
  start: number;
  duration: number;
}

interface Doubt {
  id: string;
  timestamp: number;
  question: string;
  answer: string;
  loading: boolean;
}

/** Persisted doubt (no loading flag — in-flight doubts are not saved). */
interface StoredDoubt {
  id: string;
  timestamp: number;
  question: string;
  answer: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function saveVideoData(data: {
  videoId: string;
  chunks: TranscriptChunk[];
  wordCount: number;
  url: string;
  doubts?: StoredDoubt[];
  playbackPosition?: number;
}) {
  if (typeof window !== "undefined") {
    localStorage.setItem(
      VIDEO_SESSION_STORAGE_KEY,
      JSON.stringify({
        ...data,
        videoId: normalizeYtVideoId(data.videoId),
      }),
    );
  }
}

function loadVideoData(): {
  videoId: string;
  chunks: TranscriptChunk[];
  wordCount: number;
  url: string;
  doubts?: StoredDoubt[];
  playbackPosition?: number;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(VIDEO_SESSION_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

function clearVideoData() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(VIDEO_SESSION_STORAGE_KEY);
  }
}

function estimateReadTime(wordCount: number): string {
  const minutes = Math.ceil(wordCount / 200);
  return minutes <= 1 ? "< 1 min" : `~${minutes} min`;
}

function getContextWindow(
  chunks: TranscriptChunk[],
  timestamp: number,
): string {
  const windowStart = Math.max(0, timestamp - 90);
  const windowEnd = timestamp + 30;
  return chunks
    .filter((c) => c.start >= windowStart && c.start <= windowEnd)
    .map((c) => c.text)
    .join(" ");
}

/** Best-effort YouTube id from URL or bare id string (for session merge on refetch). */
function extractYoutubeVideoId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s.startsWith("http") ? s : `https://${s}`);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }
    const v = u.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const path = u.pathname.split("/").filter(Boolean);
    if (path[0] === "embed" && path[1] && /^[\w-]{11}$/.test(path[1]))
      return path[1];
    if (path[0] === "shorts" && path[1] && /^[\w-]{11}$/.test(path[1]))
      return path[1];
  } catch {
    /* noop */
  }
  return null;
}

function mergePlaybackIntoStorage(videoId: string, seconds: number) {
  if (typeof window === "undefined" || seconds < 0.5) return;
  try {
    const raw = loadVideoData();
    if (!raw || !ytIdsEqual(raw.videoId, videoId)) return;
    saveVideoData({
      ...raw,
      videoId: normalizeYtVideoId(raw.videoId),
      playbackPosition: seconds,
    });
  } catch {
    /* noop */
  }
}

// ─── Page (inner: uses search params for resume-from-history) ────────────────
function VideoLearningPageInner() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const router = useRouter();
  const resumeHandledRef = useRef(false);

  // URL + loading
  const [inputUrl, setInputUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Video data
  const [videoId, setVideoId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<TranscriptChunk[]>([]);
  const [wordCount, setWordCount] = useState(0);
  const [copied, setCopied] = useState(false);

  // Player state (0=unstarted, 1=playing, 2=paused, 3=buffering, 5=cued)
  const [playerReady, setPlayerReady] = useState(false);
  const [playerState, setPlayerState] = useState(-1);
  const [currentTime, setCurrentTime] = useState(0);
  const [pauseTimestamp, setPauseTimestamp] = useState<number | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  // Doubt panel
  const [doubtInput, setDoubtInput] = useState("");
  const [doubts, setDoubts] = useState<Doubt[]>([]);
  const [submittingDoubt, setSubmittingDoubt] = useState(false);
  const [activeUrl, setActiveUrl] = useState("");

  // Refs
  const playerRef = useRef<YTPlayer | null>(null);
  const chunkRefs = useRef<(HTMLDivElement | null)[]>([]);
  const doubtsEndRef = useRef<HTMLDivElement | null>(null);
  const doubtInputRef = useRef<HTMLTextAreaElement | null>(null);
  /** After restore / continue-from-history — seek once player is ready. */
  const pendingSeekSecondsRef = useRef<number | null>(null);

  // ── Active chunk based on current playback time ──────────────────────────
  const activeChunkIndex = useMemo(() => {
    if (!chunks.length || currentTime <= 0) return -1;
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i].start <= currentTime) return i;
    }
    return 0;
  }, [chunks, currentTime]);

  // ── Fetch transcript for an explicit URL (used by toolbar + ?resume= from history)
  const fetchTranscriptForUrl = useCallback(
    async (rawUrl: string) => {
      const url = rawUrl.trim();
      if (!url) return;

      const prevSession = loadVideoData();
      const urlVideoIdGuess = extractYoutubeVideoId(url);
      const preserveMeta =
        !!prevSession &&
        !!urlVideoIdGuess &&
        ytIdsEqual(prevSession.videoId, urlVideoIdGuess);

      setLoading(true);
      setFetchError(null);
      if (!preserveMeta) {
        setDoubts([]);
        pendingSeekSecondsRef.current = null;
        setCurrentTime(0);
        setPauseTimestamp(null);
      }

      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          /* noop */
        }
        playerRef.current = null;
        setPlayerReady(false);
      }
      setVideoId(null);
      setChunks([]);

      try {
        const res = await fetch(apiUrl("/api/v1/video/transcript"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.detail || t("video.fetch_failed"));
        }
        if (!data.success) {
          setFetchError(data.error || t("video.transcript_unavailable"));
        } else {
          const videoData = {
            videoId: data.video_id,
            chunks: data.chunks || [],
            wordCount: data.word_count || 0,
            url,
          };
          setChunks(videoData.chunks);
          setWordCount(videoData.wordCount);
          setVideoId(normalizeYtVideoId(videoData.videoId));
          setActiveUrl(videoData.url);

          if (preserveMeta && prevSession) {
            if (prevSession.doubts?.length) {
              setDoubts(
                prevSession.doubts.map((d) => ({
                  ...d,
                  loading: false,
                })),
              );
            }
            if (
              typeof prevSession.playbackPosition === "number" &&
              prevSession.playbackPosition > 0.5
            ) {
              pendingSeekSecondsRef.current = prevSession.playbackPosition;
              setCurrentTime(prevSession.playbackPosition);
              setPauseTimestamp(prevSession.playbackPosition);
            }
          }
        }
      } catch (e: unknown) {
        setFetchError(
          e instanceof Error ? e.message : t("video.fetch_failed"),
        );
      } finally {
        setLoading(false);
      }
    },
    [t],
  );

  // ── Load saved video on mount, or resume from History via ?resume= URL ───
  useEffect(() => {
    if (resumeHandledRef.current) return;

    const resume = searchParams.get("resume");
    if (resume) {
      resumeHandledRef.current = true;
      setInputUrl(resume);
      setActiveUrl(resume);
      fetchTranscriptForUrl(resume);
      router.replace("/video", { scroll: false });
      return;
    }

    const savedData = loadVideoData();
    if (savedData) {
      setVideoId(normalizeYtVideoId(savedData.videoId) || null);
      setChunks(savedData.chunks);
      setWordCount(savedData.wordCount);
      setInputUrl(savedData.url);
      setActiveUrl(savedData.url);
      if (savedData.doubts?.length) {
        setDoubts(
          savedData.doubts.map((d) => ({
            ...d,
            loading: false,
          })),
        );
      }
      if (
        typeof savedData.playbackPosition === "number" &&
        savedData.playbackPosition > 0.5
      ) {
        pendingSeekSecondsRef.current = savedData.playbackPosition;
        setCurrentTime(savedData.playbackPosition);
        setPauseTimestamp(savedData.playbackPosition);
      }
    }
  }, [searchParams, fetchTranscriptForUrl, router]);

  // Persist transcript + completed doubts; keep existing playbackPosition (updated elsewhere)
  useEffect(() => {
    if (!videoId || chunks.length === 0) return;
    const url = (activeUrl || inputUrl).trim();
    if (!url) return;

    const persistableDoubts: StoredDoubt[] = doubts
      .filter((d) => !d.loading)
      .map(({ id, timestamp, question, answer }) => ({
        id,
        timestamp,
        question,
        answer,
      }));

    const raw = loadVideoData();
    const playbackPosition =
      raw && ytIdsEqual(raw.videoId, videoId) && typeof raw.playbackPosition === "number"
        ? raw.playbackPosition
        : undefined;

    saveVideoData({
      videoId,
      chunks,
      wordCount,
      url,
      doubts: persistableDoubts,
      ...(playbackPosition !== undefined ? { playbackPosition } : {}),
    });
  }, [videoId, chunks, wordCount, activeUrl, inputUrl, doubts]);

  // ── Auto-scroll transcript to active chunk ───────────────────────────────
  useEffect(() => {
    if (activeChunkIndex >= 0 && chunkRefs.current[activeChunkIndex]) {
      chunkRefs.current[activeChunkIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeChunkIndex]);

  // ── Scroll doubts to bottom when new doubt added (but only if there are doubts) ─────────────────────────
  useEffect(() => {
    if (doubts.length > 0) {
      // Only scroll if we're in the doubt panel area, not the main page
      setTimeout(() => {
        doubtsEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "nearest", // Don't scroll the entire page, just within the container
        });
      }, 100);
    }
  }, [doubts]);

  // Save playback position periodically & when leaving the tab (without rewriting on every tick)
  useEffect(() => {
    if (!videoId || !playerReady) return;
    const tick = () => {
      const pos = playerRef.current?.getCurrentTime() ?? 0;
      mergePlaybackIntoStorage(videoId, pos);
    };
    const iv = setInterval(tick, 3000);
    const onHide = () => {
      if (document.visibilityState === "hidden") tick();
    };
    window.addEventListener("beforeunload", tick);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearInterval(iv);
      window.removeEventListener("beforeunload", tick);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [videoId, playerReady]);

  useEffect(() => {
    if (pauseTimestamp != null && videoId) {
      mergePlaybackIntoStorage(videoId, pauseTimestamp);
    }
  }, [pauseTimestamp, videoId]);

  // ── Time polling when playing ────────────────────────────────────────────
  useEffect(() => {
    if (!playerReady || playerState !== 1) return;
    const interval = setInterval(() => {
      const t = playerRef.current?.getCurrentTime() ?? 0;
      setCurrentTime(t);
    }, 500);
    return () => clearInterval(interval);
  }, [playerReady, playerState]);

  // ── Load / replace YouTube player when videoId changes ───────────────────
  useEffect(() => {
    if (!videoId) {
      if (playerRef.current) {
        try {
          playerRef.current.destroy();
        } catch {
          /* noop */
        }
        playerRef.current = null;
      }
      setPlayerReady(false);
      setCurrentTime(0);
      setPauseTimestamp(null);
      setPlayerState(-1);
      return;
    }

    const vid = normalizeYtVideoId(videoId);

    const initPlayer = () => {
      const rawPending = pendingSeekSecondsRef.current;
      const capturedStart =
        rawPending != null && rawPending >= 0.5
          ? Math.floor(rawPending)
          : undefined;
      if (capturedStart != null) {
        pendingSeekSecondsRef.current = null;
      }

      if (playerRef.current) {
        if (capturedStart != null) {
          playerRef.current.loadVideoById({
            videoId: vid,
            startSeconds: capturedStart,
          });
          setCurrentTime(capturedStart);
          setPauseTimestamp(capturedStart);
          mergePlaybackIntoStorage(vid, capturedStart);
        } else {
          playerRef.current.loadVideoById(vid);
        }
        setPlayerReady(true);
        return;
      }

      playerRef.current = new window.YT.Player("yt-player", {
        videoId: vid,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          enablejsapi: 1,
          ...(capturedStart != null ? { start: capturedStart } : {}),
        },
        events: {
          onReady: () => {
            setPlayerReady(true);
            if (capturedStart != null) {
              setCurrentTime(capturedStart);
              setPauseTimestamp(capturedStart);
              mergePlaybackIntoStorage(vid, capturedStart);
              try {
                playerRef.current?.pauseVideo();
              } catch {
                /* noop */
              }
            }
          },
          onStateChange: (e) => {
            setPlayerState(e.data);
            if (e.data === window.YT.PlayerState.PAUSED) {
              const ts = playerRef.current?.getCurrentTime() ?? 0;
              setPauseTimestamp(ts);
              setCurrentTime(ts);
            }
          },
        },
      });
    };

    if (typeof window !== "undefined" && window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
      if (
        !document.querySelector(
          'script[src="https://www.youtube.com/iframe_api"]',
        )
      ) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }
  }, [videoId]);

  const handleFetch = useCallback(() => {
    fetchTranscriptForUrl(inputUrl);
  }, [fetchTranscriptForUrl, inputUrl]);

  // ── Clear ─────────────────────────────────────────────────────────────────
  const handleClear = () => {
    setInputUrl("");
    setVideoId(null);
    setChunks([]);
    setWordCount(0);
    setFetchError(null);
    setDoubts([]);
    setPauseTimestamp(null);
    setActiveUrl("");
    pendingSeekSecondsRef.current = null;
    clearVideoData();
  };

  // ── Copy full transcript ──────────────────────────────────────────────────
  const handleCopy = () => {
    const text = chunks.map((c) => c.text).join(" ");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Seek player to timestamp ──────────────────────────────────────────────
  const handleSeek = (seconds: number) => {
    if (playerRef.current && playerReady) {
      playerRef.current.seekTo(seconds, true);
      playerRef.current.playVideo();
    }
  };

  // ── Submit a doubt ────────────────────────────────────────────────────────
  const handleAskDoubt = useCallback(async () => {
    const question = doubtInput.trim();
    if (!question || submittingDoubt) return;

    const timestamp = pauseTimestamp ?? currentTime;
    const contextText = getContextWindow(chunks, timestamp);
    const doubtId = `${Date.now()}`;

    const newDoubt: Doubt = {
      id: doubtId,
      timestamp,
      question,
      answer: "",
      loading: true,
    };

    setDoubts((prev) => [...prev, newDoubt]);
    setDoubtInput("");
    setSubmittingDoubt(true);

    try {
      const res = await fetch(apiUrl("/api/v1/video/ask"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          timestamp,
          context_text: contextText || chunks.slice(0, 20).map((c) => c.text).join(" "),
          video_url: activeUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed to get answer");

      setDoubts((prev) =>
        prev.map((d) =>
          d.id === doubtId
            ? { ...d, answer: data.answer, loading: false }
            : d,
        ),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to answer doubt";
      setDoubts((prev) =>
        prev.map((d) =>
          d.id === doubtId
            ? { ...d, answer: `❌ ${msg}`, loading: false }
            : d,
        ),
      );
    } finally {
      setSubmittingDoubt(false);
    }
  }, [doubtInput, submittingDoubt, pauseTimestamp, currentTime, chunks, activeUrl]);

  const hasVideo = !!videoId && chunks.length > 0;

  // ─── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="h-screen flex flex-col bg-slate-50 dark:bg-slate-900 overflow-hidden animate-fade-in">

      {/* ── Top URL Bar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2 max-w-5xl mx-auto">
          {/* Icon + Title (hidden when video loaded to save space) */}
          {!hasVideo && (
            <div className="flex items-center gap-2 mr-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                <Youtube className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100 whitespace-nowrap hidden sm:block">
                {t("video.title")}
              </span>
            </div>
          )}

          {/* URL input */}
          <div className="flex-1 relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
              <Youtube className="w-3.5 h-3.5 text-red-500" />
              <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-600" />
            </div>
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFetch()}
              placeholder={t("video.placeholder")}
              className="w-full pl-10 pr-8 py-2.5 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-400 transition-all text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500"
            />
            {inputUrl && (
              <button
                onClick={handleClear}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleFetch}
              disabled={loading || !inputUrl.trim()}
              className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-all shadow-sm shadow-red-500/20 active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">
                {loading ? t("video.loading") : t("video.fetch_btn")}
              </span>
            </button>

            {/* New button - only show when video is loaded */}
            {hasVideo && (
              <button
                onClick={handleClear}
                className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 bg-white dark:bg-slate-700 hover:bg-red-50 dark:hover:bg-red-900/20 border border-slate-200 dark:border-slate-600 hover:border-red-300 dark:hover:border-red-600 rounded-xl transition-all shadow-sm"
                title={t("New Video")}
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("New")}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Error Banner ─────────────────────────────────────────────────── */}
      {fetchError && (
        <div className="shrink-0 mx-4 mt-3 flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 rounded-xl text-sm text-red-700 dark:text-red-300 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────────────────── */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-red-500" />
            <p className="text-sm">{t("video.loading_transcript")}</p>
          </div>
        </div>
      )}

      {/* ── Empty State ──────────────────────────────────────────────────── */}
      {!loading && !hasVideo && !fetchError && (
        <div className="flex-1 flex flex-col items-center justify-center pb-10 text-center px-4">
          <div className="w-20 h-20 bg-red-50 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mb-5 shadow-sm">
            <Play className="w-9 h-9 text-red-500 dark:text-red-400" />
          </div>
          <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200 mb-2">
            {t("video.empty_title")}
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
            {t("video.empty_desc")}
          </p>
        </div>
      )}

      {/* ── Main Split Layout (once video is loaded) ─────────────────────── */}
      {hasVideo && !loading && (
        <div className="flex-1 flex overflow-hidden min-h-0 max-h-full">

          {/* ── LEFT PANEL: Player + Transcript ──────────────────────────── */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden border-r border-slate-200 dark:border-slate-700 h-full max-h-full">

            {/* YouTube Player */}
            <div className="shrink-0 bg-black">
              <div className="aspect-video w-full">
                <div id="yt-player" className="w-full h-full" />
              </div>
            </div>

            {/* Stats + controls bar */}
            <div className="shrink-0 flex items-center gap-3 px-3 py-2 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 text-xs">
              {/* Playback time */}
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                {playerState === 1 ? (
                  <Play className="w-3 h-3 text-green-500" />
                ) : playerState === 2 ? (
                  <Pause className="w-3 h-3 text-amber-500" />
                ) : (
                  <Clock className="w-3 h-3" />
                )}
                <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                  {formatTime(currentTime)}
                </span>
              </div>
              <div className="h-3 w-px bg-slate-200 dark:bg-slate-600" />
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                <Hash className="w-3 h-3 text-indigo-400" />
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {wordCount.toLocaleString()}
                </span>{" "}
                {t("video.words")} · {estimateReadTime(wordCount)}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={handleCopy}
                  className="flex items-center gap-1 px-2 py-1 text-slate-500 dark:text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors"
                  title={t("video.copy_transcript")}
                >
                  {copied ? (
                    <Check className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                  <span className="hidden sm:inline">{copied ? t("video.copied") : t("video.copy_transcript")}</span>
                </button>
                <button
                  onClick={() => setShowTranscript((v) => !v)}
                  className="flex items-center gap-1 px-2 py-1 text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors"
                >
                  {showTranscript ? (
                    <ChevronUp className="w-3 h-3" />
                  ) : (
                    <ChevronDown className="w-3 h-3" />
                  )}
                  <span className="hidden sm:inline text-xs">
                    {showTranscript ? t("video.hide_transcript") : t("video.show_transcript")}
                  </span>
                </button>
              </div>
            </div>

            {/* Transcript panel */}
            {showTranscript && (
              <div className="flex-1 overflow-y-auto p-3 space-y-0.5 bg-slate-50/50 dark:bg-slate-900/30 min-h-0">
                {chunks.map((chunk, i) => {
                  const isActive = i === activeChunkIndex;
                  return (
                    <div
                      key={i}
                      ref={(el) => {
                        chunkRefs.current[i] = el;
                      }}
                      onClick={() => handleSeek(chunk.start)}
                      className={`group flex gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${isActive
                          ? "bg-red-50 dark:bg-red-900/20 border border-red-200/60 dark:border-red-800/40"
                          : "hover:bg-white dark:hover:bg-slate-800"
                        }`}
                    >
                      <span
                        className={`shrink-0 text-[10px] font-mono mt-0.5 transition-colors ${isActive
                            ? "text-red-500 dark:text-red-400 font-semibold"
                            : "text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300"
                          }`}
                      >
                        {formatTime(chunk.start)}
                      </span>
                      <p
                        className={`text-xs leading-relaxed transition-colors ${isActive
                            ? "text-slate-800 dark:text-slate-100 font-medium"
                            : "text-slate-600 dark:text-slate-400"
                          }`}
                      >
                        {chunk.text}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── RIGHT PANEL: Doubt Solver ─────────────────────────────────── */}
          <div className="w-[380px] shrink-0 flex flex-col bg-white dark:bg-slate-800 overflow-hidden h-full max-h-full">

            {/* Header */}
            <div className="shrink-0 px-4 py-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-indigo-50/80 to-purple-50/80 dark:from-indigo-900/20 dark:to-purple-900/20">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                  <MessageCircleQuestion className="w-4 h-4 text-white" />
                </div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                  {t("video.doubt_title")}
                </h2>
              </div>

              {/* Pause timestamp indicator */}
              {pauseTimestamp !== null && (
                <div className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200/60 dark:border-amber-800/40 rounded-lg">
                  <Pause className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="text-xs text-amber-700 dark:text-amber-300">
                    {t("video.paused_at")}{" "}
                    <span className="font-mono font-semibold">
                      {formatTime(pauseTimestamp)}
                    </span>
                  </span>
                  <button
                    onClick={() => handleSeek(pauseTimestamp)}
                    className="ml-auto text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    {t("video.go_to")}
                  </button>
                </div>
              )}
            </div>

            {/* Doubts list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 scroll-smooth">
              {doubts.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center py-12">
                  <div className="w-16 h-16 bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
                    <MessageCircleQuestion className="w-8 h-8 text-indigo-400 dark:text-indigo-300" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {t("video.doubt_empty_title")}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[180px] leading-relaxed">
                      {t("video.doubt_empty_desc")}
                    </p>
                  </div>
                </div>
              )}

              {doubts.map((doubt) => (
                <div key={doubt.id} className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                  {/* User question */}
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                      <User className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <button
                          onClick={() => handleSeek(doubt.timestamp)}
                          className="flex items-center gap-1 px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-[10px] font-mono rounded hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-colors"
                        >
                          <Clock className="w-2.5 h-2.5" />
                          {formatTime(doubt.timestamp)}
                        </button>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-700 px-3 py-2 rounded-xl rounded-tl-sm">
                        {doubt.question}
                      </p>
                    </div>
                  </div>

                  {/* AI answer */}
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center shrink-0 mt-0.5 shadow-sm shadow-indigo-500/30">
                      <Bot className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-xl rounded-tl-sm px-3 py-2.5 shadow-sm">
                      {doubt.loading ? (
                        <div className="flex items-center gap-2 text-xs text-indigo-500 dark:text-indigo-400">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                          </span>
                          {t("video.thinking")}
                        </div>
                      ) : (
                        <div className="prose prose-xs prose-slate dark:prose-invert max-w-none text-xs leading-relaxed prose-p:my-1 prose-headings:text-sm prose-headings:font-semibold prose-ul:my-1 prose-li:my-0.5">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                          >
                            {processLatexContent(doubt.answer)}
                          </ReactMarkdown>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={doubtsEndRef} />
            </div>

            {/* Doubt input */}
            <div className="shrink-0 p-4 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={doubtInputRef}
                    value={doubtInput}
                    onChange={(e) => setDoubtInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleAskDoubt();
                      }
                    }}
                    onFocus={(e) => {
                      // Prevent page scrolling when textarea gets focus
                      e.preventDefault();
                    }}
                    placeholder={
                      playerState === 2
                        ? t("video.doubt_placeholder_paused")
                        : t("video.doubt_placeholder")
                    }
                    rows={2}
                    className="w-full resize-none text-sm px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 focus:bg-white dark:focus:bg-slate-600 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-700 dark:text-slate-200 shadow-sm"
                  />
                </div>
                <button
                  onClick={handleAskDoubt}
                  disabled={!doubtInput.trim() || submittingDoubt}
                  className="shrink-0 self-end w-11 h-11 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-2xl flex items-center justify-center transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-95"
                >
                  {submittingDoubt ? (
                    <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  ) : (
                    <Send className="w-4.5 h-4.5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      {!hasVideo && (
        <div className="shrink-0 text-center text-[10px] text-slate-400 dark:text-slate-500 pb-2">
          {t("bixy_AiTutor can make mistakes. Please verify important information.")}
        </div>
      )}
    </div>
  );
}

function VideoLearningPageContent() {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <div className="h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900 text-slate-500 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-red-500" />
          <p className="text-sm">{t("Loading")}...</p>
        </div>
      }
    >
      <VideoLearningPageInner />
    </Suspense>
  );
}


export default function VideoLearningPage() {
  return (
    <Suspense fallback={null}>
      <VideoLearningPageContent />
    </Suspense>
  );
}
