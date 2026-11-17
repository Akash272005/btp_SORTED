"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  GitBranch,
  Maximize2,
  Minimize2,
  Move,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import Mermaid from "@/components/Mermaid";
import { extractMermaidLabels } from "@/lib/mermaidUtils";

type Props = {
  chart: string;
  title?: string;
  titleFallback: string;
  /** Tighter layout for student chapter chat */
  compact?: boolean;
  onRenderResult?: (success: boolean) => void;
};

const MIN_SCALE = 0.35;
const MAX_SCALE = 2.5;

export function ChatDiagramCanvas({
  chart,
  title,
  titleFallback,
  compact = false,
  onRenderResult,
}: Props) {
  const { t } = useTranslation();
  const trimmed = (chart || "").trim();
  const [visible, setVisible] = useState(true);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [fullscreen, setFullscreen] = useState(false);
  const [studyOpen, setStudyOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, ox: 0, oy: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  const labels = extractMermaidLabels(trimmed);
  const heading = (title || "").trim() ? title! : titleFallback;

  const resetView = useCallback(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  const handleRenderResult = useCallback(
    (ok: boolean) => {
      if (!ok) setVisible(false);
      onRenderResult?.(ok);
    },
    [onRenderResult],
  );

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [fullscreen]);

  if (!trimmed || !visible) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      ox: offset.x,
      oy: offset.y,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    setOffset({
      x: dragStart.current.ox + (e.clientX - dragStart.current.x),
      y: dragStart.current.oy + (e.clientY - dragStart.current.y),
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    setDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta)));
  };

  const viewportH = fullscreen
    ? "min-h-[70vh]"
    : compact
      ? "min-h-[180px] max-h-[280px]"
      : "min-h-[220px] max-h-[360px]";

  const shell = (
    <div
      className={`rounded-2xl border border-indigo-200/80 bg-gradient-to-b from-indigo-50/50 to-white dark:from-indigo-950/30 dark:to-slate-900 dark:border-indigo-500/25 overflow-hidden ${
        fullscreen ? "h-full flex flex-col" : "mt-4"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/80 bg-white/80 px-3 py-2 dark:border-indigo-500/20 dark:bg-slate-900/80">
        <p className="font-semibold text-sm text-slate-700 dark:text-slate-200 flex items-center gap-2 min-w-0">
          <GitBranch className="w-4 h-4 text-indigo-500 shrink-0" />
          <span className="truncate">{heading}</span>
        </p>
        <div className="flex flex-wrap items-center gap-1">
          {labels.length > 0 && (
            <button
              type="button"
              onClick={() => setStudyOpen((o) => !o)}
              className={`rounded-lg px-2 py-1 text-[11px] font-medium transition ${
                studyOpen
                  ? "bg-indigo-600 text-white"
                  : "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/50 dark:text-indigo-200"
              }`}
            >
              {t("chat.canvas.study")}
            </button>
          )}
          <button
            type="button"
            title={t("chat.canvas.zoomOut")}
            onClick={() =>
              setScale((s) => Math.max(MIN_SCALE, s - 0.15))
            }
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={t("chat.canvas.zoomIn")}
            onClick={() =>
              setScale((s) => Math.min(MAX_SCALE, s + 0.15))
            }
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={t("chat.canvas.reset")}
            onClick={resetView}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            title={
              fullscreen
                ? t("chat.canvas.exitFullscreen")
                : t("chat.canvas.fullscreen")
            }
            onClick={() => setFullscreen((f) => !f)}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {fullscreen ? (
              <Minimize2 className="h-4 w-4" />
            ) : (
              <Maximize2 className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      {studyOpen && labels.length > 0 && (
        <div className="border-b border-indigo-100/60 bg-indigo-50/40 px-3 py-2 dark:border-indigo-500/15 dark:bg-indigo-950/20">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-400 mb-1.5">
            {t("chat.canvas.concepts")}
          </p>
          <ol className="grid gap-1 sm:grid-cols-2">
            {labels.map((label, i) => (
              <li
                key={`${label}-${i}`}
                className="flex gap-2 text-xs text-slate-700 dark:text-slate-200"
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[10px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 leading-snug pt-0.5">{label}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <div
        ref={viewportRef}
        className={`relative ${viewportH} overflow-hidden cursor-grab active:cursor-grabbing bg-slate-50/80 dark:bg-slate-950/50`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-[10px] text-slate-500 shadow-sm dark:bg-slate-900/90 dark:text-slate-400">
          <Move className="h-3 w-3" />
          {t("chat.canvas.dragHint")}
        </div>
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center center",
            transition: dragging ? "none" : "transform 0.05s ease-out",
          }}
        >
          <div className="pointer-events-none min-w-0 p-4">
            <Mermaid
              chart={trimmed}
              className="my-0 [&_svg]:max-w-none"
              onRenderResult={handleRenderResult}
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (fullscreen) {
    return (
      <div
        className="fixed inset-0 z-[25000] flex flex-col bg-slate-900/40 p-3 sm:p-6 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-label={heading}
      >
        <div className="mx-auto flex h-full w-full max-w-5xl flex-col rounded-2xl shadow-2xl">
          {shell}
        </div>
      </div>
    );
  }

  return shell;
}
