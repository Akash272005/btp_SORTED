"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Download, Eye, Loader2, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";
import PortalBuilderHeader from "@/components/lms/portal/PortalBuilderHeader";
import { portalDetail } from "@/lib/portalDetailUi";
import { portalList } from "@/lib/portalListUi";
import { apiUrl } from "@/lib/api";
import NCERTRagDropdown from "@/components/NCERTRagDropdown";
import NumericStepper from "@/components/lms/teacher/NumericStepper";
import PaperQuestionFormModal, {
  type PaperQuestionDraft,
} from "@/components/lms/teacher/PaperQuestionFormModal";
import PaperStartNewConfirmDialog from "@/components/lms/teacher/PaperStartNewConfirmDialog";
import LmsToast from "@/components/lms/LmsToast";
import { useLmsToast } from "@/hooks/useLmsToast";
import { parseExamCalendarPaperParams } from "@/lib/examCalendarPaperLink";
import { parseNcertPathFromUrl } from "@/lib/teacherQuiz";
import {
  createTeacherPaper,
  linkTeacherExamCalendarSlotPaper,
  fetchPaperBlueprintPresets,
  fetchTeacherPaperAnswerKey,
  fetchTeacherPaper,
  generatePaperFromNcert,
  streamPaperFromNcert,
  type GenerateFromNcertResult,
  type PaperGenerateSlot,
  type PaperStreamProgress,
  generateTeacherAnswerKeyPdf,
  generateTeacherQuestionPaperPdf,
  publishTeacherPaper,
  updateTeacherPaper,
  type PaperOut,
} from "@/services/lmsApi";
import { formatMcqAnswerDisplay, formatMcqOptionDisplay } from "@/lib/quizQuestions";
import { formatGenerationDuration } from "@/lib/teacherQuiz";

type ExamType =
  | "chapter_test"
  | "unit_test"
  | "half_yearly"
  | "annual"
  | "mcq_only"
  | "practice_worksheet";

type PaperQuestion = {
  id: string;
  type: string;
  text: string;
  marks: number;
  options?: string[];
  correct_answer?: string;
  source?: string;
};

type PaperSection = {
  id: string;
  title: string;
  type: string;
  marks_each: number;
  questions: PaperQuestion[];
};

type ManifestFiles = Record<
  string,
  Record<string, { url: string; label: string }[]>
>;

const EXAM_LABELS: Record<ExamType, string> = {
  chapter_test: "Chapter Test",
  unit_test: "Unit Test",
  half_yearly: "Half Yearly",
  annual: "Final Exam",
  mcq_only: "MCQ Practice",
  practice_worksheet: "Practice Sheet",
};
const MARK_MATCH_TOLERANCE = 0.25;

function defaultPaperTitle(ncertClass: string, subject: string, exam: ExamType): string {
  return `Class ${ncertClass} ${subject} — ${EXAM_LABELS[exam]}`;
}

/** CBSE marks per section type (MCQ 1 · Short 3 · Long 5). */
function cbseMarksForSectionType(sectionType: string): number {
  const st = sectionType.toLowerCase();
  if (st === "long") return 5;
  if (st === "short") return 3;
  return 1;
}

function presetMarksForSection(sec: PaperSection): number {
  return cbseMarksForSectionType(String(sec.type || "mcq"));
}

function formatMarksLabel(marks: number): string {
  const m = Number(marks) || 0;
  return `${m} mark${m === 1 ? "" : "s"}`;
}

/** Copy each section's marks_each onto every question (keeps custom stepper values). */
function syncQuestionMarksFromSections(sections: PaperSection[]): PaperSection[] {
  return sections.map((sec) => {
    const m = Number(sec.marks_each) || presetMarksForSection(sec);
    return {
      ...sec,
      questions: sec.questions.map((q) => ({ ...q, marks: m })),
    };
  });
}

function makeSectionsFromPreset(
  preset: Record<string, any>,
  opts?: { zeroOutCounts?: boolean; zeroOutMarksEach?: boolean },
): PaperSection[] {
  const zeroOutCounts = Boolean(opts?.zeroOutCounts);
  const zeroOutMarksEach = Boolean(opts?.zeroOutMarksEach);
  const plan = Array.isArray(preset?.section_plan) ? preset.section_plan : [];
  return plan.map((s: any) => {
    const sectionId = String(s.section_id || "A");
    const count = zeroOutCounts ? 0 : Number(s.count || 0);
    const qType = String(s.type || "mcq");
    const marksEach = zeroOutMarksEach ? 0 : cbseMarksForSectionType(qType);
    return {
      id: sectionId,
      title: `Section ${sectionId} — ${qType.toUpperCase()}`,
      type: qType,
      marks_each: marksEach,
      questions: Array.from({ length: count }).map((_, idx) => ({
        id: `${sectionId}${idx + 1}`,
        type: qType,
        text: "",
        marks: marksEach,
        source: "slot",
      })),
    };
  });
}

function countUnallocatedMarks(total: number, sections: PaperSection[]): number {
  const allocated = sections
    .flatMap((s) => s.questions)
    .reduce((acc, q) => acc + (q.text.trim() ? q.marks : 0), 0);
  const delta = Number((total - allocated).toFixed(2));
  if (Math.abs(delta) <= MARK_MATCH_TOLERANCE) return 0;
  return Math.max(0, delta);
}

function hasEmptySlots(sections: PaperSection[]): boolean {
  return sections.some((s) => s.questions.some((q) => !q.text.trim()));
}

function buildPaperGenerateSlots(sections: PaperSection[]): PaperGenerateSlot[] {
  return sections
    .map((sec) => {
      const emptyCount = sec.questions.filter((q) => !q.text.trim()).length;
      if (!emptyCount) return null;
      return {
        section_id: sec.id,
        section_type: sec.type,
        count: emptyCount,
      };
    })
    .filter((s): s is PaperGenerateSlot => s !== null);
}

function paperGenProgressLabel(stage: string, current: number, total: number): string {
  if (stage === "researching") return "Researching chapter…";
  if (stage === "planning") return "Planning paper…";
  if (stage === "generating" && total > 0) {
    return `Writing questions ${current}/${total}…`;
  }
  if (stage === "complete") return "Finishing…";
  return "Generating…";
}

function applyGeneratedPaperQuestions(
  sections: PaperSection[],
  generated: Array<Record<string, unknown>>,
): PaperSection[] {
  const bySection = new Map<string, Array<Record<string, unknown>>>();
  for (const g of generated) {
    const sid = String(g.section_id || "");
    if (!sid) continue;
    const list = bySection.get(sid) || [];
    list.push(g);
    bySection.set(sid, list);
  }

  return sections.map((sec) => {
    const queue = [...(bySection.get(sec.id) || [])];
    return {
      ...sec,
      questions: sec.questions.map((q) => {
        if (q.text.trim()) return q;
        const g = queue.shift();
        if (!g) return q;
        const qType = String(g.type || sec.type).toLowerCase();
        const isMcq = qType === "mcq";
        const slotMarks = Number(sec.marks_each) || presetMarksForSection(sec);
        return {
          ...q,
          id: String(g.id || q.id),
          text: String(g.text || ""),
          type: qType,
          marks: slotMarks,
          options:
            isMcq && Array.isArray(g.options)
              ? (g.options as string[]).map(String)
              : undefined,
          correct_answer: g.correct_answer ? String(g.correct_answer) : undefined,
          source: "ncert_ai",
        };
      }),
    };
  });
}

function allocateCountsAcrossSections(weights: number[], target: number): number[] {
  if (!weights.length) return [];
  if (target <= 0) return weights.map(() => 0);

  const totalWeight = weights.reduce((acc, w) => acc + (w > 0 ? w : 0), 0) || weights.length;
  const raw = weights.map((w) => (target * (w > 0 ? w : 1)) / totalWeight);
  const counts = raw.map((x) => Math.floor(x));
  let used = counts.reduce((acc, n) => acc + n, 0);
  const remainders = raw
    .map((x, i) => ({ i, r: x - Math.floor(x) }))
    .sort((a, b) => b.r - a.r);
  let idx = 0;
  while (used < target && idx < remainders.length) {
    counts[remainders[idx].i] += 1;
    used += 1;
    idx += 1;
  }
  return counts;
}

function sumSectionSlotMarks(sections: PaperSection[]): number {
  return sections
    .flatMap((s) => s.questions)
    .reduce((acc, q) => acc + (Number(q.marks) || 0), 0);
}

/** School papers usually use an even maximum marks (20, 30, 40…). */
function snapEvenMarks(n: number): number {
  const v = Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  if (v <= 0) return 0;
  return v % 2 === 0 ? v : v - 1;
}

