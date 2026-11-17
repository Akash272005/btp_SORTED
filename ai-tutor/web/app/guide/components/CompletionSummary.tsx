"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileText, Loader2, NotebookPen } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import { processLatexContent } from "@/lib/latex";
import { createNoteFromSession } from "@/lib/notesApi";
import { parseNcertFromPdfUrl } from "@/lib/notesDb";

interface CompletionSummaryProps {
  summary: string;
  knowledgePointsCount?: number;
  onFinish?: () => void;
  /** Sidebar expand/collapse + layout toggles (same row as title/actions) */
  leadingToolbar?: ReactNode;
  sessionTitle?: string;
  ncertPdfUrl?: string;
}

export default function CompletionSummary({
  summary,
  knowledgePointsCount,
  onFinish,
  leadingToolbar,
  sessionTitle = "",
  ncertPdfUrl = "",
}: CompletionSummaryProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const [creatingNote, setCreatingNote] = useState(false);

  const handleCreateNoteFromSession = async () => {
    if (!summary?.trim()) return;
    setCreatingNote(true);
    try {
      const ncert = ncertPdfUrl ? parseNcertFromPdfUrl(ncertPdfUrl) : null;
      const note = await createNoteFromSession({
        summary,
        session_title: sessionTitle || t("Learning Summary"),
        class_key: ncert?.class_key || "",
        subject_key: ncert?.subject_key || "",
        chapter_key: ncert?.chapter_key || "",
        chapter_label: sessionTitle || "",
      });
      router.push(`/notebook?tab=notes&noteId=${note.id}`);
    } catch (err) {
      console.error(err);
    } finally {
      setCreatingNote(false);
    }
  };

  const handleDownloadMarkdown = () => {
    const element = document.createElement("a");
    const file = new Blob([summary], { type: "text/markdown" });
    element.href = URL.createObjectURL(file);
    element.download = "learning_summary.md";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const handleDownloadPDF = () => {
    // Convert markdown to simple HTML for print — using the browser's renderer
    // We inject KaTeX CSS + a clean print stylesheet into a new window
    const katexCDN = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
    const date = new Date().toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Simple markdown-to-html conversion for key elements
    const mdToHtml = (md: string): string => {
      return md
        .replace(/^#{1}\s+(.+)$/gm, "<h1>$1</h1>")
        .replace(/^#{2}\s+(.+)$/gm, "<h2>$1</h2>")
        .replace(/^#{3}\s+(.+)$/gm, "<h3>$1</h3>")
        .replace(/^#{4}\s+(.+)$/gm, "<h4>$1</h4>")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`(.+?)`/g, "<code>$1</code>")
        .replace(/^---$/gm, "<hr>")
        .replace(/^- (.+)$/gm, "<li>$1</li>")
        .replace(/^\d+\.\s+(.+)$/gm, "<li>$1</li>")
        .replace(/(<li>.*<\/li>\n?)+/gm, (match) => `<ul>${match}</ul>`)
        .replace(/\n\n/g, "</p><p>")
        .replace(/^(?!<[h|u|l|p|h|c]).+/gm, (line) =>
          line.trim() ? `<p>${line}</p>` : ""
        );
    };

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8" />
          <title>Learning Summary — Bixy AiTutor</title>
          <link rel="stylesheet" href="${katexCDN}" />
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: 'Inter', system-ui, -apple-system, sans-serif;
              font-size: 13px;
              line-height: 1.75;
              color: #1e293b;
              background: #fff;
              padding: 48px 56px;
              max-width: 820px;
              margin: 0 auto;
            }
            /* Header */
            .header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding-bottom: 20px;
              border-bottom: 2px solid #e2e8f0;
              margin-bottom: 36px;
            }
            .brand { font-size: 18px; font-weight: 700; color: #6366f1; letter-spacing: -0.5px; }
            .date { font-size: 11px; color: #94a3b8; }
            /* Achievement banner */
            .achievement {
              background: linear-gradient(135deg, #eef2ff 0%, #f5f3ff 100%);
              border: 1px solid #c7d2fe;
              border-radius: 14px;
              padding: 20px 24px;
              margin-bottom: 28px;
              display: flex;
              align-items: center;
              gap: 18px;
            }
            .achievement-icon {
              width: 52px;
              height: 52px;
              background: #6366f1;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              color: #fff;
              font-size: 22px;
              flex-shrink: 0;
            }
            .achievement h2 { font-size: 17px; font-weight: 700; color: #3730a3; margin-bottom: 4px; }
            .achievement p  { font-size: 12px; color: #6366f1; }
            /* Content typography */
            h1 { font-size: 20px; font-weight: 700; color: #1e293b; margin: 28px 0 10px; padding-bottom: 6px; border-bottom: 1.5px solid #e2e8f0; }
            h2 { font-size: 16px; font-weight: 700; color: #334155; margin: 22px 0 8px; }
            h3 { font-size: 14px; font-weight: 600; color: #475569; margin: 16px 0 6px; }
            h4 { font-size: 13px; font-weight: 600; color: #64748b; margin: 12px 0 4px; }
            p  { margin: 8px 0; color: #334155; }
            ul, ol { margin: 8px 0 8px 20px; }
            li { margin: 4px 0; color: #334155; }
            strong { font-weight: 600; color: #1e293b; }
            em { color: #4f46e5; font-style: italic; }
            code {
              background: #f1f5f9;
              border: 1px solid #e2e8f0;
              border-radius: 4px;
              padding: 1px 5px;
              font-size: 11.5px;
              font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
              color: #d946ef;
            }
            pre {
              background: #0f172a;
              color: #e2e8f0;
              border-radius: 10px;
              padding: 16px 20px;
              margin: 12px 0;
              overflow-x: auto;
              font-size: 11.5px;
            }
            hr { border: none; border-top: 1.5px solid #e2e8f0; margin: 20px 0; }
            /* Tables */
            table { width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 12px; }
            th {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              padding: 8px 12px;
              text-align: left;
              font-weight: 600;
              color: #475569;
            }
            td { border: 1px solid #e2e8f0; padding: 8px 12px; color: #334155; }
            tr:nth-child(even) td { background: #f8fafc; }
            /* Footer */
            .footer {
              margin-top: 48px;
              padding-top: 16px;
              border-top: 1px solid #e2e8f0;
              text-align: center;
              font-size: 10px;
              color: #94a3b8;
            }
            @media print {
              body { padding: 30px 40px; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand">📚 Bixy AiTutor</div>
            <div class="date">Generated on ${date}</div>
          </div>
          <div class="achievement">
            <div class="achievement-icon">✓</div>
            <div>
              <h2>Learning Completed!</h2>
              <p>You have successfully mastered ${knowledgePointsCount || "all"} knowledge points in this session.</p>
            </div>
          </div>
          <div class="content">${mdToHtml(summary || "")}</div>
          <div class="footer">Generated by Bixy AiTutor &nbsp;·&nbsp; ${date}</div>
          <script>
            window.onload = function() {
              window.print();
            };
          <\/script>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  };

  // Table components for ReactMarkdown
  const tableComponents = {
    table: ({ node, ...props }: any) => (
      <div className="overflow-x-auto my-6 rounded-lg border border-slate-200 shadow-sm">
        <table
          className="min-w-full divide-y divide-slate-200 text-sm"
          {...props}
        />
      </div>
    ),
    thead: ({ node, ...props }: any) => (
      <thead className="bg-slate-50" {...props} />
    ),
    th: ({ node, ...props }: any) => (
      <th
        className="px-4 py-3 text-left font-semibold text-slate-700 whitespace-nowrap border-b border-slate-200"
        {...props}
      />
    ),
    tbody: ({ node, ...props }: any) => (
      <tbody className="divide-y divide-slate-100 bg-white" {...props} />
    ),
    td: ({ node, ...props }: any) => (
      <td
        className="px-4 py-3 text-slate-600 border-b border-slate-100"
        {...props}
      />
    ),
    tr: ({ node, ...props }: any) => (
      <tr className="hover:bg-slate-50/50 transition-colors" {...props} />
    ),
  };

  return (
    <div className="flex-1 w-full min-w-0 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col overflow-hidden relative">
      {/* Summary Header — sidebar toggles + centered title + PDF */}
      <div className="flex items-center gap-2 shrink-0 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-emerald-50 to-indigo-50 dark:from-emerald-900/20 dark:to-indigo-900/20 px-3 sm:px-4 py-3 min-w-0">
        <div className="flex shrink-0 items-center gap-2">{leadingToolbar}</div>
        <div className="flex-1 min-w-0 flex justify-center px-1 sm:px-2">
          <h2 className="flex items-center justify-center gap-2 text-center font-bold text-slate-800 dark:text-slate-100 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="truncate">{t("Learning Summary")}</span>
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleCreateNoteFromSession()}
            disabled={creatingNote || !summary?.trim()}
            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg border border-emerald-600 transition-all shadow-sm shadow-emerald-500/20 disabled:opacity-50"
            title={t("notes.create_from_session")}
          >
            {creatingNote ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <NotebookPen className="w-3.5 h-3.5" />
            )}
            {t("notes.create_from_session")}
          </button>
          <button
            type="button"
            onClick={handleDownloadPDF}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg border border-indigo-600 transition-all shadow-sm shadow-indigo-500/20"
            title={t("Download as PDF")}
          >
            <FileText className="w-3.5 h-3.5" />
            {t("PDF")}
          </button>
        </div>
      </div>
      {/* Summary Content — full width of card; cap line length in prose only (max-w-4xl was leaving huge empty rails on xl viewports) */}
      <div className="flex-1 overflow-y-auto px-5 py-8 sm:px-8 lg:px-10 bg-white dark:bg-slate-800">
        <div className="w-full max-w-none mx-auto">
          {/* Achievement Card */}
          <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border border-indigo-200/50 dark:border-indigo-500/20 flex items-center gap-6">
            <div className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/30 shrink-0">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">
                {t("Learning Completed!")}
              </h3>
              <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                {t("You've successfully mastered {n} knowledge points in this session. Great job!").replace("{n}", String(knowledgePointsCount || ""))}
              </p>
            </div>
          </div>

          <div className="prose prose-slate dark:prose-invert prose-headings:font-bold prose-h1:text-2xl prose-h2:text-xl max-w-none mb-12">
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={tableComponents}
            >
              {processLatexContent(summary || "")}
            </ReactMarkdown>
          </div>

          <div className="flex justify-center pb-12">
            <button
              onClick={onFinish}
              className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-bold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-xl shadow-indigo-500/25 flex items-center gap-2 group"
            >
              {t("Finish & Close")}
              <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
