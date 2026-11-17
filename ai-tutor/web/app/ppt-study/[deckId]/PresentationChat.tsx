"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import AddToNotebookModal from "@/components/AddToNotebookModal";
import { ChatProvider, useChat } from "@/context/chat";

function StudySession({ deckId }: { deckId: string }) {
  const { chatState, sendChatMessage } = useChat();
  const [question, setQuestion] = useState("");
  const [notebookRecord, setNotebookRecord] = useState<{ question: string; answer: string } | null>(null);

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!question.trim() || chatState.isLoading) return;
    sendChatMessage(question.trim());
    setQuestion("");
  }

  return (
    <section className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-3xl font-bold">Study your presentation</h1>
        <p className="mt-2 text-slate-600 dark:text-slate-300">Ask about a topic from the slides, or request a summary to start.</p>
      </header>

      <ol className="space-y-4" aria-label="Presentation chat">
        {chatState.messages.map((message, index) => (
          <li key={index} className="rounded-xl border border-border bg-card p-4">
            <p className="mb-2 text-sm font-semibold">{message.role === "user" ? "You" : "AI Tutor"}</p>
            <div className="space-y-3 break-words text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
            {message.role === "assistant" && !chatState.isLoading && Boolean(message.sources?.rag?.length) && (
              <button
                type="button"
                className="mt-3 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                onClick={() => setNotebookRecord({
                  question: chatState.messages[index - 1]?.content || "",
                  answer: message.content,
                })}
              >
                Save to notebook
              </button>
            )}
          </li>
        ))}
      </ol>

      <form onSubmit={submitQuestion} className="space-y-3">
        <label htmlFor="slide-question" className="block text-sm font-medium">Question about your slides</label>
        <input
          id="slide-question"
          className="w-full rounded-lg border border-border bg-card p-3"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          required
        />
        <button type="submit" disabled={!question.trim() || chatState.isLoading} className="rounded-lg bg-indigo-700 px-4 py-2 font-medium text-white disabled:opacity-50">
          {chatState.isLoading ? "Tutor is responding…" : "Ask AI Tutor"}
        </button>
        {chatState.isLoading && <p className="sr-only" role="status">Tutor is responding</p>}
      </form>

      <p className="text-sm text-slate-600 dark:text-slate-300">
        To build a lesson, save a Tutor answer to your notebook and select that record in{" "}
        <Link href="/guide" className="font-medium text-indigo-600 underline dark:text-indigo-400">Guided Learning</Link>.
      </p>

      {notebookRecord && (
        <AddToNotebookModal
          isOpen
          onClose={() => setNotebookRecord(null)}
          recordType="chat"
          title="Presentation study"
          userQuery={notebookRecord.question}
          output={notebookRecord.answer}
          kbName={deckId}
        />
      )}
    </section>
  );
}

export default function PresentationChat({ deckId }: { deckId: string }) {
  return (
    <ChatProvider initialKnowledgeBase={deckId}>
      <StudySession deckId={deckId} />
    </ChatProvider>
  );
}
