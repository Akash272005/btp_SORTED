"use client";

import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

import ChatPanel from "./ChatPanel";
import type { ChatMessage, KnowledgePoint, StepQuizScore } from "../types";
import type { SessionOutlineStatus } from "./GuideOutlinePanel";

interface GuidePathAssistantPanelProps {
  knowledgePoints: KnowledgePoint[];
  currentIndex: number;
  status: SessionOutlineStatus;
  attemptedQuizSteps: ReadonlySet<number>;
  scoresByStep: Record<number, StepQuizScore>;
  messages: ChatMessage[];
  isLearning: boolean;
  onSendMessage: (message: string) => void | Promise<void>;
}

/**
 * Single rail card: path steps render inside the latest “Starting to learn…” chat bubble;
 * rest is scrollable chat + input.
 */
export default function GuidePathAssistantPanel({
  knowledgePoints,
  currentIndex,
  status,
  attemptedQuizSteps,
  scoresByStep,
  messages,
  isLearning,
  onSendMessage,
}: GuidePathAssistantPanelProps) {
  const { t } = useTranslation();

  if (knowledgePoints.length === 0) {
    return (
      <div className="flex-1 flex flex-col min-h-0 min-w-0">
        <ChatPanel
          messages={messages}
          isLearning={isLearning}
          onSendMessage={onSendMessage}
        />
      </div>
    );
  }

  const inlineOutline = {
    knowledgePoints,
    currentIndex,
    status,
    attemptedQuizSteps,
    scoresByStep,
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 w-full rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      <div className="flex-shrink-0 px-3 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-800/80 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
        <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {t("guide.path_assistant.card_title")}
        </span>
      </div>

      <ChatPanel
        variant="integrated"
        inlineOutline={inlineOutline}
        messages={messages}
        isLearning={isLearning}
        onSendMessage={onSendMessage}
      />
    </div>
  );
}
