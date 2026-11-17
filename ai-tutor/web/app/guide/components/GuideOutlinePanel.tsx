"use client";

import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Minus,
  Circle,
} from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";
import { useTranslation } from "react-i18next";

import type { KnowledgePoint, StepQuizScore } from "../types";

export type SessionOutlineStatus =
  | "idle"
  | "initialized"
  | "learning"
  | "completed";

/** Backend sends this when entering a knowledge point (see guide_manager.py). */
export function isStartingLearnKnowledgeMessage(content: string): boolean {
  return /📚\s*Starting to learn knowledge point/i.test(content.trim());
}

interface GuideOutlinePanelProps {
  knowledgePoints: KnowledgePoint[];
  currentIndex: number;
  status: SessionOutlineStatus;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  attemptedQuizSteps: ReadonlySet<number>;
  scoresByStep: Record<number, StepQuizScore>;
  /** Extra classes on the root aside */
  className?: string;
  /** Mobile drawer, desktop sidebar rail, embedded card, integrated rail strip, or merged into parent scroll (no inner max-height) */
  variant?: "sidebar" | "drawer" | "embedded" | "integrated" | "merged";
  onDrawerClose?: () => void;
}

function topicProgressState(
  status: SessionOutlineStatus,
  index: number,
  currentIndex: number,
): "pending" | "active" | "done" {
  if (status === "completed") return "done";
  if (status !== "learning") return "pending";
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "active";
  return "pending";
}

type SegmentTone = "muted" | "accent" | "success" | "warning";

/** Three milestones: (1) reached this step, (2) quiz attempted, (3) checkpoint passed. */
function outlineMilestoneSegments(
  idx: number,
  status: SessionOutlineStatus,
  currentIndex: number,
  attempted: boolean,
  score?: StepQuizScore,
): { filled: boolean; tone: SegmentTone }[] {
  const ratio =
    score && score.total > 0 ? score.correct / score.total : null;
  const passed = ratio !== null && ratio >= 1;
  const partial = ratio !== null && ratio >= 0.5 && ratio < 1;
  const weak = ratio !== null && ratio < 0.5;

  const reached =
    status === "completed" ||
    (status === "learning" && idx <= currentIndex) ||
    (status === "initialized" && currentIndex >= 0 && idx <= currentIndex);

  let s1Tone: SegmentTone = "muted";
  if (reached) {
    if (status === "learning" && idx === currentIndex) {
      s1Tone = "accent";
    } else {
      s1Tone = "success";
    }
  }

  const s2Filled = attempted || passed;
  let s2Tone: SegmentTone = "muted";
  if (s2Filled) {
    if (passed) {
      s2Tone = "success";
    } else if (partial || weak) {
      s2Tone = "warning";
    } else {
      s2Tone = "accent";
    }
  }

  const s3Filled = passed;
  const s3Tone: SegmentTone = passed ? "success" : "muted";

  return [
    { filled: reached, tone: s1Tone },
    { filled: s2Filled, tone: s2Tone },
    { filled: s3Filled, tone: s3Tone },
  ];
}

function milestoneSegmentClass(filled: boolean, tone: SegmentTone): string {
  const base = "h-1 flex-1 rounded-full transition-colors";
  if (!filled || tone === "muted") {
    return `${base} bg-slate-200 dark:bg-slate-600`;
  }
  if (tone === "success") {
    return `${base} bg-emerald-500`;
  }
  if (tone === "accent") {
    return `${base} bg-indigo-500`;
  }
  return `${base} bg-amber-500`;
}

function MilestoneSegmentBar({
  segments,
  ariaLabel,
}: {
  segments: { filled: boolean; tone: SegmentTone }[];
  ariaLabel: string;
}) {
  return (
    <div
      className="flex gap-0.5 w-full mt-1"
      role="group"
      aria-label={ariaLabel}
    >
      {segments.map((seg, i) => (
        <div key={i} className={milestoneSegmentClass(seg.filled, seg.tone)} />
      ))}
    </div>
  );
}

