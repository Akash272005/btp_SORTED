"use client";

/** Whiteboard canvas for the Draw tab — strokes, shapes, draggable text labels, OCR export. */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Circle,
  Eraser,
  Loader2,
  Minus,
  Pencil,
  RotateCcw,
  Sparkles,
  Square,
  Type,
  Undo2,
} from "lucide-react";
import { useTranslation } from "react-i18next";

type DrawTool = "pen" | "eraser" | "line" | "rect" | "circle" | "text";

interface TextEditorState {
  x: number;
  y: number;
  value: string;
}

interface TextLabel {
  id: string;
  x: number;
  y: number;
  value: string;
}

interface DrawSnapshot {
  canvas: ImageData;
  labels: TextLabel[];
}

interface SolverDrawCanvasProps {
  onExport: (previewUrl: string, base64: string, caption: string) => void;
  disabled?: boolean;
  loading?: boolean;
  checkWorkMode?: boolean;
}

type Point = { x: number; y: number };

const PEN_WIDTH = 2.5;
const ERASER_WIDTH = 18;
const MAX_UNDO = 40;
const TEXT_FONT = '600 18px system-ui, -apple-system, "Segoe UI", sans-serif';
const TEXT_COLOR = "#1e3a8a";

function stripDataUrlPrefix(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  if (comma >= 0 && dataUrl.toLowerCase().startsWith("data:")) {
    return dataUrl.slice(comma + 1);
  }
  return dataUrl;
}

function cloneLabels(labels: TextLabel[]): TextLabel[] {
  return labels.map((label) => ({ ...label }));
}

function drawLabelsOnCtx(
  ctx: CanvasRenderingContext2D,
  labels: TextLabel[],
) {
  ctx.save();
  ctx.font = TEXT_FONT;
  ctx.fillStyle = TEXT_COLOR;
  ctx.textBaseline = "top";
  for (const label of labels) {
    ctx.fillText(label.value, label.x, label.y);
  }
  ctx.restore();
}