/** Nudge one slot by ±1 so slot marks sum to an even total (keeps preset structure). */
function normalizeSectionsEvenTotal(sections: PaperSection[]): PaperSection[] {
  const total = sumSectionSlotMarks(sections);
  if (total <= 0 || total % 2 === 0) return sections;

  const patch = (
    secId: string,
    qIdx: number,
    delta: number,
    base: PaperSection[],
  ): PaperSection[] =>
    base.map((sec) => {
      if (sec.id !== secId) return sec;
      const questions = sec.questions.map((q, i) => {
        if (i !== qIdx) return q;
        const next = Math.max(1, (Number(q.marks) || 1) + delta);
        return { ...q, marks: next };
      });
      return { ...sec, questions };
    });

  const byMarksDesc = [...sections].sort(
    (a, b) => (Number(b.marks_each) || 0) - (Number(a.marks_each) || 0),
  );
  for (const sec of byMarksDesc) {
    for (let i = sec.questions.length - 1; i >= 0; i--) {
      const m = Number(sec.questions[i]?.marks) || 0;
      if (m > 1) {
        const next = patch(sec.id, i, -1, sections);
        if (sumSectionSlotMarks(next) % 2 === 0) return next;
      }
    }
  }

  const byMarksAsc = [...sections].sort(
    (a, b) => (Number(a.marks_each) || 0) - (Number(b.marks_each) || 0),
  );
  for (const sec of byMarksAsc) {
    if (!sec.questions.length) continue;
    const next = patch(sec.id, 0, 1, sections);
    if (sumSectionSlotMarks(next) % 2 === 0) return next;
  }

  return sections;
}

function resizeSectionQuestions(sec: PaperSection, target: number): PaperSection {
  const count = Math.max(0, Math.floor(Number.isFinite(target) ? target : 0));
  const marks = Number(sec.marks_each) || 0;
  const questions: PaperQuestion[] = Array.from({ length: count }).map((_, idx) => {
    const prev = sec.questions[idx];
    if (prev) {
      return {
        ...prev,
        id: `${sec.id}${idx + 1}`,
        type: prev.type || sec.type,
        marks: prev.text.trim() ? Number(prev.marks) || marks : marks,
      };
    }
    return {
      id: `${sec.id}${idx + 1}`,
      type: sec.type,
      text: "",
      marks,
      source: "slot",
    };
  });
  return { ...sec, questions };
}

function resolveSectionMarksEach(
  sec: PaperSection,
  presetPlan: Array<Record<string, unknown>>,
  uniformMarksEach: number | null,
): number {
  if (uniformMarksEach != null && uniformMarksEach > 0) {
    return uniformMarksEach;
  }
  if (Number(sec.marks_each) > 0) {
    return Number(sec.marks_each);
  }
  return presetMarksForSection(sec);
}

function detectUniformMarksOverride(sections: PaperSection[]): number | null {
  if (!sections.length) return null;
  const sectionMarks = sections
    .map((s) => Number(s.marks_each) || 0)
    .filter((m) => m > 0);
  if (!sectionMarks.length) return null;
  const distinct = new Set(sectionMarks);
  if (distinct.size !== 1) return null;
  const uniform = [...distinct][0];
  if (sections.length === 1) {
    const preset = presetMarksForSection(sections[0]);
    return uniform !== preset ? uniform : null;
  }
  const presetDistinct = new Set(sections.map((s) => presetMarksForSection(s)));
  if (presetDistinct.size > 1) return uniform;
  return null;
}

function applyPresetMarksPerSection(sections: PaperSection[]): PaperSection[] {
  return sections.map((sec) => {
    const marks = presetMarksForSection(sec);
    return {
      ...sec,
      marks_each: marks,
      questions: sec.questions.map((q) => ({ ...q, marks })),
    };
  });
}

function rebuildSectionsQuestionSlots(
  sections: PaperSection[],
  target: number,
  presetPlan: Array<Record<string, unknown>>,
  uniformMarksEach: number | null,
): PaperSection[] {
  const weights = sections.map((sec) => {
    const row = presetPlan.find((p) => String(p.section_id || "") === sec.id);
    return row ? Number(row.count || 0) : 1;
  });
  const counts = allocateCountsAcrossSections(weights, target);
  return sections.map((sec, i) => {
    const slotCount = counts[i] || 0;
    const marks = resolveSectionMarksEach(sec, presetPlan, uniformMarksEach);
    return resizeSectionQuestions({ ...sec, marks_each: marks }, slotCount);
  });
}

