import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { processLatexContent } from "@/lib/latex";
import { escapeHtml } from "@/lib/notesContent";
import { isHtmlDocument } from "@/lib/notebookRecordContent";

/** True when saved output is HTML from the rich editor (TipTap) or a wrapped fragment. */
export function isEditedRecordHtml(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed.startsWith("<")) return false;
  if (isHtmlDocument(trimmed)) return true;
  return /<\/(p|h1|h2|h3|h4|ul|ol|li|blockquote|pre|table|div)>/i.test(trimmed);
}

/** Convert stored markdown (or existing HTML) into HTML for the rich editor. */
export function markdownToEditableHtml(markdown: string): string {
  const trimmed = (markdown || "").trim();
  if (!trimmed) return "<p></p>";
  if (isEditedRecordHtml(trimmed)) return trimmed;

  try {
    return renderToStaticMarkup(
      createElement(
        ReactMarkdown,
        {
          remarkPlugins: [remarkGfm, remarkMath],
          rehypePlugins: [rehypeKatex],
        },
        processLatexContent(trimmed),
      ),
    );
  } catch {
    return `<p>${escapeHtml(trimmed)}</p>`;
  }
}
