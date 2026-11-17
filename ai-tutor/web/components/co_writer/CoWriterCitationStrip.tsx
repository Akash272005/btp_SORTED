"use client";

import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, FileText } from "lucide-react";
import type { CoWriterCitation } from "@/lib/coWriterNotebook";

interface CoWriterCitationStripProps {
  citations: CoWriterCitation[];
  expanded: boolean;
  onToggle: () => void;
}

export default function CoWriterCitationStrip({
  citations,
  expanded,
  onToggle,
}: CoWriterCitationStripProps) {
  const { t } = useTranslation();
  if (citations.length === 0) return null;

  return (
    <div className="border-t border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-slate-600 hover:bg-slate-100/80 dark:text-slate-300 dark:hover:bg-slate-700/50"
      >
        <span className="flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 text-purple-500" />
          {t("cowriter.citations.title", { count: citations.length })}
        </span>
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5" />
        )}
      </button>
      {expanded && (
        <div className="max-h-40 space-y-2 overflow-y-auto px-3 pb-3">
          {citations.map((c, i) => (
            <div
              key={i}
              className="rounded-lg border border-slate-200 bg-white p-2 text-[11px] text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
            >
              <p className="line-clamp-3 whitespace-pre-wrap">{c.snippet}</p>
              <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-slate-400">
                {c.kb_name && <span>{c.kb_name}</span>}
                {c.source_file && <span>{c.source_file}</span>}
                {c.url && (
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-500 hover:underline"
                  >
                    {t("cowriter.citations.link")}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