export default function PaperBuilderWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const paperIdParam = searchParams.get("paper_id");
  const paperId = paperIdParam ? Number(paperIdParam) : null;
  const examCalendarPrefill = useMemo(
    () => parseExamCalendarPaperParams(searchParams),
    [searchParams],
  );
  const { toast, showError, showSuccess } = useLmsToast();

  const [presets, setPresets] = useState<Record<string, Record<string, any>>>({});
  const [manifest, setManifest] = useState<ManifestFiles | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState<{
    stage: string;
    current: number;
    total: number;
  } | null>(null);
  const streamBufferRef = useRef<Map<number, Record<string, unknown>>>(new Map());
  const streamNextIdxRef = useRef(0);
  const generateRunIdRef = useRef(0);

  const [savedPaperId, setSavedPaperId] = useState<number | null>(paperId);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("Science");
  const [board, setBoard] = useState("CBSE");
  const [ncertClass, setNcertClass] = useState("8");
  const [examType, setExamType] = useState<ExamType>("half_yearly");
  const [durationMins, setDurationMins] = useState(180);
  const [totalMarks, setTotalMarks] = useState(80);
  const [chapterLabel, setChapterLabel] = useState("");
  const [pdfUrl, setPdfUrl] = useState("");
  const [sections, setSections] = useState<PaperSection[]>([]);
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [openingKey, setOpeningKey] = useState(false);
  const [generatingQuestionPdf, setGeneratingQuestionPdf] = useState(false);
  const [generatingAnswerKeyPdf, setGeneratingAnswerKeyPdf] = useState(false);
  const [sectionGeneratingId, setSectionGeneratingId] = useState<string | null>(null);
  const [questionGeneratingId, setQuestionGeneratingId] = useState<string | null>(null);
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const lastAutosaveKeyRef = useRef<string>("");
  const [showFullPreview, setShowFullPreview] = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewMinimized, setPreviewMinimized] = useState(false);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [answerKeyExpanded, setAnswerKeyExpanded] = useState(false);
  const [answerKeyMinimized, setAnswerKeyMinimized] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [showStartNewConfirm, setShowStartNewConfirm] = useState(false);
  const [publishedBannerDismissed, setPublishedBannerDismissed] = useState(false);
  const [manualSectionId, setManualSectionId] = useState<string | null>(null);
  const [editQuestion, setEditQuestion] = useState<PaperQuestionDraft | null>(null);
  /** When set, every section uses this marks_each; null = CBSE preset per section type (1 / 3 / 5). */
  const [uniformMarksEach, setUniformMarksEach] = useState<number | null>(null);

  const selectedPreset = useMemo(
    () => (presets[examType] || {}) as Record<string, any>,
    [presets, examType],
  );

  useEffect(() => {
    fetch("/ncert/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setManifest(data as ManifestFiles | null))
      .catch(() => setManifest(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setLoading(true);
      try {
        const presetRows = await fetchPaperBlueprintPresets();
        if (cancelled) return;
        setPresets(presetRows);
        const p = (presetRows[examType] || {}) as Record<string, any>;
        if (!paperId) {
          const pre = examCalendarPrefill;
          const nextExam = (pre.examType as ExamType) || examType;
          const presetRow = (presetRows[nextExam] || p) as Record<string, any>;
          const presetMins = Number(presetRow.duration_mins);
          setDurationMins(
            pre.durationMins && pre.durationMins >= 5
              ? pre.durationMins
              : presetMins >= 5
                ? presetMins
                : 60,
          );
          if (pre.totalMarks && pre.totalMarks > 0) {
            setTotalMarks(pre.totalMarks);
          } else {
            setTotalMarks(0);
          }
          setUniformMarksEach(null);
          if (pre.examType) setExamType(nextExam);
          if (pre.subject) setSubject(pre.subject);
          if (pre.ncertClass) setNcertClass(pre.ncertClass);
          if (pre.chapterLabel) setChapterLabel(pre.chapterLabel);
          if (pre.pdfUrl) setPdfUrl(pre.pdfUrl);
          setSections(
            applyPresetMarksPerSection(
              makeSectionsFromPreset(presetRow, { zeroOutCounts: true }),
            ),
          );
          setTitle(
            pre.title ||
              `Class ${pre.ncertClass || ncertClass} ${pre.subject || subject} — ${EXAM_LABELS[nextExam]}`,
          );
        }
        if (paperId) {
          const paper = await fetchTeacherPaper(paperId);
          if (cancelled) return;
          hydratePaper(paper);
        } else if (!cancelled) {
          setSections((prev) => applyPresetMarksPerSection(prev));
          setUniformMarksEach(null);
        }
      } catch (e) {
        showError(e instanceof Error ? e.message : "Failed to load paper builder");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [paperId]);

  function hydratePaper(paper: PaperOut) {
    setSavedPaperId(paper.id);
    setTitle(paper.title || "");
    setSubject(paper.subject || "Science");
    setBoard(paper.board || "CBSE");
    setExamType((paper.exam_type as ExamType) || "half_yearly");
    setNcertClass(paper.ncert_class || "8");
    setDurationMins(paper.duration_mins || 180);
    setTotalMarks(paper.total_marks || 80);
    const scope = (paper.chapter_scope || {}) as Record<string, string>;
    setChapterLabel(String(scope.chapter_label || ""));
    setPdfUrl(String(scope.pdf_url || ""));
    setStatus((paper.status as "draft" | "published") || "draft");
    const loadedSections = Array.isArray((paper.sections as any)?.sections)
      ? ((paper.sections as any).sections as PaperSection[])
      : [];
    const synced = applyPresetMarksPerSection(loadedSections);
    setSections(synced);
    setUniformMarksEach(null);
    setTotalMarks(sumSectionSlotMarks(synced));
    markAutosaveBaseline(
      JSON.stringify({
        title: paper.title || "",
        subject: paper.subject || "Science",
        board: paper.board || "CBSE",
        examType: (paper.exam_type as ExamType) || "half_yearly",
        ncertClass: paper.ncert_class || "8",
        durationMins: paper.duration_mins || 180,
        totalMarks: paper.total_marks || 80,
        chapterLabel: String(scope.chapter_label || ""),
        pdfUrl: String(scope.pdf_url || ""),
        sections: loadedSections,
      }),
    );
    setAutoSaveState("saved");
  }

  function applyExamPreset(nextExam: ExamType) {
    if (nextExam !== examType && slotStats.filled > 0) {
      const ok = window.confirm(
        "Changing exam type will reset current generated questions. Continue?",
      );
      if (!ok) return;
    }
    setExamType(nextExam);
    setUniformMarksEach(null);
    const p = presets[nextExam] || {};
    setTotalMarks(0);
    const presetMins = Number(p.duration_mins);
    setDurationMins(presetMins >= 5 ? presetMins : 60);
    const plan = Array.isArray(p.section_plan)
      ? (p.section_plan as Array<Record<string, unknown>>)
      : [];
    setSections(
      applyPresetMarksPerSection(makeSectionsFromPreset(p, { zeroOutCounts: true })),
    );
    if (!savedPaperId) {
      setTitle(`Class ${ncertClass} ${subject} — ${EXAM_LABELS[nextExam]}`);
    }
  }

  function resetWorkspace(nextExam: ExamType = "half_yearly") {
    const p = (presets[nextExam] || {}) as Record<string, any>;
    const nextClass = "8";
    const nextSubject = "Science";
    const nextBoard = "CBSE";
    setSavedPaperId(null);
    setStatus("draft");
    setPublishedBannerDismissed(false);
    setExamType(nextExam);
    setUniformMarksEach(null);
    setDurationMins(Number(p.duration_mins || 180));
    setTotalMarks(Number(p.total_marks || 80));
    setSections(
      applyPresetMarksPerSection(makeSectionsFromPreset(p)),
    );
    setTitle(defaultPaperTitle(nextClass, nextSubject, nextExam));
    setSubject(nextSubject);
    setBoard(nextBoard);
    setNcertClass(nextClass);
    setChapterLabel("");
    setPdfUrl("");
    setSectionGeneratingId(null);
    setQuestionGeneratingId(null);
    setAutoSaveState("idle");
    lastAutosaveKeyRef.current = "";
    setShowFullPreview(false);
    setPreviewExpanded(false);
    setPreviewMinimized(false);
    setShowAnswerKey(false);
    setAnswerKeyExpanded(false);
    setAnswerKeyMinimized(false);
    router.replace("/teacher/paper-builder");
  }

  function closeFullPreview() {
    setShowFullPreview(false);
    setPreviewExpanded(false);
    setPreviewMinimized(false);
  }

  function openFullPreview() {
    setPreviewExpanded(false);
    setPreviewMinimized(false);
    setShowFullPreview(true);
  }

  function closeAnswerKey() {
    setShowAnswerKey(false);
    setAnswerKeyExpanded(false);
    setAnswerKeyMinimized(false);
  }

  function openAnswerKey() {
    setAnswerKeyExpanded(false);
    setAnswerKeyMinimized(false);
    setShowAnswerKey(true);
  }

  function workspaceHasContent() {
    const defaultTitle = defaultPaperTitle(ncertClass, subject, examType);
    const filledQuestions = sections
      .flatMap((s) => s.questions)
      .some((q) => q.text.trim());
    return (
      Boolean(savedPaperId) ||
      Boolean(chapterLabel.trim()) ||
      Boolean(pdfUrl.trim()) ||
      title.trim() !== defaultTitle ||
      filledQuestions
    );
  }

  function handleStartNew() {
    if (workspaceHasContent()) {
      setShowStartNewConfirm(true);
      return;
    }
    resetWorkspace("half_yearly");
    showSuccess("New paper started");
  }

  function confirmStartNew() {
    setShowStartNewConfirm(false);
    resetWorkspace("half_yearly");
    showSuccess("New paper started");
  }

  const allocatedMarks = useMemo(
    () =>
      sections
        .flatMap((s) => s.questions)
        .reduce((acc, q) => acc + (q.text.trim() ? q.marks : 0), 0),
    [sections],
  );
  const unallocated = useMemo(
    () => countUnallocatedMarks(totalMarks, sections),
    [totalMarks, sections],
  );
  const hasEmpty = useMemo(() => hasEmptySlots(sections), [sections]);
  const slotStats = useMemo(() => {
    const all = sections.flatMap((s) => s.questions);
    const filled = all.filter((q) => q.text.trim()).length;
    return { total: all.length, filled };
  }, [sections]);
  const slotMarksTotal = useMemo(() => sumSectionSlotMarks(sections), [sections]);
  const presetSectionsTemplate = useMemo(() => {
    const p = presets[examType] || {};
    return applyPresetMarksPerSection(
      makeSectionsFromPreset(p, { zeroOutCounts: true }),
    );
  }, [presets, examType]);
  const removablePresetSections = useMemo(() => {
    const active = new Set(sections.map((s) => s.id));
    return presetSectionsTemplate.filter((s) => !active.has(s.id));
  }, [presetSectionsTemplate, sections]);
  const marksMismatch = useMemo(() => {
    if (!slotStats.total) return false;
    return Math.abs(slotMarksTotal - totalMarks) > MARK_MATCH_TOLERANCE;
  }, [slotMarksTotal, totalMarks, slotStats.total]);
  const publishBlockedReason = useMemo(() => {
    if (slotStats.filled === 0) {
      return "Add at least one question before publishing.";
    }
    if (hasEmpty) {
      return "Fill every question slot in the blueprint before publishing.";
    }
    if (slotStats.total > 0 && marksMismatch) {
      return `Question marks total (${slotMarksTotal}) must match paper total (${totalMarks}).`;
    }
    return null;
  }, [
    slotStats.filled,
    slotStats.total,
    hasEmpty,
    marksMismatch,
    slotMarksTotal,
    totalMarks,
  ]);
  const canPublish = publishBlockedReason === null;
  function applyTotalMarks(next: number) {
    setTotalMarks(snapEvenMarks(next));
  }

  function applyUniformMarksAll(next: number) {
    const nextMarks = Math.max(
      0,
      Number((Number.isFinite(next) ? next : 0).toFixed(1)),
    );
    if (nextMarks <= 0) {
      setUniformMarksEach(null);
      setSections((prev) => {
        const plan = Array.isArray(selectedPreset.section_plan)
          ? (selectedPreset.section_plan as Array<Record<string, unknown>>)
          : [];
        const nextSections = applyPresetMarksPerSection(prev);
        setTotalMarks(snapEvenMarks(sumSectionSlotMarks(nextSections)));
        return nextSections;
      });
      return;
    }
    setUniformMarksEach(nextMarks);
    setSections((prev) => {
      let nextSections = prev.map((sec) => ({
        ...sec,
        marks_each: nextMarks,
        questions: sec.questions.map((q) => ({ ...q, marks: nextMarks })),
      }));
      setTotalMarks(sumSectionSlotMarks(nextSections));
      return nextSections;
    });
  }

  function applySectionMarksEach(sectionId: string, next: number) {
    const nextMarks = Math.max(
      0,
      Number((Number.isFinite(next) ? next : 0).toFixed(1)),
    );
    setUniformMarksEach(null);
    setSections((prev) => {
      let nextSections = prev.map((sec) =>
        sec.id !== sectionId
          ? sec
          : {
              ...sec,
              marks_each: nextMarks,
              questions: sec.questions.map((q) => ({ ...q, marks: nextMarks })),
            },
      );
      setTotalMarks(sumSectionSlotMarks(nextSections));
      return nextSections;
    });
  }

  function applyQuestionCount(next: number) {
    const target = Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));
    setSections((prev) => {
      if (!prev.length) return prev;
      const plan = Array.isArray(selectedPreset.section_plan)
        ? (selectedPreset.section_plan as Array<Record<string, unknown>>)
        : [];
      let nextSections = rebuildSectionsQuestionSlots(
        prev,
        target,
        plan,
        uniformMarksEach,
      );
      nextSections = syncQuestionMarksFromSections(nextSections);
      setTotalMarks(snapEvenMarks(sumSectionSlotMarks(nextSections)));
      return nextSections;
    });
  }

  function applySectionQuestionCount(sectionId: string, next: number) {
    const target = Math.max(0, Math.floor(Number.isFinite(next) ? next : 0));
    setSections((prev) => {
      const plan = Array.isArray(selectedPreset.section_plan)
        ? (selectedPreset.section_plan as Array<Record<string, unknown>>)
        : [];
      const nextSections = prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const marks = resolveSectionMarksEach(sec, plan, uniformMarksEach);
        return resizeSectionQuestions({ ...sec, marks_each: marks }, target);
      });
      const synced = syncQuestionMarksFromSections(nextSections);
      setTotalMarks(snapEvenMarks(sumSectionSlotMarks(synced)));
      return synced;
    });
  }

  function removePaperSection(sectionId: string) {
    setSections((prev) => {
      if (prev.length <= 1) {
        showError("Keep at least one section on the paper.");
        return prev;
      }
      const target = prev.find((s) => s.id === sectionId);
      if (!target) return prev;
      const hasFilled = target.questions.some((q) => q.text.trim());
      if (hasFilled) {
        const ok = window.confirm(
          `Remove Section ${sectionId}? Questions already generated in this section will be deleted.`,
        );
        if (!ok) return prev;
      }
      const next = prev.filter((s) => s.id !== sectionId);
      setTotalMarks(sumSectionSlotMarks(next));
      return next;
    });
  }

  function restorePaperSection(sectionId: string) {
    const tmpl = presetSectionsTemplate.find((s) => s.id === sectionId);
    if (!tmpl) return;
    setSections((prev) => {
      if (prev.some((s) => s.id === sectionId)) return prev;
      const merged = [...prev, { ...tmpl, questions: [...tmpl.questions] }].sort(
        (a, b) => a.id.localeCompare(b.id),
      );
      setTotalMarks(sumSectionSlotMarks(merged));
      return merged;
    });
  }

  function applyDuration(next: number) {
    const raw = Math.floor(Number.isFinite(next) ? next : 60);
    const mins = Math.min(360, Math.max(5, raw));
    setDurationMins(mins);
  }

  const chapterCount = useMemo(() => {
    const label = chapterLabel.trim();
    if (!label) return 0;
    return label.split(",").map((s) => s.trim()).filter(Boolean).length;
  }, [chapterLabel]);
  const chapterSummary = useMemo(() => {
    const parts = chapterLabel
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!parts.length) return "No chapter selected";
    if (parts.length <= 2) return parts.join(", ");
    return `${parts.slice(0, 2).join(", ")} +${parts.length - 2} more`;
  }, [chapterLabel]);
  const hasScopeReady = Boolean(chapterLabel.trim() && pdfUrl);

  const autosaveKey = useMemo(
    () =>
      JSON.stringify({
        title,
        subject,
        board,
        examType,
        ncertClass,
        durationMins,
        totalMarks,
        chapterLabel,
        pdfUrl,
        sections,
      }),
    [
      title,
      subject,
      board,
      examType,
      ncertClass,
      durationMins,
      totalMarks,
      chapterLabel,
      pdfUrl,
      sections,
    ],
  );

  function markAutosaveBaseline(key: string = autosaveKey) {
    lastAutosaveKeyRef.current = key;
  }

  async function saveDraft(
    publish = false,
    opts?: { silent?: boolean; autoSave?: boolean },
  ): Promise<number | null> {
    const silent = Boolean(opts?.silent);
    const isAutoSave = Boolean(opts?.autoSave);
    const filledCount = sections
      .flatMap((s) => s.questions)
      .filter((q) => q.text.trim()).length;

    if (publish) {
      if (filledCount === 0) {
        if (!silent) {
          showError("Add at least one question before publishing.");
        }
        return null;
      }
      if (hasEmptySlots(sections)) {
        if (!silent) {
          showError("Fill every question slot in the blueprint before publishing.");
        }
        return null;
      }
      const marksTotal = sumSectionSlotMarks(sections);
      if (
        sections.flatMap((s) => s.questions).length > 0 &&
        Math.abs(marksTotal - totalMarks) > MARK_MATCH_TOLERANCE
      ) {
        if (!silent) {
          showError(
            `Question marks total (${marksTotal}) must match paper total (${totalMarks}).`,
          );
        }
        return null;
      }
    }

    const safeTitle =
      title.trim() || defaultPaperTitle(ncertClass || "8", subject.trim() || "Science", examType);
    if (!isAutoSave) setSaving(true);
    try {
      const effectiveTotalMarks =
        slotMarksTotal > 0 ? slotMarksTotal : Math.max(0, totalMarks);
      const payload = {
        title: safeTitle,
        subject: subject.trim() || "Science",
        board,
        exam_type: examType,
        ncert_class: ncertClass || undefined,
        chapter_scope: {
          mode: "single",
          chapter_label: chapterLabel || undefined,
          pdf_url: pdfUrl || undefined,
        },
        blueprint: {
          board,
          exam_type: examType,
          total_marks: effectiveTotalMarks,
          duration_mins: durationMins,
          section_plan: sections.map((s) => ({
            section_id: s.id,
            type: s.type,
            count: s.questions.length,
            marks_each: s.marks_each,
          })),
        },
        sections: { sections },
        total_marks: effectiveTotalMarks,
        duration_mins: Math.max(5, durationMins),
      };
      let row: PaperOut;
      if (savedPaperId) {
        row = await updateTeacherPaper(savedPaperId, payload);
      } else {
        row = await createTeacherPaper(payload);
      }
      setSavedPaperId(row.id);
      setStatus("draft");
      if (
        examCalendarPrefill.fromSlotId &&
        examCalendarPrefill.calendarId &&
        row.id
      ) {
        try {
          await linkTeacherExamCalendarSlotPaper(
            examCalendarPrefill.calendarId,
            examCalendarPrefill.fromSlotId,
            row.id,
          );
          if (!silent) {
            router.push("/teacher/exam-calendar?paper_linked=1");
          }
        } catch {
          if (!silent) {
            showError("Paper saved but could not link to exam calendar slot");
          }
        }
      }
      if (publish) {
        const published = await publishTeacherPaper(row.id);
        setStatus((published.status as "draft" | "published") || "published");
        setPublishedBannerDismissed(false);
        if (!silent) showSuccess("Paper published");
      } else if (!silent) {
        if (filledCount === 0) {
          showSuccess(
            "Draft saved — no questions yet. Generate or add questions before publishing.",
          );
        } else {
          showSuccess("Paper draft saved");
        }
      }
      return row.id;
    } catch (e) {
      if (!silent) showError(e instanceof Error ? e.message : "Save failed");
      return null;
    } finally {
      if (!isAutoSave) setSaving(false);
    }
  }

  function resetStreamBuffer() {
    streamBufferRef.current = new Map();
    streamNextIdxRef.current = 0;
  }

  function applyStreamedQuestionsInOrder(prev: PaperSection[]): PaperSection[] {
    let next = prev;
    const buf = streamBufferRef.current;
    let idx = streamNextIdxRef.current;
    while (buf.has(idx)) {
      const item = buf.get(idx)!;
      buf.delete(idx);
      next = applyGeneratedPaperQuestions(next, [item]);
      idx += 1;
    }
    streamNextIdxRef.current = idx;
    return syncQuestionMarksFromSections(next);
  }

  function handleStreamProgress(event: PaperStreamProgress) {
    setGenProgress({
      stage: event.stage,
      current: event.current,
      total: event.total,
    });
  }

  function applyFinalGeneratedQuestions(
    prev: PaperSection[],
    generated: Array<Record<string, unknown>>,
  ): PaperSection[] {
    if (!generated.length) return prev;
    let next = applyGeneratedPaperQuestions(prev, generated);
    next = syncQuestionMarksFromSections(next);
    setTotalMarks(snapEvenMarks(sumSectionSlotMarks(next)));
    return next;
  }

  async function runStreamedPaperGenerate(
    slots: PaperGenerateSlot[],
    startedAt: number,
  ): Promise<GenerateFromNcertResult> {
    const runId = generateRunIdRef.current + 1;
    generateRunIdRef.current = runId;
    resetStreamBuffer();
    const requested = slots.reduce((acc, s) => acc + s.count, 0);
    setGenProgress({ stage: "researching", current: 0, total: requested });

    const gen = await streamPaperFromNcert(
      {
        chapter_label: chapterLabel,
        subject,
        pdf_url: pdfUrl,
        ncert_class: ncertClass,
        exam_type: examType,
        slots,
      },
      {
        onProgress: (event) => {
          if (generateRunIdRef.current !== runId) return;
          handleStreamProgress(event);
        },
        onQuestion: (event) => {
          if (generateRunIdRef.current !== runId) return;
          streamBufferRef.current.set(event.index, event.question);
          setSections((prev) => applyStreamedQuestionsInOrder(prev));
          setGenProgress({
            stage: "generating",
            current: event.completed,
            total: event.requested,
          });
        },
      },
    );

    if (generateRunIdRef.current !== runId) {
      throw new Error("Generation was superseded by a newer run");
    }

    if (!gen.success || gen.completed < 1) {
      throw new Error(gen.error || "No questions generated");
    }

    const batch = (gen.questions || []) as Array<Record<string, unknown>>;
    if (batch.length) {
      setSections((prev) => applyFinalGeneratedQuestions(prev, batch));
      resetStreamBuffer();
    }

    const elapsedSecs = gen.duration_secs ?? (performance.now() - startedAt) / 1000;
    const timePart = formatGenerationDuration(elapsedSecs);
    showSuccess(
      `Generated ${gen.completed} question${gen.completed === 1 ? "" : "s"}${
        timePart ? ` in ${timePart}` : ""
      } (one NCERT research pass)`,
    );
    if (gen.failed && gen.failed > 0) {
      showError(`${gen.failed} slot(s) could not be filled — retry or edit manually.`);
    }
    return gen;
  }

  async function generateAllSections() {
    if (!chapterLabel.trim() || !pdfUrl) {
      showError("Select an NCERT chapter PDF first.");
      return;
    }
    const slots = buildPaperGenerateSlots(sections);
    if (!slots.length) {
      showSuccess("All slots are already filled");
      return;
    }
    setGenerating(true);
    const startedAt = performance.now();
    try {
      await runStreamedPaperGenerate(slots, startedAt);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setGenerating(false);
      setGenProgress(null);
    }
  }

  async function generateSection(sectionId: string) {
    if (!hasScopeReady) {
      showError("Select an NCERT chapter PDF first.");
      return;
    }
    const sec = sections.find((s) => s.id === sectionId);
    if (!sec) return;
    const emptyCount = sec.questions.filter((q) => !q.text.trim()).length;
    if (!emptyCount) {
      showSuccess(`Section ${sectionId} already filled`);
      return;
    }
    setSectionGeneratingId(sectionId);
    setGenerating(true);
    const startedAt = performance.now();
    try {
      await runStreamedPaperGenerate(
        [
          {
            section_id: sec.id,
            section_type: sec.type,
            count: emptyCount,
          },
        ],
        startedAt,
      );
      showSuccess(`Section ${sectionId} generated`);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Section generation failed");
    } finally {
      setSectionGeneratingId(null);
      setGenerating(false);
      setGenProgress(null);
    }
  }

  async function regenerateQuestion(sectionId: string, questionId: string) {
    if (!hasScopeReady) {
      showError("Select an NCERT chapter PDF first.");
      return;
    }
    setQuestionGeneratingId(`${sectionId}:${questionId}`);
    try {
      const secType =
        sections.find((s) => s.id === sectionId)?.type || "mcq";
      const gen = await generatePaperFromNcert({
        chapter_label: chapterLabel,
        subject,
        pdf_url: pdfUrl,
        ncert_class: ncertClass,
        exam_type: examType,
        section_id: sectionId,
        section_type: secType,
        count: 1,
      });
      const g = (gen.questions || [])[0] as any;
      if (!g) {
        showError("No question generated");
        return;
      }
      setSections((prev) =>
        prev.map((sec) =>
          sec.id !== sectionId
            ? sec
            : {
                ...sec,
                questions: sec.questions.map((q) => {
                  if (q.id !== questionId) return q;
                  const qType = String(g.type || sec.type).toLowerCase();
                  const isMcq = qType === "mcq";
                  return {
                    ...q,
                    text: String(g.text || q.text),
                    type: qType,
                    marks: Number(sec.marks_each) || presetMarksForSection(sec),
                    options:
                      isMcq && Array.isArray(g.options)
                        ? g.options.map(String)
                        : undefined,
                    correct_answer: g.correct_answer
                      ? String(g.correct_answer)
                      : undefined,
                    source: "ncert_ai",
                  };
                }),
              },
        ),
      );
      showSuccess("Question regenerated");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Question regenerate failed");
    } finally {
      setQuestionGeneratingId(null);
    }
  }

  function openAddManual(sectionId: string) {
    setManualSectionId(sectionId);
    setEditQuestion(null);
    setShowManualModal(true);
  }

  function openEditManual(sectionId: string, q: PaperQuestion) {
    setManualSectionId(sectionId);
    setEditQuestion({
      id: q.id,
      type: q.type,
      text: q.text,
      marks: q.marks,
      options: q.options,
      correct_answer: q.correct_answer,
      source: q.source,
    });
    setShowManualModal(true);
  }

  function handleSaveManualQuestion(sectionId: string, draft: PaperQuestionDraft) {
    setSections((prev) => {
      const next = prev.map((sec) => {
        if (sec.id !== sectionId) return sec;
        const question: PaperQuestion = {
          id: draft.id,
          type: draft.type || sec.type,
          text: draft.text,
          marks: draft.marks,
          options: draft.options,
          correct_answer: draft.correct_answer,
          source: "manual",
        };
        const existingIdx = sec.questions.findIndex((q) => q.id === draft.id);
        if (existingIdx >= 0) {
          const questions = [...sec.questions];
          questions[existingIdx] = question;
          return { ...sec, questions };
        }
        const emptyIdx = sec.questions.findIndex((q) => !q.text.trim());
        if (emptyIdx >= 0) {
          const questions = [...sec.questions];
          questions[emptyIdx] = { ...question, id: sec.questions[emptyIdx].id };
          return { ...sec, questions };
        }
        const nextIdx = sec.questions.length + 1;
        return {
          ...sec,
          questions: [...sec.questions, { ...question, id: `${sec.id}${nextIdx}` }],
        };
      });
      setTotalMarks(sumSectionSlotMarks(next));
      return next;
    });
    showSuccess("Question saved");
  }

  function clearQuestion(sectionId: string, questionId: string) {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id !== sectionId
          ? sec
          : {
              ...sec,
              questions: sec.questions.map((q) =>
                q.id !== questionId
                  ? q
                  : {
                      ...q,
                      text: "",
                      options: undefined,
                      correct_answer: undefined,
                      source: "slot",
                    },
              ),
            },
      ),
    );
  }

  useEffect(() => {
    if (!savedPaperId || loading || saving || generating) return;
    if (slotStats.filled === 0) return;
    if (autosaveKey === lastAutosaveKeyRef.current) return;

    const t = window.setTimeout(async () => {
      try {
        setAutoSaveState("saving");
        const id = await saveDraft(false, { silent: true, autoSave: true });
        if (!id) {
          setAutoSaveState("error");
          showError("Autosave failed");
          return;
        }
        lastAutosaveKeyRef.current = autosaveKey;
        setAutoSaveState("saved");
      } catch {
        setAutoSaveState("error");
        showError("Autosave failed");
      }
    }, 2500);
    return () => window.clearTimeout(t);
  }, [savedPaperId, loading, saving, generating, autosaveKey, slotStats.filled]);

  function openPaperPdfUrl(path: string) {
    const url = path.startsWith("http") ? path : apiUrl(path);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleDownloadQuestionPaper() {
    if (slotStats.filled === 0) {
      showError("Add at least one question before downloading the question paper PDF.");
      return;
    }
    setGeneratingQuestionPdf(true);
    try {
      let paperId = savedPaperId;
      if (!paperId) paperId = await saveDraft(false, { silent: true });
      if (!paperId) {
        showError("Save draft failed. Please try Save draft first.");
        return;
      }
      const res = await generateTeacherQuestionPaperPdf(paperId);
      showSuccess("Question paper PDF ready");
      if (res.pdf_storage_key) openPaperPdfUrl(res.pdf_storage_key);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Question paper PDF failed");
    } finally {
      setGeneratingQuestionPdf(false);
    }
  }

  async function handleOpenAnswerKey() {
    if (slotStats.filled === 0) {
      showError("Add at least one question before opening the answer key.");
      return;
    }
    setOpeningKey(true);
    try {
      let paperId = savedPaperId;
      if (!paperId) paperId = await saveDraft(false, { silent: true });
      if (!paperId) {
        showError("Save draft failed. Please try Save draft first.");
        return;
      }
      await fetchTeacherPaperAnswerKey(paperId);
      openAnswerKey();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to open answer key");
    } finally {
      setOpeningKey(false);
    }
  }

  async function handleDownloadAnswerKeyPdf() {
    if (slotStats.filled === 0) {
      showError("Add at least one question before downloading the answer key PDF.");
      return;
    }
    setGeneratingAnswerKeyPdf(true);
    try {
      let paperId = savedPaperId;
      if (!paperId) paperId = await saveDraft(false, { silent: true });
      if (!paperId) {
        showError("Save draft failed. Please try Save draft first.");
        return;
      }
      const res = await generateTeacherAnswerKeyPdf(paperId);
      showSuccess("Answer key PDF ready");
      if (res.pdf_storage_key) openPaperPdfUrl(res.pdf_storage_key);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Answer key PDF failed");
    } finally {
      setGeneratingAnswerKeyPdf(false);
    }
  }

  async function handlePublish() {
    if (publishBlockedReason) {
      showError(publishBlockedReason);
      return;
    }
    await saveDraft(true);
  }

  async function handleSaveAndDistribute() {
    if (publishBlockedReason) {
      showError(publishBlockedReason);
      return;
    }
    const id = await saveDraft(true, { silent: true });
    if (!id) {
      showError("Save failed. Please retry.");
      return;
    }
    showSuccess("Paper published — open Ready to send to distribute.");
    router.push("/teacher/papers?tab=ready&ready=not_sent");
  }

  return (
    <div className="min-h-full bg-[#F9FAFB]">
      <LmsToast toast={toast} theme="light" />
      <div className="mx-auto w-full max-w-[1280px] px-6 py-6 lg:px-8 lg:py-8">
        <PortalBuilderHeader
          backHref="/teacher/papers"
          backLabel="Question Papers"
          backPlacement="none"
          subtitle={
            status === "published"
              ? "Published — distribute from Ready to send"
              : undefined
          }
          actions={
            <>
              <button
                type="button"
                onClick={handleStartNew}
                disabled={loading || saving}
                className={`${portalList.actionGhost} disabled:opacity-40`}
              >
                <Plus className="h-4 w-4" aria-hidden />
                New
              </button>
              <button
                type="button"
                onClick={openFullPreview}
                disabled={loading || slotStats.filled === 0}
                className={`${portalList.actionGhost} disabled:opacity-40`}
              >
                <Eye className="h-4 w-4" aria-hidden />
                Preview
              </button>
              <button
                type="button"
                onClick={() => saveDraft(false)}
                disabled={loading || saving || autoSaveState === "saving"}
                className={`${portalList.actionGhost} disabled:opacity-40`}
              >
                {saving ? "Saving..." : autoSaveState === "saving" ? "Autosaving..." : "Save draft"}
              </button>
              <button
                type="button"
                onClick={() => void handlePublish()}
                disabled={loading || saving || !canPublish}
                title={publishBlockedReason ?? undefined}
                className={`${portalList.primaryBtn} disabled:opacity-40`}
              >
                Publish
              </button>
              <button
                type="button"
                onClick={handleSaveAndDistribute}
                disabled={loading || saving || !canPublish}
                title={publishBlockedReason ?? undefined}
                className={`${portalList.actionPrimary} disabled:opacity-40`}
              >
                Save &amp; go to Distribute
              </button>
              <button
                type="button"
                onClick={handleDownloadQuestionPaper}
                disabled={loading || generatingQuestionPdf || slotStats.filled === 0}
                className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2 text-sm font-medium text-emerald-700 shadow-sm hover:bg-emerald-50 disabled:opacity-40"
              >
                {generatingQuestionPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Download className="h-4 w-4" aria-hidden />
                )}
                {generatingQuestionPdf ? "Building PDF..." : "Download question paper"}
              </button>
              <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={handleOpenAnswerKey}
                  disabled={
                    loading || openingKey || generatingAnswerKeyPdf || slotStats.filled === 0
                  }
                  className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {openingKey ? "Opening..." : "Answer key"}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadAnswerKeyPdf()}
                  disabled={
                    loading || openingKey || generatingAnswerKeyPdf || slotStats.filled === 0
                  }
                  title="Download answer key PDF"
                  aria-label="Download answer key PDF"
                  className="flex items-center border-l border-slate-200 px-2.5 py-2 text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {generatingAnswerKeyPdf ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  )}
                </button>
              </div>
            </>
          }
        />

        {publishBlockedReason && slotStats.filled > 0 ? (
          <div
            className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
          >
            {publishBlockedReason}
          </div>
        ) : null}

        {status === "published" && savedPaperId && !publishedBannerDismissed ? (
          <div className="relative mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 pr-10 text-sm text-emerald-900">
            <button
              type="button"
              onClick={() => setPublishedBannerDismissed(true)}
              className="absolute right-2 top-2 rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-100"
              aria-label="Dismiss published notice"
            >
              <X className="h-4 w-4" />
            </button>
            <p className="font-medium">Paper published successfully.</p>
            <p className="mt-1 text-emerald-800/90">
              Next step: open <span className="font-semibold">My Papers</span> and click{" "}
              <span className="font-semibold">Distribute</span> to send it to students.
            </p>
            <button
              type="button"
              onClick={() => router.push("/teacher/papers?tab=ready&ready=not_sent")}
              className="mt-3 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
            >
              Go to Ready to send
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading paper builder...
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
              <div className="space-y-6">
                <section className="rounded-2xl border border-slate-100/80 bg-white p-4 shadow-sm">
              <div>
                <p className="text-[11px] tracking-wide text-slate-500">exam type</p>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  {(Object.keys(EXAM_LABELS) as ExamType[]).map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyExamPreset(key)}
                      className={`rounded-lg border px-3 py-2 text-left text-sm ${
                        examType === key
                          ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      {EXAM_LABELS[key]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <div className="mt-2 grid gap-3 md:grid-cols-2 xl:grid-cols-5 xl:items-end">
                  <div className="xl:pr-4">
                    <label className="text-[11px] tracking-wide text-slate-500">
                      ncert chapter
                    </label>
                    <div className="mt-1">
                      <NCERTRagDropdown
                        fullWidth
                        kbs={(() => {
                          const subj = subject?.toLowerCase().replace(/\s+/g, "-");
                          if (ncertClass && subj) return [{ name: `ncert-class-${ncertClass}-${subj}` }];
                          if (ncertClass) return [{ name: `ncert-class-${ncertClass}` }];
                          return [{ name: "ncert-class-8" }];
                        })()}
                        selectedPdfUrl={pdfUrl}
                        onSelectKb={() => {}}
                        onSelectPdf={(url, label) => {
                          setPdfUrl(url);
                          const parsed = parseNcertPathFromUrl(url, manifest);
                          if (parsed) {
                            setNcertClass(parsed.ncertClass);
                            setSubject(parsed.subject);
                            setChapterLabel(label || parsed.chapterLabel);
                          } else {
                            setChapterLabel(label);
                          }
                        }}
                      />
                    </div>
                  </div>
                  <div className="xl:pl-2">
                    <label className="text-[11px] tracking-wide text-slate-500">
                      total marks
                    </label>
                    <div className="mt-1">
                      <NumericStepper
                        value={totalMarks}
                        onChange={applyTotalMarks}
                        min={2}
                        max={300}
                        step={2}
                        allowEmptyDraft
                        ariaLabel="Paper total marks"
                        compact
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] tracking-wide text-slate-500">
                      questions (all)
                    </label>
                    <div className="mt-1">
                      <NumericStepper
                        value={slotStats.total}
                        onChange={applyQuestionCount}
                        min={0}
                        max={5000}
                        allowEmptyDraft
                        ariaLabel="Questions count"
                        compact
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] tracking-wide text-slate-500">
                      same marks (all sections)
                    </label>
                    <div className="mt-1">
                      <NumericStepper
                        value={uniformMarksEach ?? 0}
                        onChange={applyUniformMarksAll}
                        min={0}
                        max={100}
                        allowEmptyDraft
                        commitOnBlurOnly
                        ariaLabel="Same marks on every section; 0 uses preset"
                        compact
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] tracking-wide text-slate-500">
                      duration (min)
                    </label>
                    <div className="mt-1">
                      <NumericStepper
                        value={Math.max(5, durationMins)}
                        onChange={applyDuration}
                        min={5}
                        max={360}
                        ariaLabel="Duration minutes"
                        compact
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {[30, 45, 60, 90, 120, 180].map((m) => (
                    <button
                      key={`paper-time-${m}`}
                      type="button"
                      onClick={() => setDurationMins(m)}
                      className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                        durationMins === m
                          ? "bg-violet-600 text-white"
                          : "bg-violet-50 text-violet-700 ring-1 ring-violet-200 hover:ring-violet-300"
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <div className="mt-2 space-y-3">
                </div>
              </div>

              {sections.length ? (
                <div className="mt-5">
                  <p className="mb-2 text-xs text-slate-500">
                    Include the sections you want on this paper. Remove any you do not
                    need, then generate questions.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {sections.map((sec) => (
                      <span
                        key={`${sec.id}-${sec.type}`}
                        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-800"
                      >
                        Section {sec.id}: {sec.type.toUpperCase()} x{" "}
                        {sec.questions.length} ({formatMarksLabel(sec.marks_each)}{" "}
                        each)
                        {sections.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => removePaperSection(sec.id)}
                            className="rounded p-0.5 text-emerald-600 hover:bg-emerald-100"
                            aria-label={`Remove section ${sec.id}`}
                            title={`Remove Section ${sec.id}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        ) : null}
                      </span>
                    ))}
                  </div>
                  {removablePresetSections.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-xs text-slate-500">Add section:</span>
                      {removablePresetSections.map((sec) => (
                        <button
                          key={`add-${sec.id}`}
                          type="button"
                          onClick={() => restorePaperSection(sec.id)}
                          className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-violet-400 hover:text-violet-700"
                        >
                          + Section {sec.id}: {sec.type.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={generateAllSections}
                  disabled={generating || !sections.length}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {sections.length === 1
                    ? "Generate section"
                    : `Generate ${sections.length} sections`}
                </button>
                {generating && genProgress ? (
                  <span className="text-xs text-emerald-700">
                    {paperGenProgressLabel(
                      genProgress.stage,
                      genProgress.current,
                      genProgress.total,
                    )}
                  </span>
                ) : null}
              </div>
                </section>

                <section className="rounded-2xl border border-slate-100/80 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs tracking-wide text-slate-500">
                    sections & questions
                  </p>
                </div>
              </div>

              <div className="mt-4 space-y-6">
                {sections.map((sec) => {
                  const filled = sec.questions.filter((q) => q.text.trim()).length;
                  return (
                    <div key={sec.id} className="space-y-3">
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="pb-0.5 text-sm font-semibold text-slate-900">
                            Section {sec.id} — {sec.type.toUpperCase()}
                          </h3>
                          {sections.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removePaperSection(sec.id)}
                              className="text-[11px] font-medium text-rose-600/90 hover:text-rose-300"
                            >
                              Remove section
                            </button>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-end justify-end gap-3">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] tracking-wide text-slate-500">
                              questions
                            </span>
                            <NumericStepper
                              value={sec.questions.length}
                              onChange={(v) => applySectionQuestionCount(sec.id, v)}
                              min={0}
                              max={5000}
                              allowEmptyDraft
                              ariaLabel={`Section ${sec.id} questions`}
                              size="sm"
                            />
                          </div>
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] tracking-wide text-slate-500">
                              marks each
                            </span>
                            <NumericStepper
                              value={sec.marks_each}
                              onChange={(v) => applySectionMarksEach(sec.id, v)}
                              min={1}
                              max={100}
                              ariaLabel={`Section ${sec.id} marks each`}
                              size="sm"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => openAddManual(sec.id)}
                            className="rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            + Add manually
                          </button>
                          <button
                            type="button"
                            onClick={() => void generateSection(sec.id)}
                            disabled={
                              generating || sectionGeneratingId === sec.id || !hasScopeReady
                            }
                            className="rounded-md border border-emerald-200 px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"
                          >
                            {sectionGeneratingId === sec.id && genProgress
                              ? paperGenProgressLabel(
                                  genProgress.stage,
                                  genProgress.current,
                                  genProgress.total,
                                )
                              : sectionGeneratingId === sec.id
                                ? "Generating..."
                                : "Generate section"}
                          </button>
                        </div>
                      </div>
                      {filled > 0 ||
                      ((generating || sectionGeneratingId === sec.id) &&
                        sec.questions.some((q) => !q.text.trim())) ? (
                        <ul className="space-y-2">
                          {sec.questions.map((q) => {
                            const isPending =
                              !q.text.trim() &&
                              (generating || sectionGeneratingId === sec.id);
                            if (!q.text.trim() && !isPending) return null;
                            if (isPending) {
                              return (
                                <li
                                  key={q.id}
                                  className="animate-pulse rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-4"
                                >
                                  <div className="flex items-center gap-2">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400/80" />
                                    <span className="text-xs text-slate-500">{q.id}</span>
                                    <span className="text-xs text-emerald-400/80">
                                      Generating…
                                    </span>
                                  </div>
                                  <div className="mt-3 h-3 w-4/5 rounded bg-slate-200" />
                                  <div className="mt-2 h-3 w-2/3 rounded bg-slate-200/80" />
                                </li>
                              );
                            }
                            return (
                              <li
                                key={q.id}
                                className="group rounded-xl border border-slate-100 bg-white p-4 shadow-sm"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-xs font-medium text-slate-500">{q.id}</span>
                                  {q.source === "ncert_ai" ? (
                                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
                                      NCERT AI
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                                      Manual
                                    </span>
                                  )}
                                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                                    {formatMarksLabel(q.marks)}
                                  </span>
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                    <button
                                      type="button"
                                      onClick={() => openEditManual(sec.id, q)}
                                      className="rounded-md border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void regenerateQuestion(sec.id, q.id)}
                                      disabled={questionGeneratingId === `${sec.id}:${q.id}` || !hasScopeReady}
                                      className="rounded-md border border-violet-200 px-2 py-1 text-violet-700 hover:bg-violet-50 disabled:opacity-40"
                                    >
                                      {questionGeneratingId === `${sec.id}:${q.id}` ? "Regenerating..." : "Regenerate"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => clearQuestion(sec.id, q.id)}
                                      className="rounded-md border border-rose-800/60 px-2 py-1 text-rose-300 hover:bg-rose-950/30"
                                    >
                                      Clear
                                    </button>
                                  </div>
                                </div>
                                <p className="mt-2 text-sm text-slate-800">{q.text}</p>
                                {q.options?.length ? (
                                  <ul className="mt-2 space-y-0.5 text-xs text-slate-600">
                                    {q.options.map((o, oi) => (
                                      <li key={`${q.id}-opt-${oi}`}>
                                        {o === q.correct_answer ? "✓ " : "· "}
                                        {formatMcqOptionDisplay(oi, o)}
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                          No questions yet.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {!sections.length ? (
                <p className="mt-4 text-center text-sm text-slate-500">
                  Choose an exam type in Step 1 to create section slots.
                </p>
              ) : slotStats.filled === 0 ? (
                <p className="mt-4 text-center text-sm text-slate-600/70">
                  Select an NCERT chapter and click Generate all sections to fill questions.
                </p>
              ) : null}
                </section>
              </div>

              <aside className={portalDetail.builderAside}>
                <section className="rounded-2xl border border-slate-100/80 bg-white p-4 shadow-sm">
                  <p className="text-base font-bold text-slate-900">paper summary</p>
                  <div className="mt-2 space-y-1.5 text-xs text-slate-500">
                    <p className="font-medium text-slate-700">{title || "Untitled paper"}</p>
                    <p>Class {ncertClass || "-"} · {subject || "-"}</p>
                    <p>{EXAM_LABELS[examType]} · {board}</p>
                    <p>
                      {slotStats.total > 0 ? slotMarksTotal : totalMarks} marks from questions
                      {slotStats.total > 0 && marksMismatch ? (
                        <span className="text-amber-600">
                          {" "}
                          (header target {totalMarks} — adjust marks each or total)
                        </span>
                      ) : null}
                      {" · "}
                      {durationMins} min
                    </p>
                    <p title={chapterLabel || "No chapter selected"}>{chapterSummary}</p>
                    <p>{slotStats.filled}/{slotStats.total} questions filled</p>
                  </div>
                </section>
              </aside>
            </div>
          </div>
        )}
      </div>

      {showAnswerKey && answerKeyMinimized ? (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-[min(100vw-2rem,22rem)] items-center gap-2 rounded-xl border border-amber-200/90 bg-white py-2 pl-3 pr-2 shadow-lg">
          <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-amber-700">
            Key
          </span>
          <button
            type="button"
            onClick={() => setAnswerKeyMinimized(false)}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-900 hover:text-amber-800"
            title={`Answer key — ${title || "Paper"}`}
          >
            Answer key — {title || "Paper"}
          </button>
          <button
            type="button"
            onClick={() => setAnswerKeyMinimized(false)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Restore answer key"
            title="Restore"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={closeAnswerKey}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close answer key"
            title="Close"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>
      ) : null}

      {showAnswerKey && !answerKeyMinimized ? (
        <div
          className={`fixed inset-0 z-50 flex overflow-hidden bg-slate-900/40 backdrop-blur-[2px] portal-modal-overlay-enter ${
            answerKeyExpanded ? "p-2 sm:p-3" : "items-center justify-center p-4"
          }`}
          role="presentation"
          onClick={closeAnswerKey}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="paper-answer-key-title"
            className={`grid w-full overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl transition-all duration-200 ${
              answerKeyExpanded
                ? "h-full max-w-none grid-rows-[auto_minmax(0,1fr)_auto]"
                : "h-[85vh] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="z-10 border-b border-slate-200/90 bg-slate-50/80 px-6 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2
                    id="paper-answer-key-title"
                    className="pr-2 text-lg font-bold leading-snug text-slate-900"
                  >
                    Answer key — {title || "Paper"}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    Teacher only. Do not share with students before the exam.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAnswerKeyMinimized(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-800 transition-colors hover:bg-slate-200/80 hover:text-slate-950"
                    aria-label="Minimize answer key"
                    title="Minimize"
                  >
                    <Minus className="h-4 w-4" strokeWidth={2.25} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnswerKeyExpanded((v) => !v)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-800 transition-colors hover:bg-slate-200/80 hover:text-slate-950"
                    aria-label={
                      answerKeyExpanded ? "Exit expanded answer key" : "Expand answer key"
                    }
                    title={answerKeyExpanded ? "Minimize size" : "Expand"}
                  >
                    {answerKeyExpanded ? (
                      <Minimize2 className="h-4 w-4" strokeWidth={2.25} />
                    ) : (
                      <Maximize2 className="h-4 w-4" strokeWidth={2.25} />
                    )}
                  </button>
                  <ModalCloseButton
                    onClick={closeAnswerKey}
                    absolute={false}
                    className="text-slate-800 border-slate-300 hover:text-slate-950"
                    aria-label="Close answer key"
                  />
                </div>
              </div>
            </header>

            <div className="overflow-y-auto overscroll-y-contain px-6 py-4">
              <ol
                className={`space-y-6 ${answerKeyExpanded ? "mx-auto max-w-3xl" : ""}`}
              >
                {sections.flatMap((sec) => {
                  const questions = sec.questions.filter((q) => q.text.trim());
                  return questions.map((q, i) => (
                    <li key={`ak-${sec.id}-${q.id}`}>
                      <p className="text-sm font-medium text-indigo-600">
                        Section {sec.id} · {sec.type.toUpperCase()} · Q{i + 1} · {q.marks}{" "}
                        mark{q.marks === 1 ? "" : "s"}
                      </p>
                      <p className="mt-1 font-medium text-slate-900">{q.text}</p>
                      {q.options?.length ? (
                        <ul className="mt-2 space-y-1">
                          {q.options.map((o, oi) => {
                            const isCorrect = o === q.correct_answer;
                            return (
                              <li
                                key={`ak-${q.id}-${oi}`}
                                className={`rounded-lg border px-3 py-2 text-sm ${
                                  isCorrect
                                    ? "border-emerald-300 bg-emerald-50 font-medium text-emerald-900"
                                    : "border-slate-200 text-slate-700"
                                }`}
                              >
                                {isCorrect ? "✓ " : ""}
                                {formatMcqOptionDisplay(oi, o)}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                      {q.options?.length ? (
                        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                          <span className="font-medium">Answer: </span>
                          {formatMcqAnswerDisplay(q.options, q.correct_answer)}
                        </div>
                      ) : (
                        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                          <span className="font-medium">Expected answer: </span>
                          {q.correct_answer?.trim() ? q.correct_answer : "— not set yet"}
                        </div>
                      )}
                    </li>
                  ));
                })}
              </ol>
            </div>

            <footer className="z-10 border-t border-slate-200/90 bg-slate-50/80 px-6 py-4">
              <button
                type="button"
                onClick={closeAnswerKey}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {showFullPreview && previewMinimized ? (
        <div className="fixed bottom-4 right-4 z-50 flex max-w-[min(100vw-2rem,22rem)] items-center gap-2 rounded-xl border border-slate-200/90 bg-white py-2 pl-3 pr-2 shadow-lg">
          <Eye className="h-4 w-4 shrink-0 text-indigo-600" aria-hidden />
          <button
            type="button"
            onClick={() => setPreviewMinimized(false)}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-slate-900 hover:text-indigo-700"
            title={title || "Paper preview"}
          >
            {title || "Paper preview"}
          </button>
          <button
            type="button"
            onClick={() => setPreviewMinimized(false)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Restore preview"
            title="Restore"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={closeFullPreview}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            aria-label="Close preview"
            title="Close"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>
      ) : null}

      {showFullPreview && !previewMinimized ? (
        <div
          className={`fixed inset-0 z-50 flex overflow-hidden bg-slate-900/40 backdrop-blur-[2px] portal-modal-overlay-enter ${
            previewExpanded ? "p-2 sm:p-3" : "items-center justify-center p-4"
          }`}
          role="presentation"
          onClick={closeFullPreview}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="paper-full-preview-title"
            className={`grid w-full overflow-hidden rounded-2xl bg-white text-slate-900 shadow-xl transition-all duration-200 ${
              previewExpanded
                ? "h-full max-w-none grid-rows-[auto_minmax(0,1fr)_auto]"
                : "h-[85vh] max-w-lg grid-rows-[auto_minmax(0,1fr)_auto]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="z-10 border-b border-slate-200/90 bg-slate-50/80 px-6 py-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2
                    id="paper-full-preview-title"
                    className="pr-2 text-lg font-bold leading-snug text-slate-900"
                  >
                    {title || "Paper preview"}
                  </h2>
                  <p className="mt-1 text-xs font-medium text-slate-500">
                    {subject || "General"} · {board} · {totalMarks} marks · {durationMins} min
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewMinimized(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-800 transition-colors hover:bg-slate-200/80 hover:text-slate-950"
                    aria-label="Minimize preview"
                    title="Minimize"
                  >
                    <Minus className="h-4 w-4" strokeWidth={2.25} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewExpanded((v) => !v)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-800 transition-colors hover:bg-slate-200/80 hover:text-slate-950"
                    aria-label={
                      previewExpanded ? "Exit expanded preview" : "Expand preview"
                    }
                    title={previewExpanded ? "Minimize size" : "Expand"}
                  >
                    {previewExpanded ? (
                      <Minimize2 className="h-4 w-4" strokeWidth={2.25} />
                    ) : (
                      <Maximize2 className="h-4 w-4" strokeWidth={2.25} />
                    )}
                  </button>
                  <ModalCloseButton
                    onClick={closeFullPreview}
                    absolute={false}
                    className="text-slate-800 border-slate-300 hover:text-slate-950"
                    aria-label="Close preview"
                  />
                </div>
              </div>
            </header>

            <div className="overflow-y-auto overscroll-y-contain px-6 py-4">
              <div
                className={`space-y-8 ${previewExpanded ? "mx-auto max-w-3xl" : ""}`}
              >
                {sections.map((sec) => {
                  const questions = sec.questions.filter((q) => q.text.trim());
                  if (!questions.length) return null;
                  return (
                    <section key={`preview-sec-${sec.id}`}>
                      <h3 className="text-sm font-semibold text-indigo-600">
                        Section {sec.id} · {sec.type.toUpperCase()}
                      </h3>
                      <ol className="mt-4 space-y-5">
                        {questions.map((q, i) => (
                          <li key={`preview-${sec.id}-${q.id}`}>
                            <p className="font-medium text-slate-900">
                              <span className="font-semibold text-violet-800">(Q{i + 1})</span>{" "}
                              {q.text}
                            </p>
                            {q.options?.length ? (
                              <ul className="mt-2 space-y-1">
                                {q.options.map((o, oi) => (
                                  <li
                                    key={`preview-${q.id}-${oi}`}
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                                  >
                                    {formatMcqOptionDisplay(oi, o)}
                                  </li>
                                ))}
                              </ul>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    </section>
                  );
                })}
              </div>
            </div>

            <footer className="z-10 border-t border-slate-200/90 bg-slate-50/80 px-6 py-4">
              <button
                type="button"
                onClick={closeFullPreview}
                className="w-full rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                Close
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      <PaperStartNewConfirmDialog
        open={showStartNewConfirm}
        onConfirm={confirmStartNew}
        onCancel={() => setShowStartNewConfirm(false)}
      />

      <PaperQuestionFormModal
        open={showManualModal}
        sectionType={
          sections.find((s) => s.id === manualSectionId)?.type || "short"
        }
        initial={editQuestion}
        defaultMarks={
          sections.find((s) => s.id === manualSectionId)?.marks_each || 1
        }
        onClose={() => {
          setShowManualModal(false);
          setManualSectionId(null);
          setEditQuestion(null);
        }}
        onSave={(draft) => {
          if (!manualSectionId) return;
          handleSaveManualQuestion(manualSectionId, draft);
        }}
      />
    </div>
  );
}
