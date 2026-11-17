"use client";

import { Bot } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import HTMLViewer from "@/app/guide/components/HTMLViewer";
import { processLatexContent } from "@/lib/latex";
import {
  getChatMessagesFromRecord,
  isHtmlDocument,
  type SavedChatMessage,
} from "@/lib/notebookRecordContent";
import { isEditedRecordHtml } from "@/lib/notebookRecordHtml";

interface NotebookRecordOutputProps {
  output: string;
  recordType: string;
  metadata?: Record<string, unknown>;
}

function ChatTranscriptView({ messages }: { messages: SavedChatMessage[] }) {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {messages.map((msg, idx) => (
        <div
          key={idx}
          className={`flex gap-4 w-full ${
            msg.role === "user" ? "flex-row-reverse" : ""
          }`}
        >
          {msg.role === "user" ? (
            <div className="max-w-[85%] bg-blue-600 px-5 py-3.5 rounded-3xl rounded-tr-[4px] text-white shadow-md shadow-blue-500/20 font-medium text-sm whitespace-pre-wrap">
              {msg.content}
            </div>
          ) : (
            <>
              <div className="w-8 h-8 mt-1 rounded-full bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shrink-0 shadow-sm">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 max-w-[90%] min-w-0 bg-white dark:bg-slate-800 px-6 py-5 rounded-3xl rounded-tl-[4px] border border-indigo-50 dark:border-indigo-500/20 shadow-sm">
                <div className="prose prose-slate dark:prose-invert max-w-none prose-sm min-w-0">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {processLatexContent(msg.content)}
                  </ReactMarkdown>
                </div>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function HtmlFragmentOutput({ output }: { output: string }) {
  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600">
      <div
        className="prose prose-slate dark:prose-invert max-w-none prose-sm notebook-record-html"
        dangerouslySetInnerHTML={{ __html: output }}
      />
    </div>
  );
}

function MarkdownOutput({ output }: { output: string }) {
  return (
    <div className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-xl border border-slate-100 dark:border-slate-600">
      <div className="prose prose-slate dark:prose-invert max-w-none prose-sm">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkMath]}
          rehypePlugins={[rehypeKatex]}
        >
          {processLatexContent(output)}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export default function NotebookRecordOutput({
  output,
  recordType,
  metadata,
}: NotebookRecordOutputProps) {
  if (isHtmlDocument(output)) {
    return (
      <HTMLViewer
        html={output}
        currentIndex={0}
        loadingMessage=""
        containerClassName="shadow-none"
      />
    );
  }

  const chatMessages = getChatMessagesFromRecord({
    output,
    type: recordType,
    metadata,
  });
  if (recordType === "chat") {
    if (chatMessages && chatMessages.length > 0) {
      return <ChatTranscriptView messages={chatMessages} />;
    }
    if (output.trim()) {
      return <MarkdownOutput output={output} />;
    }
  } else if (chatMessages && chatMessages.length >= 2) {
    return <ChatTranscriptView messages={chatMessages} />;
  }

  if (isEditedRecordHtml(output)) {
    return <HtmlFragmentOutput output={output} />;
  }

  return <MarkdownOutput output={output} />;
}
