"use client";

/** Crop and rotate step after a photo is picked (Upload tab). */

import { useCallback, useEffect, useRef, useState } from "react";
import { Crop, Loader2, RotateCcw, RotateCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { NormalizedCropRect } from "@/lib/solverOcr";

const DEFAULT_CROP: NormalizedCropRect = { x: 0.06, y: 0.06, w: 0.88, h: 0.88 };
const MIN_CROP_FRAC = 0.06;
const HANDLE_HIT = 18;

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface SolverImageCropProps {
  imageUrl: string;
  onConfirm: (crop: NormalizedCropRect) => void;
  onUseFull: () => void;
  onRetake: () => void;
  onRotate?: (direction: "cw" | "ccw") => void;
  processing?: boolean;
}

type DisplayRect = { left: number; top: number; width: number; height: number };

type CropPixels = { left: number; top: number; right: number; bottom: number };

type DragMode =
  | { kind: "move"; startX: number; startY: number; crop: NormalizedCropRect }
  | { kind: "resize"; handle: Handle; startCrop: NormalizedCropRect }
  | { kind: "draw"; startNx: number; startNy: number };

const HANDLE_CURSORS: Record<Handle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

function getDisplayRect(
  containerW: number,
  containerH: number,
  naturalW: number,
  naturalH: number,
): DisplayRect {
  if (!containerW || !containerH || !naturalW || !naturalH) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  const scale = Math.min(containerW / naturalW, containerH / naturalH);
  const width = naturalW * scale;
  const height = naturalH * scale;
  return {
    left: (containerW - width) / 2,
    top: (containerH - height) / 2,
    width,
    height,
  };
}

function cropToPixels(crop: NormalizedCropRect, display: DisplayRect): CropPixels {
  const left = display.left + crop.x * display.width;
  const top = display.top + crop.y * display.height;
  return {
    left,
    top,
    right: left + crop.w * display.width,
    bottom: top + crop.h * display.height,
  };
}

function cropToStyle(crop: NormalizedCropRect, display: DisplayRect) {
  const px = cropToPixels(crop, display);
  return {
    left: `${px.left}px`,
    top: `${px.top}px`,
    width: `${px.right - px.left}px`,
    height: `${px.bottom - px.top}px`,
  };
}

function normalizeCrop(crop: NormalizedCropRect): NormalizedCropRect {
  const x = clamp(crop.x, 0, 1 - MIN_CROP_FRAC);
  const y = clamp(crop.y, 0, 1 - MIN_CROP_FRAC);
  const w = clamp(crop.w, MIN_CROP_FRAC, 1 - x);
  const h = clamp(crop.h, MIN_CROP_FRAC, 1 - y);
  return { x, y, w, h };
}

function applyResize(
  handle: Handle,
  nx: number,
  ny: number,
  start: NormalizedCropRect,
): NormalizedCropRect {
  let x1 = start.x;
  let y1 = start.y;
  let x2 = start.x + start.w;
  let y2 = start.y + start.h;

  if (handle.includes("w")) x1 = nx;
  if (handle.includes("e")) x2 = nx;
  if (handle.includes("n")) y1 = ny;
  if (handle.includes("s")) y2 = ny;

  return normalizeCrop({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    w: Math.max(Math.abs(x2 - x1), MIN_CROP_FRAC),
    h: Math.max(Math.abs(y2 - y1), MIN_CROP_FRAC),
  });
}

function hitTestHandle(px: number, py: number, box: CropPixels): Handle | null {
  const { left, top, right, bottom } = box;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  const corners: { handle: Handle; x: number; y: number }[] = [
    { handle: "nw", x: left, y: top },
    { handle: "ne", x: right, y: top },
    { handle: "sw", x: left, y: bottom },
    { handle: "se", x: right, y: bottom },
  ];
  for (const c of corners) {
    if (
      Math.abs(px - c.x) <= HANDLE_HIT &&
      Math.abs(py - c.y) <= HANDLE_HIT
    ) {
      return c.handle;
    }
  }

  if (
    Math.abs(py - top) <= HANDLE_HIT &&
    px >= left - HANDLE_HIT &&
    px <= right + HANDLE_HIT
  ) {
    return "n";
  }
  if (
    Math.abs(py - bottom) <= HANDLE_HIT &&
    px >= left - HANDLE_HIT &&
    px <= right + HANDLE_HIT
  ) {
    return "s";
  }
  if (
    Math.abs(px - left) <= HANDLE_HIT &&
    py >= top - HANDLE_HIT &&
    py <= bottom + HANDLE_HIT
  ) {
    return "w";
  }
  if (
    Math.abs(px - right) <= HANDLE_HIT &&
    py >= top - HANDLE_HIT &&
    py <= bottom + HANDLE_HIT
  ) {
    return "e";
  }

  return null;
}

function pointInCrop(px: number, py: number, box: CropPixels): boolean {
  return px >= box.left && px <= box.right && py >= box.top && py <= box.bottom;
}

function clientToNormalized(
  clientX: number,
  clientY: number,
  display: DisplayRect,
  containerRect: DOMRect,
): { nx: number; ny: number } {
  const px = clientX - containerRect.left;
  const py = clientY - containerRect.top;
  return {
    nx: clamp((px - display.left) / display.width, 0, 1),
    ny: clamp((py - display.top) / display.height, 0, 1),
  };
}

const HANDLE_POSITIONS: { handle: Handle; className: string }[] = [
  { handle: "nw", className: "left-0 top-0 -translate-x-1/2 -translate-y-1/2" },
  { handle: "n", className: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" },
  { handle: "ne", className: "right-0 top-0 translate-x-1/2 -translate-y-1/2" },
  { handle: "e", className: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2" },
  { handle: "se", className: "right-0 bottom-0 translate-x-1/2 translate-y-1/2" },
  { handle: "s", className: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2" },
  { handle: "sw", className: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2" },
  { handle: "w", className: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2" },
];

export default function SolverImageCrop({
  imageUrl,
  onConfirm,
  onUseFull,
  onRetake,
  onRotate,
  processing = false,
}: SolverImageCropProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [crop, setCrop] = useState<NormalizedCropRect>(DEFAULT_CROP);
  const [display, setDisplay] = useState<DisplayRect>({
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  });
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [activeHandle, setActiveHandle] = useState<Handle | null>(null);
  const dragRef = useRef<DragMode | null>(null);

  const updateLayout = useCallback(() => {
    const container = containerRef.current;
    if (!container || !natural.w || !natural.h) return;
    const rect = container.getBoundingClientRect();
    setDisplay(getDisplayRect(rect.width, rect.height, natural.w, natural.h));
  }, [natural.w, natural.h]);

  useEffect(() => {
    updateLayout();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => updateLayout());
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateLayout]);

  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (processing || !display.width) return;
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const box = cropToPixels(crop, display);
    const { nx, ny } = clientToNormalized(e.clientX, e.clientY, display, rect);

    const handle = hitTestHandle(px, py, box);
    if (handle) {
      dragRef.current = { kind: "resize", handle, startCrop: { ...crop } };
      setActiveHandle(handle);
    } else if (pointInCrop(px, py, box)) {
      dragRef.current = { kind: "move", startX: nx, startY: ny, crop: { ...crop } };
      setActiveHandle(null);
    } else {
      dragRef.current = { kind: "draw", startNx: nx, startNy: ny };
      setActiveHandle(null);
      setCrop({ x: nx, y: ny, w: MIN_CROP_FRAC, h: MIN_CROP_FRAC });
    }

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !display.width) return;
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const { nx, ny } = clientToNormalized(e.clientX, e.clientY, display, rect);

    if (drag.kind === "move") {
      const dx = nx - drag.startX;
      const dy = ny - drag.startY;
      setCrop(
        normalizeCrop({
          x: drag.crop.x + dx,
          y: drag.crop.y + dy,
          w: drag.crop.w,
          h: drag.crop.h,
        }),
      );
    } else if (drag.kind === "resize") {
      setCrop(applyResize(drag.handle, nx, ny, drag.startCrop));
    } else if (drag.kind === "draw") {
      const x1 = drag.startNx;
      const y1 = drag.startNy;
      setCrop(
        normalizeCrop({
          x: Math.min(x1, nx),
          y: Math.min(y1, ny),
          w: Math.max(Math.abs(nx - x1), MIN_CROP_FRAC),
          h: Math.max(Math.abs(ny - y1), MIN_CROP_FRAC),
        }),
      );
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    setActiveHandle(null);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const cropStyle = cropToStyle(crop, display);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4">
      <div className="text-center">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("solver.crop_title")}
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t("solver.crop_hint")}
        </p>
      </div>

      <div
        ref={containerRef}
        className="relative mx-auto h-[min(420px,55vh)] w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-slate-900/5 dark:border-slate-600 dark:bg-slate-900"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- crop source */}
        <img
          src={imageUrl}
          alt={t("solver.upload_preview_alt")}
          onLoad={onImageLoad}
          className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          draggable={false}
        />

        {display.width > 0 && (
          <div
            className="pointer-events-none absolute border-2 border-blue-500 bg-blue-500/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.45)]"
            style={cropStyle}
          >
            {HANDLE_POSITIONS.map(({ handle, className }) => (
              <div
                key={handle}
                className={`absolute h-3.5 w-3.5 rounded-sm border-2 border-white bg-blue-500 shadow ${className} ${
                  activeHandle === handle ? "scale-125 ring-2 ring-blue-300" : ""
                }`}
                style={{ cursor: HANDLE_CURSORS[handle] }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={onRetake}
          disabled={processing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {t("solver.crop_retake")}
        </button>
        {onRotate ? (
          <>
            <button
              type="button"
              onClick={() => onRotate("ccw")}
              disabled={processing}
              title={t("solver.crop_rotate_ccw")}
              aria-label={t("solver.crop_rotate_ccw")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => onRotate("cw")}
              disabled={processing}
              title={t("solver.crop_rotate_cw")}
              aria-label={t("solver.crop_rotate_cw")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <RotateCw className="h-3.5 w-3.5" />
            </button>
          </>
        ) : null}
        <button
          type="button"
          onClick={onUseFull}
          disabled={processing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {t("solver.crop_full_image")}
        </button>
        <button
          type="button"
          onClick={() => onConfirm(crop)}
          disabled={processing}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-5 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {processing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Crop className="h-3.5 w-3.5" />
          )}
          {t("solver.crop_confirm")}
        </button>
      </div>
    </div>
  );
}
