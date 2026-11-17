import {
  assignmentDisplayTitle,
  assignmentSubjectBadgeClass,
} from "@/lib/assignmentListUi";
import type { PaperDistributionOut, PaperOut } from "@/services/lmsApi";

export type PaperTab = "draft" | "ready" | "live" | "grade";
export type ReadyFilter = "not_sent" | "all";

export function paperQuestionStats(p: PaperOut): { filled: number; total: number } {
  const sections = Array.isArray((p.sections as { sections?: unknown[] })?.sections)
    ? ((p.sections as { sections: Array<{ questions?: Array<{ text?: string }> }> })
        .sections)
    : [];
  let filled = 0;
  let total = 0;
  for (const sec of sections) {
    for (const q of sec.questions || []) {
      total += 1;
      if (String(q.text || "").trim()) filled += 1;
    }
  }
  return { filled, total };
}

export function formatPaperDate(iso?: string | null): string {
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

export function paperDisplayTitle(title: string, subject?: string | null): string {
  return assignmentDisplayTitle(title, subject);
}

export function paperSubjectBadgeClass(subject?: string | null): string {
  return assignmentSubjectBadgeClass(subject);
}

export function distributionModeLabel(d: PaperDistributionOut): string {
  if (d.allow_online_exam) return "Online test";
  if (d.allow_written_submission) return "Written paper";
  if (d.allow_online_practice) return "MCQ practice";
  return "Download";
}

export function paperRowMetaLine(
  p: PaperOut,
  filled: number,
  total: number,
): string {
  const parts = [
    p.board,
    `${filled}/${total} questions`,
    `${p.total_marks} marks`,
  ];
  if (p.duration_mins > 0) parts.push(`${p.duration_mins} min`);
  if (p.created_at) parts.push(formatPaperDate(p.created_at));
  return parts.join(" · ");
}

export function distributionRowMetaLine(d: PaperDistributionOut): string {
  const parts = [
    d.class_id,
    distributionModeLabel(d),
    `Due ${d.due_label}`,
  ];
  if (d.created_at) parts.push(`Sent ${formatPaperDate(d.created_at)}`);
  const pending = d.pending_grade_count ?? 0;
  if (pending > 0) parts.push(`${pending} awaiting grade`);
  return parts.join(" · ");
}

export function paperSummaryCounts(
  rows: PaperOut[],
  distributions: PaperDistributionOut[],
  readyNotSentCount: number,
) {
  return {
    draft: rows.filter((r) => r.status === "draft").length,
    ready: readyNotSentCount,
    live: distributions.length,
    grade: distributions.filter((d) => (d.pending_grade_count ?? 0) > 0).length,
  };
}

export function paperTabCounts(
  rows: PaperOut[],
  distributions: PaperDistributionOut[],
  readyNotSentCount: number,
) {
  const draft = rows.filter((r) => r.status === "draft").length;
  const grade = distributions.filter((d) => (d.pending_grade_count ?? 0) > 0).length;
  return {
    draft,
    ready: readyNotSentCount,
    live: distributions.length,
    grade,
  };
}

export function paperRowStyles(p: PaperOut) {
  if (p.status === "published") {
    return {
      pill: "bg-emerald-50 text-emerald-700 ring-emerald-100",
      iconWrap: "bg-emerald-50 text-emerald-600",
      rowHover: "hover:bg-emerald-50/60",
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

export function distributionRowStyles(isGradeTab: boolean) {
  if (isGradeTab) {
    return {
      pill: "bg-amber-50 text-amber-800 ring-amber-100",
      iconWrap: "bg-amber-50 text-amber-600",
      rowHover: "hover:bg-amber-50/60",
      rowAccent: "border-l-[3px] border-l-amber-300",
    };
  }
  return {
    pill: "bg-indigo-50 text-indigo-700 ring-indigo-100",
    iconWrap: "bg-indigo-50 text-indigo-600",
    rowHover: "hover:bg-indigo-50/60",
    rowAccent: "border-l-[3px] border-l-transparent",
  };
}

export function paperStatusPillLabel(
  p: PaperOut,
  tab: PaperTab,
  sentToClass: boolean,
): string {
  if (tab === "ready" && p.status === "published") {
    return sentToClass ? "In class" : "Not sent";
  }
  return p.status === "published" ? "Published" : "Draft";
}

export function paperStatusPillClass(
  p: PaperOut,
  tab: PaperTab,
  sentToClass: boolean,
): string {
  if (tab === "ready" && p.status === "published") {
    return sentToClass
      ? "bg-indigo-50 text-indigo-700 ring-indigo-100"
      : "bg-emerald-50 text-emerald-700 ring-emerald-100";
  }
  return paperRowStyles(p).pill;
}