function CheckpointIcon({
  topicState,
  score,
}: {
  topicState: "pending" | "active" | "done";
  score?: StepQuizScore;
}) {
  const wrap =
    "flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900";

  if (score && score.total > 0) {
    const ratio = score.correct / score.total;
    if (ratio >= 1) {
      return (
        <span className={wrap} title={`${score.correct}/${score.total}`}>
          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
        </span>
      );
    }
    if (ratio >= 0.5) {
      return (
        <span className={wrap} title={`${score.correct}/${score.total}`}>
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400" aria-hidden />
        </span>
      );
    }
    return (
      <span className={wrap} title={`${score.correct}/${score.total}`}>
        <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" aria-hidden />
      </span>
    );
  }

  if (topicState === "done") {
    return (
      <span className={wrap}>
        <Minus className="w-4 h-4 text-slate-400 dark:text-slate-500" aria-hidden />
      </span>
    );
  }

  if (topicState === "active") {
    return (
      <span className={wrap}>
        <Circle className="w-4 h-4 text-indigo-400 dark:text-indigo-500" aria-hidden />
      </span>
    );
  }

  return (
    <span className={`${wrap} opacity-60`}>
      <Circle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600" aria-hidden />
    </span>
  );
}

interface GuideOutlineStepListProps {
  knowledgePoints: KnowledgePoint[];
  currentIndex: number;
  status: SessionOutlineStatus;
  attemptedQuizSteps: ReadonlySet<number>;
  scoresByStep: Record<number, StepQuizScore>;
  className?: string;
}

