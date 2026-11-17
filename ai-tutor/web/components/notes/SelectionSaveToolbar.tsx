"use client";

import { useEffect, useState } from "react";
import { Highlighter } from "lucide-react";
import { useTranslation } from "react-i18next";
import { selectionToHighlightedHtml } from "@/lib/notesContent";

interface SelectionSaveToolbarProps {
  containerRef: React.RefObject<HTMLElement | null>;
  onSaveSelection: (htmlFragment: string, plainText: string) => void;
}

export default function SelectionSaveToolbar({
  containerRef,
  onSaveSelection,
}: SelectionSaveToolbarProps) {
  const { t } = useTranslation();
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [selectionText, setSelectionText] = useState("");

  useEffect(() => {
    const onMouseUp = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !containerRef.current) {
        setPos(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!containerRef.current.contains(range.commonAncestorContainer)) {
        setPos(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setPos(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      setSelectionText(text);
      setPos({
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      });
    };

    document.addEventListener("mouseup", onMouseUp);
    return () => document.removeEventListener("mouseup", onMouseUp);
  }, [containerRef]);

  if (!pos || !selectionText) return null;

  return (
    <div
      className="fixed z-[100] -translate-x-1/2 -translate-y-full"
      style={{ left: pos.x, top: pos.y }}
    >
      <button
        type="button"
        onClick={() => {
          onSaveSelection(selectionToHighlightedHtml(selectionText), selectionText);
          window.getSelection()?.removeAllRanges();
          setPos(null);
        }}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg shadow-lg hover:bg-emerald-700"
      >
        <Highlighter className="w-3.5 h-3.5" />
        {t("notes.save_selection")}
      </button>
    </div>
  );
}
