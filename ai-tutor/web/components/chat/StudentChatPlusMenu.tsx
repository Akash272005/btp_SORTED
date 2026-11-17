"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  FileText,
  GitBranch,
  Image as ImageIcon,
  Lightbulb,
  Paperclip,
  Sparkles,
} from "lucide-react";
import type { ChatState } from "@/types/chat";

export function StudentChatPlusMenu({
  open,
  alignRef,
  panelRef,
  setChatState,
  onCloseMenu,
  onAttachPdf,
  onAttachImage,
  onAttachDocument,
  onRequestDiagram,
  t,
}: {
  open: boolean;
  alignRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>;
  onCloseMenu: () => void;
  onAttachPdf: () => void;
  onAttachImage: () => void;
  onAttachDocument: () => void;
  onRequestDiagram?: () => void;
  t: (key: string) => string;
}) {
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const box = alignRef.current;
    if (!box) return;
    const gap = 8;
    const menuW = 280;
    const update = () => {
      const r = box.getBoundingClientRect();
      let left = r.left;
      let top = r.bottom + gap;
      if (left + menuW > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - menuW - 8);
      }
      if (top + 320 > window.innerHeight - 8) {
        top = Math.max(8, r.top - 320 - gap);
      }
      setPos({ left, top });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, alignRef]);

  if (!open || typeof document === "undefined") return null;

  const itemCls =
    "flex w-full items-center gap-3 px-3.5 py-2.5 text-left text-sm text-slate-800 transition-colors hover:bg-slate-50 dark:text-neutral-100 dark:hover:bg-white/[0.08]";

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[20000] w-[min(calc(100vw-1rem),17.5rem)] overflow-hidden rounded-2xl border border-slate-200/90 bg-white py-1 shadow-2xl dark:border-slate-600 dark:bg-slate-900"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
    >
      <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Add to chat
      </div>
      <button
        type="button"
        role="menuitem"
        className={itemCls}
        onClick={() => {
          onAttachPdf();
          onCloseMenu();
        }}
      >
        <FileText className="h-4 w-4 shrink-0 text-red-500" />
        <span>Upload PDF</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemCls}
        onClick={() => {
          onAttachImage();
          onCloseMenu();
        }}
      >
        <ImageIcon className="h-4 w-4 shrink-0 text-emerald-500" />
        <span>Upload image</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemCls}
        onClick={() => {
          onAttachDocument();
          onCloseMenu();
        }}
      >
        <Paperclip className="h-4 w-4 shrink-0 text-indigo-500" />
        <span>Upload document</span>
      </button>
      {onRequestDiagram ? (
        <button
          type="button"
          role="menuitem"
          className={itemCls}
          onClick={() => {
            onRequestDiagram();
            onCloseMenu();
          }}
        >
          <GitBranch className="h-4 w-4 shrink-0 text-violet-500" />
          <span>Draw concept diagram</span>
        </button>
      ) : null}
      <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
      <button
        type="button"
        role="menuitem"
        className={itemCls}
        onClick={() => {
          setChatState((prev) => ({
            ...prev,
            enableThinking: true,
            enableGeneral: false,
          }));
          onCloseMenu();
        }}
      >
        <Lightbulb className="h-4 w-4 shrink-0 text-amber-500" />
        <span>{t("Think")}</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className={itemCls}
        onClick={() => {
          setChatState((prev) => ({
            ...prev,
            enableGeneral: true,
            enableThinking: false,
            enableRag: false,
            enableWebSearch: false,
          }));
          onCloseMenu();
        }}
      >
        <Sparkles className="h-4 w-4 shrink-0 text-emerald-500" />
        <span>{t("General")}</span>
      </button>
    </div>,
    document.body,
  );
}
