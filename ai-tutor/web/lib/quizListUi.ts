import {
  assignmentDisplayTitle,
  assignmentSubjectBadgeClass,
} from "@/lib/assignmentListUi";
import type { QuizOut } from "@/services/lmsApi";

export type QuizFilterTab = "all" | "draft" | "published";

export function quizSummaryCounts(quizzes: QuizOut[]) {
  let draft = 0;
  let published = 0;
  for (const q of quizzes) {
    if (q.status === "draft") draft += 1;
    else if (q.status === "published") published += 1;
  }
  return { draft, published, total: quizzes.length };
}

export function quizTabCounts(quizzes: QuizOut[]) {
  return {
    all: quizzes.length,
    draft: quizzes.filter((q) => q.status === "draft").length,
    published: quizzes.filter((q) => q.status === "published").length,
  };
}

export function matchesQuizFilterTab(q: QuizOut, tab: QuizFilterTab): boolean {
  if (tab === "all") return true;
  return q.status === tab;
}

export function quizDisplayTitle(title: string, subject?: string | null): string {
  return assignmentDisplayTitle(title, subject);
}

export function quizSubjectBadgeClass(subject?: string | null): string {
  return assignmentSubjectBadgeClass(subject);
}

export function questionCount(q: QuizOut): number {
  return q.questions?.length ?? 0;
}

export function formatQuizDate(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function quizRowMetaLine(q: QuizOut): string {
  const parts = [
    `${questionCount(q)} question${questionCount(q) === 1 ? "" : "s"}`,
    `${q.total_marks} marks`,
  ];
  if (q.duration_mins > 0) parts.push(`${q.duration_mins} min`);
  if (q.created_at) parts.push(formatQuizDate(q.created_at));
  return parts.join(" · ");
}

export function quizStatusPillLabel(q: QuizOut): string {
  return q.status === "published" ? "Published" : "Draft";
}

export function quizRowStyles(q: QuizOut) {
  if (q.status === "published") {
    return {
      pill: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      iconWrap: "bg-violet-50 text-violet-600",
      rowHover: "hover:bg-violet-50/60",
      rowAccent: "border-l-[3px] border-l-transparent",
    };
  }
  return {
    pill: "bg-amber-50 text-amber-800 ring-amber-100",
    iconWrap: "bg-amber-50 text-amber-600",
    rowHover: "hover:bg-amber-50/60",
    rowAccent: "border-l-[3px] border-l-amber-300",
  };
}
