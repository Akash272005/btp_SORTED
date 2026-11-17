"use client";

import { useEffect, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import ChapterPdfViewer from "./ChapterPdfViewer";
import StudentChatPane from "./StudentChatPane";
import { loadPdfUrlRemap } from "@/lib/examCalendarBulkChapters";
import type { StudentChatContext } from "@/lib/ncertJourney";
import {
  normalizeStudentChatContext,
  subjectDisplayLabel,
} from "@/lib/ncertJourney";

interface StudentChapterWorkspaceProps {
  ctx: StudentChatContext;
  onChangeChapter: () => void;
}

export default function StudentChapterWorkspace({
  ctx,
  onChangeChapter,
}: StudentChapterWorkspaceProps) {
  const [pdfOpen, setPdfOpen] = useState(true);
  const [chapterUrl, setChapterUrl] = useState(ctx.chapterUrl);
  const header = `${subjectDisplayLabel(ctx.subjectKey)} · ${ctx.medium} · ${ctx.chapterLabel}`;

  useEffect(() => {
    setChapterUrl(ctx.chapterUrl);
    loadPdfUrlRemap().then((remap) => {
      setChapterUrl(
        normalizeStudentChatContext(ctx, remap).chapterUrl,
      );
    });
  }, [ctx]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-slate-100 dark:bg-slate-950">
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0 flex-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            NCERT workspace
          </span>
          <span className="mx-2 text-slate-300">|</span>
          <span className="truncate text-xs text-slate-700 dark:text-slate-200">
            {header}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setPdfOpen((o) => !o)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          title={pdfOpen ? "Hide chapter PDF" : "Show chapter PDF"}
        >
          {pdfOpen ? (
            <>
              <PanelLeftClose className="h-3.5 w-3.5" />
              Hide PDF
            </>
          ) : (
            <>
              <PanelLeftOpen className="h-3.5 w-3.5" />
              Show PDF
            </>
          )}
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1">
        {pdfOpen && (
          <section
            className="flex min-h-0 w-full flex-col border-b border-slate-200 lg:w-[46%] lg:shrink-0 lg:border-b-0 lg:border-r dark:border-slate-800"
            aria-label="Chapter reader"
          >
            <ChapterPdfViewer url={chapterUrl} title={ctx.chapterLabel} />
          </section>
        )}

        {!pdfOpen && (
          <button
            type="button"
            onClick={() => setPdfOpen(true)}
            className="absolute left-0 top-1/2 z-20 hidden -translate-y-1/2 items-center gap-0.5 rounded-r-lg border border-l-0 border-slate-200 bg-white px-1.5 py-3 text-[10px] font-medium text-slate-600 shadow-md hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 lg:flex"
            title="Show PDF panel"
          >
            <ChevronRight className="h-4 w-4" />
            PDF
          </button>
        )}

        <section
          className={`flex min-h-0 min-w-0 flex-1 flex-col ${pdfOpen ? "" : "w-full"}`}
          aria-label="Chapter chat"
        >
          <StudentChatPane
            chapterTitle={ctx.chapterLabel}
            subjectLabel={ctx.subjectLabel}
            onNewChat={onChangeChapter}
          />
        </section>

        {pdfOpen && (
          <button
            type="button"
            onClick={() => setPdfOpen(false)}
            className="absolute left-[46%] top-1/2 z-20 hidden -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white p-1 text-slate-500 shadow-md hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-900 lg:flex max-lg:hidden"
            title="Collapse PDF panel"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
