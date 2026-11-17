"use client";

import { ExternalLink } from "lucide-react";

interface ChapterPdfViewerProps {
  url: string;
  title: string;
}

export default function ChapterPdfViewer({ url, title }: ChapterPdfViewerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-neutral-100 dark:bg-neutral-900">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
        <p className="min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
          {title}
        </p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open
        </a>
      </div>
      <div className="relative min-h-0 flex-1">
        <iframe
          src={`${url}#view=FitH`}
          title={title}
          className="absolute inset-0 h-full w-full border-0 bg-white"
        />
        <object
          data={url}
          type="application/pdf"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
          aria-hidden
        >
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-500">
            <p>PDF preview may be blocked in the browser.</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-600 hover:underline"
            >
              Open chapter in a new tab
            </a>
          </div>
        </object>
      </div>
    </div>
  );
}