/** Full step cards (milestones, quiz state) — reusable inside chat or outline nav. */
export function GuideOutlineStepList({
  knowledgePoints,
  currentIndex,
  status,
  attemptedQuizSteps,
  scoresByStep,
  className = "",
}: GuideOutlineStepListProps) {
  const { t } = useTranslation();

  return (
    <ol className={`space-y-2 ${className}`}>
      {knowledgePoints.map((kp, idx) => {
        const tp = topicProgressState(status, idx, currentIndex);
        const score = scoresByStep[idx];
        const attempted = attemptedQuizSteps.has(idx);

        const stageLabel =
          tp === "done"
            ? t("guide.outline.stage_done")
            : tp === "active"
              ? t("guide.outline.stage_active")
              : t("guide.outline.stage_pending");

        let checkpointLabel = t("guide.outline.checkpoint_none");
        if (score && score.total > 0) {
          const ratio = score.correct / score.total;
          if (ratio >= 1) checkpointLabel = t("guide.outline.checkpoint_pass");
          else if (ratio >= 0.5)
            checkpointLabel = t("guide.outline.checkpoint_partial");
          else checkpointLabel = t("guide.outline.checkpoint_fail");
        } else if (attempted) {
          checkpointLabel = t("guide.outline.checkpoint_attempted");
        } else if (tp === "done") {
          checkpointLabel = t("guide.outline.checkpoint_skipped");
        }

        return (
          <li
            key={idx}
            aria-current={tp === "active" ? "step" : undefined}
            className={`rounded-xl border px-2.5 py-2 transition-colors ${
              tp === "active"
                ? "border-indigo-300 dark:border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40"
                : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40"
            }`}
          >
            <div className="flex gap-2">
              <CheckpointIcon topicState={tp} score={score} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-1">
                  <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 tabular-nums pt-0.5">
                    {idx + 1}
                  </span>
                </div>
                <p className="text-xs font-medium text-slate-800 dark:text-slate-100 leading-snug line-clamp-3">
                  {kp.knowledge_title}
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {stageLabel}
                  {" · "}
                  <span className="sr-only">
                    {t("guide.outline.checkpoint_sr")}
                  </span>
                  {checkpointLabel}
                </p>
                <MilestoneSegmentBar
                  ariaLabel={t("guide.outline.milestone_legend_sr")}
                  segments={outlineMilestoneSegments(
                    idx,
                    status,
                    currentIndex,
                    attempted,
                    score,
                  )}
                />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export default function GuideOutlinePanel({
  knowledgePoints,
  currentIndex,
  status,
  collapsed,
  onToggleCollapsed,
  attemptedQuizSteps,
  scoresByStep,
  className = "",
  variant = "sidebar",
  onDrawerClose,
}: GuideOutlinePanelProps) {
  const { t } = useTranslation();

  if (knowledgePoints.length === 0) return null;

  const isDrawer = variant === "drawer";
  const isEmbedded = variant === "embedded";
  const isIntegrated = variant === "integrated";
  const isMerged = variant === "merged";

  const widthClasses = isDrawer
    ? "w-full min-w-0 max-w-none border-l-0 shadow-none"
    : isEmbedded || isIntegrated || isMerged
      ? "w-full min-w-0 max-w-none"
      : collapsed
        ? "w-11 min-w-[2.75rem]"
        : "w-[min(280px,34vw)] min-w-[220px]";

  const shellClasses = isIntegrated || isMerged
    ? "border-0 shadow-none bg-transparent"
    : isEmbedded
      ? "rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm"
      : isDrawer
        ? "border-0 bg-white dark:bg-slate-900 shadow-none"
        : "border-l border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-[inset_1px_0_0_rgba(148,163,184,0.15)]";

  const heightClasses =
    isMerged
      ? "min-h-0 shrink-0"
      : isIntegrated && !collapsed
        ? "max-h-[min(32vh,280px)] shrink-0"
        : isIntegrated && collapsed
          ? "min-h-0 shrink-0"
          : isEmbedded && !collapsed
            ? "max-h-[min(42vh,380px)]"
            : !isEmbedded && !isIntegrated
              ? "h-full min-h-0"
              : "min-h-0";

  const asideOverflow = isMerged ? "overflow-visible" : "overflow-hidden";

  return (
    <aside
      className={`flex-shrink-0 flex flex-col ${shellClasses} transition-[width,min-width] duration-300 ease-out ${asideOverflow} ${heightClasses} ${widthClasses} ${className}`}
      aria-label={t("guide.outline.nav_label")}
    >
      <div
        className={`flex-shrink-0 flex items-center justify-between gap-1 border-b border-slate-200 dark:border-slate-700 ${
          isIntegrated || isMerged ? "px-2 py-1.5 bg-slate-50/40 dark:bg-slate-800/40" : "px-2 py-2"
        }`}
      >
        {(!collapsed || isDrawer || isEmbedded || isIntegrated || isMerged) && (
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate pl-1">
            {t("guide.outline.title")}
          </span>
        )}
        {isDrawer && onDrawerClose ? (
          <ModalCloseButton onClick={onDrawerClose} absolute={false} className="ml-auto" />
        ) : (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="ml-auto p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 transition-colors"
            title={
              collapsed ? t("guide.outline.expand") : t("guide.outline.collapse")
            }
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronLeft className="w-4 h-4" aria-hidden />
            ) : (
              <ChevronRight className="w-4 h-4" aria-hidden />
            )}
          </button>
        )}
      </div>

      {!collapsed && (
        <nav
          className={
            isMerged
              ? "py-2 px-2 pb-1"
              : "flex-1 min-h-0 overflow-y-auto py-2 px-2"
          }
        >
          <GuideOutlineStepList
            knowledgePoints={knowledgePoints}
            currentIndex={currentIndex}
            status={status}
            attemptedQuizSteps={attemptedQuizSteps}
            scoresByStep={scoresByStep}
          />
        </nav>
      )}

      {(collapsed && !isDrawer && !isEmbedded && !isIntegrated && !isMerged) && (
        <div className="flex-1 flex flex-col items-center pt-2 pb-4 gap-2 px-1 overflow-hidden">
          <span className="text-[10px] font-semibold text-slate-400 writing-vertical-rl rotate-180 uppercase tracking-widest select-none">
            {t("guide.outline.collapsed_axis")}
          </span>
        </div>
      )}
    </aside>
  );
}