export default function SolverDrawCanvas({
  onExport,
  disabled = false,
  loading = false,
  checkWorkMode = false,
}: SolverDrawCanvasProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const undoStackRef = useRef<DrawSnapshot[]>([]);
  const previewSnapshotRef = useRef<ImageData | null>(null);
  const drawingRef = useRef(false);
  const startPointRef = useRef<Point | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);
  const skipTextBlurCommitRef = useRef(false);
  const labelDragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const [tool, setTool] = useState<DrawTool>("pen");
  const [textEditor, setTextEditor] = useState<TextEditorState | null>(null);
  const [textLabels, setTextLabels] = useState<TextLabel[]>([]);
  const [draggingLabelId, setDraggingLabelId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [canUndo, setCanUndo] = useState(false);

  const busy = disabled || loading;
  const hasContent = canUndo || textLabels.length > 0;

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext("2d");
  }, []);

  const pushUndo = useCallback(
    (labels: TextLabel[] = textLabels) => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (!canvas || !ctx) return;
      undoStackRef.current.push({
        canvas: ctx.getImageData(0, 0, canvas.width, canvas.height),
        labels: cloneLabels(labels),
      });
      if (undoStackRef.current.length > MAX_UNDO) {
        undoStackRef.current.shift();
      }
      setCanUndo(undoStackRef.current.length > 1);
    },
    [getCtx, textLabels],
  );

  const fillWhite = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },
    [],
  );

  const restoreSnapshot = useCallback((snapshot: DrawSnapshot) => {
    const ctx = getCtx();
    if (!ctx) return;
    ctx.putImageData(snapshot.canvas, 0, 0);
    setTextLabels(cloneLabels(snapshot.labels));
  }, [getCtx]);

  const setupCanvas = useCallback(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const rect = container.getBoundingClientRect();
    const cssW = Math.max(1, Math.floor(rect.width));
    const cssH = Math.max(1, Math.floor(rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fillWhite(ctx, canvas.width, canvas.height);

    setTextLabels([]);
    setTextEditor(null);
    setDraggingLabelId(null);
    labelDragRef.current = null;
    undoStackRef.current = [];
    setCanUndo(false);
    const snapshot = ctx.getImageData(0, 0, canvas.width, canvas.height);
    undoStackRef.current = [{ canvas: snapshot, labels: [] }];
  }, [fillWhite]);

  useEffect(() => {
    setupCanvas();
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => setupCanvas());
    observer.observe(container);
    return () => observer.disconnect();
  }, [setupCanvas]);

  useEffect(() => {
    if (!textEditor) return;
    textInputRef.current?.focus();
  }, [textEditor]);

  useEffect(() => {
    if (!draggingLabelId) return;

    const onMove = (e: PointerEvent) => {
      const drag = labelDragRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      setTextLabels((prev) =>
        prev.map((label) =>
          label.id === drag.id
            ? { ...label, x: drag.origX + dx, y: drag.origY + dy }
            : label,
        ),
      );
    };

    const onUp = () => {
      if (labelDragRef.current) {
        pushUndo();
      }
      labelDragRef.current = null;
      setDraggingLabelId(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [draggingLabelId, pushUndo]);

  const commitText = useCallback(
    (editor: TextEditorState | null = textEditor) => {
      if (!editor) return;
      const text = editor.value.trim();
      setTextEditor(null);
      if (!text) return;

      const nextLabels = [
        ...textLabels,
        {
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `label-${Date.now()}`,
          x: editor.x,
          y: editor.y,
          value: text,
        },
      ];
      setTextLabels(nextLabels);
      pushUndo(nextLabels);
    },
    [pushUndo, textEditor, textLabels],
  );

  const selectTool = (id: DrawTool) => {
    if (textEditor) commitText();
    setTool(id);
  };

  const canvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const drawPreviewShape = (start: Point, end: Point) => {
    const ctx = getCtx();
    if (!ctx || !previewSnapshotRef.current) return;
    ctx.putImageData(previewSnapshotRef.current, 0, 0);
    ctx.strokeStyle = "#1e40af";
    ctx.lineWidth = PEN_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (tool === "line") {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    } else if (tool === "rect") {
      ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
    } else if (tool === "circle") {
      const rx = Math.abs(end.x - start.x) / 2;
      const ry = Math.abs(end.y - start.y) / 2;
      const cx = start.x + (end.x - start.x) / 2;
      const cy = start.y + (end.y - start.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (busy) return;
    const ctx = getCtx();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    const pt = canvasPoint(e);

    if (tool === "text") {
      skipTextBlurCommitRef.current = true;
      if (textEditor) commitText();
      setTextEditor({ x: pt.x, y: pt.y, value: "" });
      window.requestAnimationFrame(() => {
        skipTextBlurCommitRef.current = false;
      });
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    startPointRef.current = pt;

    if (tool === "pen" || tool === "eraser") {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = tool === "eraser" ? ERASER_WIDTH : PEN_WIDTH;
      ctx.strokeStyle = "#ffffff";
      ctx.globalCompositeOperation = "source-over";
      if (tool === "pen") {
        ctx.strokeStyle = "#1e3a8a";
      }
      ctx.beginPath();
      ctx.moveTo(pt.x, pt.y);
    } else {
      previewSnapshotRef.current = ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      );
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || busy) return;
    const ctx = getCtx();
    if (!ctx || !startPointRef.current) return;

    const pt = canvasPoint(e);

    if (tool === "pen" || tool === "eraser") {
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    } else {
      drawPreviewShape(startPointRef.current, pt);
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;

    const ctx = getCtx();
    if (ctx && startPointRef.current && (tool === "pen" || tool === "eraser")) {
      const pt = canvasPoint(e);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
    }

    drawingRef.current = false;
    previewSnapshotRef.current = null;
    startPointRef.current = null;
    pushUndo();

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleLabelPointerDown = (
    e: React.PointerEvent<HTMLDivElement>,
    label: TextLabel,
  ) => {
    if (busy || tool !== "text" || textEditor) return;
    e.stopPropagation();
    e.preventDefault();
    labelDragRef.current = {
      id: label.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: label.x,
      origY: label.y,
    };
    setDraggingLabelId(label.id);
  };

  const handleLabelDoubleClick = (
    e: React.MouseEvent<HTMLDivElement>,
    label: TextLabel,
  ) => {
    if (busy || tool !== "text") return;
    e.stopPropagation();
    setTextLabels((prev) => prev.filter((item) => item.id !== label.id));
    setTextEditor({ x: label.x, y: label.y, value: label.value });
  };

  const handleUndo = () => {
    if (busy || undoStackRef.current.length <= 1) return;
    if (textEditor) setTextEditor(null);
    undoStackRef.current.pop();
    const prev = undoStackRef.current[undoStackRef.current.length - 1];
    if (prev) restoreSnapshot(prev);
    setCanUndo(undoStackRef.current.length > 1);
  };

  const handleClear = () => {
    if (busy) return;
    setupCanvas();
  };

  const handleExport = () => {
    if (busy) return;
    if (textEditor) commitText();
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (checkWorkMode) {
      if (!caption.trim() || !hasContent) return;
    } else if (!hasContent && !caption.trim()) {
      return;
    }

    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext("2d");
    if (!exportCtx) return;

    // Flatten strokes + text labels into one PNG for the OCR API.
    exportCtx.drawImage(canvas, 0, 0);
    const cssW = parseFloat(canvas.style.width) || canvas.width;
    const dpr = canvas.width / cssW;
    exportCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLabelsOnCtx(exportCtx, textLabels);

    const dataUrl = exportCanvas.toDataURL("image/png");
    const base64 = stripDataUrlPrefix(dataUrl);
    onExport(dataUrl, base64, caption.trim());
  };

  const tools: { id: DrawTool; icon: typeof Pencil; label: string }[] = [
    { id: "pen", icon: Pencil, label: t("solver.draw_tool_pen") },
    { id: "eraser", icon: Eraser, label: t("solver.draw_tool_eraser") },
    { id: "line", icon: Minus, label: t("solver.draw_tool_line") },
    { id: "rect", icon: Square, label: t("solver.draw_tool_rect") },
    { id: "circle", icon: Circle, label: t("solver.draw_tool_circle") },
    { id: "text", icon: Type, label: t("solver.draw_tool_text") },
  ];

  const canSubmit = checkWorkMode
    ? !busy && hasContent && caption.trim().length > 0
    : !busy && (hasContent || caption.trim().length > 0);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3">
      <div className="text-center">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t(checkWorkMode ? "solver.check_work_draw_title" : "solver.draw_title")}
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {t(
            checkWorkMode
              ? "solver.check_work_draw_subtitle"
              : "solver.draw_subtitle",
          )}
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-600 dark:bg-slate-800">
        <div className="flex flex-wrap items-center gap-1 border-b border-slate-100 bg-slate-50 px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900/50">
          {tools.map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              type="button"
              disabled={busy}
              title={label}
              aria-label={label}
              onClick={() => selectTool(id)}
              className={`rounded-md p-2 transition-colors ${
                tool === id
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
              } disabled:opacity-50`}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
          <div className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-600" />
          <button
            type="button"
            disabled={busy || !canUndo}
            title={t("solver.draw_undo")}
            aria-label={t("solver.draw_undo")}
            onClick={handleUndo}
            className="rounded-md p-2 text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={busy}
            title={t("solver.draw_clear")}
            aria-label={t("solver.draw_clear")}
            onClick={handleClear}
            className="rounded-md p-2 text-slate-600 transition-colors hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <div
          ref={containerRef}
          className="relative h-[min(320px,45vh)] w-full bg-white touch-none"
        >
          <canvas
            ref={canvasRef}
            className={`absolute inset-0 h-full w-full touch-none ${
              tool === "text" ? "cursor-text" : "cursor-crosshair"
            }`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          />
          {textLabels.map((label) => (
            <div
              key={label.id}
              role="textbox"
              aria-label={label.value}
              onPointerDown={(e) => handleLabelPointerDown(e, label)}
              onDoubleClick={(e) => handleLabelDoubleClick(e, label)}
              className={`absolute z-10 max-w-[min(240px,70%)] whitespace-pre px-0.5 text-lg font-semibold leading-tight text-blue-900 ${
                tool === "text"
                  ? draggingLabelId === label.id
                    ? "cursor-grabbing rounded ring-2 ring-blue-500/40"
                    : "cursor-grab rounded hover:ring-2 hover:ring-blue-400/30"
                  : "pointer-events-none"
              }`}
              style={{ left: label.x, top: label.y }}
            >
              {label.value}
            </div>
          ))}
          {textEditor && (
            <input
              ref={textInputRef}
              type="text"
              value={textEditor.value}
              onChange={(e) =>
                setTextEditor({ ...textEditor, value: e.target.value })
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitText({ ...textEditor, value: textEditor.value });
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setTextEditor(null);
                }
              }}
              onBlur={() => {
                if (skipTextBlurCommitRef.current) return;
                commitText({ ...textEditor, value: textEditor.value });
              }}
              placeholder={t("solver.draw_text_placeholder")}
              className="absolute z-20 min-w-[7rem] max-w-[min(240px,70%)] rounded border border-blue-400 bg-white/95 px-2 py-1 text-sm font-semibold text-blue-900 shadow-sm outline-none ring-2 ring-blue-500/20"
              style={{ left: textEditor.x, top: textEditor.y }}
            />
          )}
        </div>

        {tool === "text" && (
          <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400">
            {t("solver.draw_text_drag_hint")}
          </p>
        )}

        <div className="border-t border-slate-100 px-3 py-2.5 dark:border-slate-700">
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            disabled={busy}
            placeholder={
              checkWorkMode
                ? t("solver.check_work_question_label")
                : t("solver.draw_caption_placeholder")
            }
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
      </div>

      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleExport}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading
            ? t("solver.ocr_reading")
            : checkWorkMode
              ? t("solver.check_work_submit")
              : t("solver.draw_read_question")}
        </button>
      </div>
    </div>
  );
}
