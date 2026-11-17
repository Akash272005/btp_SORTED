"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Lightbulb, Sparkles } from "lucide-react";
import type { ChatState } from "@/types/chat";

export function PlusThinkingMenu({
  open,
  alignRef,
  panelRef,
  setChatState,
  onCloseMenu,
  t,
}: {
  open: boolean;
  alignRef: React.RefObject<HTMLElement | null>;
  panelRef: React.RefObject<HTMLDivElement | null>;
  setChatState: React.Dispatch<React.SetStateAction<ChatState>>;
  onCloseMenu: () => void;
  t: (key: string) => string;
}) {
  const [pos, setPos] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const box = alignRef.current;
    if (!box) return;
    const gap = 8;
    const menuW = 304;
    const update = () => {
      const r = box.getBoundingClientRect();
      let left = r.left + gap;
      left = Math.max(gap, Math.min(left, window.innerWidth - menuW - gap));
      setPos({ left, top: r.bottom + gap });
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

  return createPortal(
    <div
      ref={panelRef}
      className="fixed z-[9999] w-[min(calc(100vw-1.25rem),19rem)] overflow-hidden rounded-2xl border border-border bg-popover py-1.5 shadow-lg dark:bg-slate-900 dark:border-slate-700/80 dark:shadow-black/40"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
    >
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-foreground hover:bg-muted dark:hover:bg-white/[0.06] sm:px-4"
        onClick={() => {
          setChatState((prev) => ({
            ...prev,
            enableThinking: true,
            enableGeneral: false,
          }));
          onCloseMenu();
        }}
      >
        <Lightbulb className="h-[1.15rem] w-[1.15rem] shrink-0 text-amber-500" />
        <div>
          <div className="text-[0.9375rem] font-medium">{t("Thinking")}</div>
          <div className="mt-0.5 text-[0.8125rem] text-muted-foreground">
            {t("thinking.menu.description")}
          </div>
        </div>
      </button>
      <button
        type="button"
        role="menuitem"
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left text-foreground hover:bg-muted dark:hover:bg-white/[0.06] sm:px-4"
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
        <Sparkles className="h-[1.15rem] w-[1.15rem] shrink-0 text-emerald-500" />
        <div>
          <div className="text-[0.9375rem] font-medium">{t("General")}</div>
          <div className="mt-0.5 text-[0.8125rem] text-muted-foreground">
            {t("general.menu.description")}
          </div>
        </div>
      </button>
    </div>,
    document.body,
  );
}
