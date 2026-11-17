import {
  assignmentSummaryCounts,
  isAssignmentFullySubmitted,
  matchesAssignmentFilterTab,
  type AssignmentFilterTab,
} from "@/lib/assignmentListUi";
import type { QuizOut } from "@/services/lmsApi";
import {
  quizRowStyles,
  quizStatusPillLabel,
} from "@/lib/quizListUi";
import type { AssignmentItem } from "@/services/lmsApi";

export type QuizHubTab = "draft" | "ready" | "live" | "completed";
export type ReadyFilter = "not_assigned" | "all";
export type LiveFilter = AssignmentFilterTab;

export function normalizeQuizHubTab(value: string | null): QuizHubTab {
  if (value === "draft") return "draft";
  if (value === "ready" || value === "published") return "ready";
  if (value === "completed") return "completed";
  return "live";
}

export function normalizeReadyFilter(value: string | null): ReadyFilter {
  return value === "all" ? "all" : "not_assigned";
}

export function normalizeLiveFilter(value: string | null): LiveFilter {
  if (value === "due_today") return "due_today";
  if (value === "this_week") return "this_week";
  if (value === "completed") return "completed";
  return "all";
}

export function assignmentsByQuizId(
  assignments: AssignmentItem[],
): Map<string, AssignmentItem[]> {
  const map = new Map<string, AssignmentItem[]>();
  for (const a of assignments) {
    const qid = a.quiz_id;
    if (!qid) continue;
    const list = map.get(qid) ?? [];
    list.push(a);
    map.set(qid, list);
  }
  return map;
}

export function publishedQuizzes(quizzes: QuizOut[]): QuizOut[] {
  return quizzes.filter((q) => q.status === "published");
}

export function readyNotAssignedQuizzes(
  quizzes: QuizOut[],
  byQuiz: Map<string, AssignmentItem[]>,
): QuizOut[] {
  return publishedQuizzes(quizzes).filter(
    (q) => !(byQuiz.get(q.id)?.length ?? 0),
  );
}

export function activeAssignments(assignments: AssignmentItem[]): AssignmentItem[] {
  return assignments.filter((a) => !isAssignmentFullySubmitted(a));
}

export function completedAssignments(
  assignments: AssignmentItem[],
): AssignmentItem[] {
  return assignments.filter((a) => isAssignmentFullySubmitted(a));
}

export function quizHubSummaryCounts(
  quizzes: QuizOut[],
  assignments: AssignmentItem[],
  readyNotAssignedCount: number,
) {
  return {
    draft: quizzes.filter((q) => q.status === "draft").length,
    ready: readyNotAssignedCount,
    live: activeAssignments(assignments).length,
    completed: completedAssignments(assignments).length,
  };
}

export function quizHubTabCounts(
  quizzes: QuizOut[],
  assignments: AssignmentItem[],
  readyNotAssignedCount: number,
) {
  const draft = quizzes.filter((q) => q.status === "draft").length;
  const live = activeAssignments(assignments).length;
  const completed = completedAssignments(assignments).length;
  return {
    draft,
    ready: readyNotAssignedCount,
    live,
    completed,
  };
}

export function quizHubStatusPillLabel(
  quiz: QuizOut,
  tab: QuizHubTab,
  assignedToClass: boolean,
): string {
  if (tab === "ready" && quiz.status === "published") {
    return assignedToClass ? "In class" : "Not assigned";
  }
  return quizStatusPillLabel(quiz);
}

export function quizHubStatusPillClass(
  quiz: QuizOut,
  tab: QuizHubTab,
  assignedToClass: boolean,
): string {
  if (tab === "ready" && quiz.status === "published") {
    return assignedToClass
      ? "bg-indigo-50 text-indigo-700 ring-indigo-100"
      : "bg-emerald-50 text-emerald-700 ring-emerald-100";
  }
  return quizRowStyles(quiz).pill;
}

export function liveAssignmentSummary(assignments: AssignmentItem[]) {
  const active = activeAssignments(assignments);
  return assignmentSummaryCounts(active);
}

export { matchesAssignmentFilterTab };
