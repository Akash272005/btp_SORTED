"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Plus,
  RotateCcw,
} from "lucide-react";
import {
  listManifestChapters,
  type ManifestChapter,
} from "@/lib/examCalendarBulkChapters";
import {
  examCalendarSummaryCounts,
  matchesExamCalendarSlotFilter,
  slotStatusFor,
  type ExamCalendarSlotFilter,
  type SlotNumericDraft,
} from "@/lib/examCalendarListUi";
import LmsToast from "@/components/lms/LmsToast";
import PortalAssignmentPageLoading from "@/components/lms/portal/PortalAssignmentPageLoading";
import PortalExamCalendarSummaryCards from "@/components/lms/portal/PortalExamCalendarSummaryCards";
import PortalListFilterPanel from "@/components/lms/portal/PortalListFilterPanel";
import TeacherListPageShell from "@/components/lms/portal/TeacherListPageShell";
import TeacherPortalListLayout from "@/components/lms/portal/TeacherPortalListLayout";
import CreatePaperDistributionModal from "@/components/lms/teacher/CreatePaperDistributionModal";
import ExamCalendarChapterPickerModal from "@/components/lms/teacher/ExamCalendarChapterPickerModal";
import ExamCalendarClearConfirmDialog from "@/components/lms/teacher/ExamCalendarClearConfirmDialog";
import ExamCalendarSlotRow from "@/components/lms/teacher/ExamCalendarSlotRow";
import { useLmsToast } from "@/hooks/useLmsToast";
import { notifyTeacherPortalRefresh } from "@/lib/teacherPortalRefresh";
import { dashboardHeader } from "@/lib/portalDashboardUi";
import { portalList } from "@/lib/portalListUi";
import {
  createTeacherExamCalendar,
  duplicateTeacherExamCalendar,
  fetchPaperDistributions,
  fetchTeacherExamCalendar,
  fetchTeacherExamCalendars,
  publishTeacherExamCalendar,
  saveTeacherExamCalendarSlots,
  unpublishTeacherExamCalendar,
  type ExamCalendar,
  type ExamCalendarSlot,
  type ExamCalendarSlotChapter,
} from "@/services/lmsApi";
import { useSearchParams } from "next/navigation";
import { fetchTeacherDashboard } from "@/services/lmsApi";
import {
  useTeacherClassStore,
  type TeacherClassState,
} from "@/store/teacherClassStore";
import type { TeacherDashboard } from "@/types/teacher";

const FALLBACK_SUBJECTS = ["Science", "Mathematics", "English", "Social Science"];

const TEMPLATES = [
  {
    id: "standard_6",
    title: "Standard 6-exam plan",
    desc: "UT1 → UT2 → Half Yearly → UT3 → UT4 → Final Exam",
  },
  {
    id: "unit_5",
    title: "5 unit test plan",
    desc: "Five unit tests plus final exam",
  },
  { id: "custom", title: "Custom", desc: "Start empty and add slots manually" },
] as const;

function classToNcertKey(classId: string): string {
  const m = classId.match(/class-(\d+)/i);
  return m ? `class-${m[1]}` : "class-8";
}

function subjectManifestKey(subject: string): string {
  const s = subject.trim().toLowerCase();
  if (s === "maths" || s === "mathematics") return "mathematics";
  if (s === "social science") return "social-science";
  return s;
}

function academicYearOptions(): string[] {
  const y = new Date().getFullYear();
  const m = new Date().getMonth();
  const start = m >= 3 ? y : y - 1;
  return [
    `${start}-${String(start + 1).slice(-2)}`,
    `${start + 1}-${String(start + 2).slice(-2)}`,
  ];
}

type EditableSlot = ExamCalendarSlot & { _localChapters?: ExamCalendarSlotChapter[] };

/** Remove old template-seeded marks/duration still stored on existing drafts. */
function stripLegacyTemplateSlotDefaults(slots: EditableSlot[]): {
  slots: EditableSlot[];
  changed: boolean;
} {
  let changed = false;
  const next = slots.map((s) => {
    const m = s.marks;
    const d = s.duration_mins;
    if (s.slot_type === "unit_test" && m === 50 && d === 90) {
      changed = true;
      return { ...s, marks: null, duration_mins: null };
    }
    if (s.slot_type === "half_yearly" && m === 80 && d === 180) {
      changed = true;
      return { ...s, marks: null, duration_mins: null };
    }
    if (s.slot_type === "annual" && m === 100 && d === 180) {
      changed = true;
      return { ...s, marks: null, duration_mins: null };
    }
    return s;
  });
  return { slots: next, changed };
}

function slotsPayloadKey(slots: EditableSlot[]): string {
  return slots
    .map(
      (s) =>
        `${s.id}\u0001${s.sort_order}\u0001${s.title}\u0001${s.exam_date ?? ""}\u0001${s.marks ?? ""}\u0001${s.duration_mins ?? ""}\u0001${s.chapters.map((c) => c.chapter_key).join(",")}`,
    )
    .join("\u0002");
}

/** Keep local marks/dates/chapters; only refresh link ids from the server. */
function mergeServerSlotLinks(
  local: EditableSlot[],
  remote: ExamCalendarSlot[],
): EditableSlot[] {
  const byId = new Map(remote.map((s) => [s.id, s]));
  return local.map((s) => {
    const r = byId.get(s.id);
    if (!r) return s;
    return {
      ...s,
      linked_paper_id: r.linked_paper_id,
      linked_assignment_id: r.linked_assignment_id,
    };
  });
}

function parseSlotNumeric(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (Number.isNaN(n) || n < 0) return null;
  return Math.floor(n);
}

function pickCalendarForLoad<
  T extends { id: string; status: string },
>(list: T[], activeCalendarId: string | null | undefined): T | undefined {
  if (activeCalendarId) {
    const current = list.find((c) => c.id === activeCalendarId);
    if (current) return current;
  }
  return (
    list.find((c) => c.status === "published") ??
    list.find((c) => c.status === "draft")
  );
}

function applyNumericDraftsToSlots(
  slotsList: EditableSlot[],
  drafts: Record<string, SlotNumericDraft>,
): EditableSlot[] {
  if (!Object.keys(drafts).length) return slotsList;
  return slotsList.map((s) => {
    const d = drafts[s.id];
    if (!d) return s;
    let next = { ...s };
    if (d.marks !== undefined) {
      const parsed = parseSlotNumeric(d.marks);
      if (d.marks.trim() === "" || parsed !== null) next.marks = parsed;
    }
    if (d.duration !== undefined) {
      const parsed = parseSlotNumeric(d.duration);
      if (d.duration.trim() === "" || parsed !== null) {
        next.duration_mins = parsed;
      }
    }
    return next;
  });
}

export default function ExamCalendarBuilder() {
  const searchParams = useSearchParams();
  const classId = useTeacherClassStore((s: TeacherClassState) => s.classId);
  const setClassId = useTeacherClassStore((s: TeacherClassState) => s.setClassId);
  const { toast, showSuccess, showError } = useLmsToast();
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([]);
  const [teachingSubjects, setTeachingSubjects] = useState(FALLBACK_SUBJECTS);
  const [subject, setSubject] = useState("Science");
  const [academicYear, setAcademicYear] = useState(academicYearOptions()[0]);
  const [templateId, setTemplateId] = useState("standard_6");
  const [calendar, setCalendar] = useState<ExamCalendar | null>(null);
  const [slots, setSlots] = useState<EditableSlot[]>([]);
  const [chapterPickerSlotId, setChapterPickerSlotId] = useState<string | null>(
    null,
  );
  const [manifestChapters, setManifestChapters] = useState<ManifestChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publishErrors, setPublishErrors] = useState<string[]>([]);
  const [distributedPaperIds, setDistributedPaperIds] = useState<Set<number>>(
    () => new Set(),
  );
  const [distributeSlot, setDistributeSlot] = useState<EditableSlot | null>(null);
  const [clearAllConfirmOpen, setClearAllConfirmOpen] = useState(false);
  const [clearSlotTarget, setClearSlotTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [removeSlotTarget, setRemoveSlotTarget] = useState<{
    id: string;
    title: string;
  } | null>(null);
  const [numericDrafts, setNumericDrafts] = useState<
    Record<string, SlotNumericDraft>
  >({});
  const [slotFilter, setSlotFilter] = useState<ExamCalendarSlotFilter>("all");
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const slotsDirty = useRef(false);
  const slotsRef = useRef<EditableSlot[]>([]);
  const numericDraftsRef = useRef<Record<string, SlotNumericDraft>>({});
  const saveGeneration = useRef(0);
  const activeCalendarIdRef = useRef<string | null>(null);

  const isPublished = calendar?.status === "published";
  const hasCalendar = Boolean(calendar);
  const ncertClassKey = classToNcertKey(classId);
  const manifestSubject = subjectManifestKey(subject);
  const setupLocked = hasCalendar;

  useEffect(() => {
    activeCalendarIdRef.current = calendar?.id ?? null;
  }, [calendar?.id]);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPublishErrors([]);
    try {
      const dash = (await fetchTeacherDashboard(classId)) as TeacherDashboard;
      setClasses(dash.classes ?? []);
      const subs =
        dash.teaching_subjects?.length
          ? dash.teaching_subjects
          : FALLBACK_SUBJECTS;
      setTeachingSubjects(subs);
      const activeSubject = subs.includes(subject)
        ? subject
        : (subs[0] ?? "Science");
      if (activeSubject !== subject) {
        setSubject(activeSubject);
      }
      const [allForClass, dists] = await Promise.all([
        fetchTeacherExamCalendars({
          class_id: classId,
          subject: activeSubject,
        }),
        fetchPaperDistributions(classId),
      ]);
      setDistributedPaperIds(
        new Set(dists.map((d) => d.paper_id).filter((id): id is number => id != null)),
      );
      let list = allForClass.filter((c) => c.academic_year === academicYear);
      if (!list.length && allForClass.length) {
        const syncedYear = allForClass[0]!.academic_year;
        if (syncedYear !== academicYear) {
          setAcademicYear(syncedYear);
          return;
        }
        list = allForClass;
      }
      const pick = pickCalendarForLoad(list, activeCalendarIdRef.current);
      if (pick) {
        const full = await fetchTeacherExamCalendar(pick.id);
        activeCalendarIdRef.current = full.id;
        setCalendar(full);
        const raw = full.slots.map((s) => ({ ...s }));
        const { slots: cleaned, changed } = stripLegacyTemplateSlotDefaults(raw);
        if (slotsDirty.current) {
          setSlots((prev) => mergeServerSlotLinks(prev, cleaned));
        } else {
          setNumericDrafts({});
          setSlots(cleaned);
          slotsDirty.current = changed && full.status === "draft";
        }
        setTemplateId(full.template_id);
      } else {
        setCalendar(null);
        setNumericDrafts({});
        setSlots([]);
        slotsDirty.current = false;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [classId, subject, academicYear]);

  useEffect(() => {
    void loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    listManifestChapters(ncertClassKey, subject)
      .then(setManifestChapters)
      .catch(() => setManifestChapters([]));
  }, [ncertClassKey, subject]);

  const paperLinkedShown = useRef(false);
  useEffect(() => {
    if (searchParams.get("paper_linked") !== "1" || paperLinkedShown.current) return;
    paperLinkedShown.current = true;
    showSuccess("Paper linked to exam slot");
    void loadCalendar();
  }, [searchParams, showSuccess, loadCalendar]);

  const syllabusCoverage = useMemo(() => {
    const total = manifestChapters.length;
    if (!total) return null;
    const used = new Set<string>();
    for (const s of slots) {
      for (const ch of s.chapters) used.add(ch.chapter_key);
    }
    const pct = Math.round((used.size / total) * 100);
    return { used: used.size, total, pct };
  }, [slots, manifestChapters]);

  const slotSummary = useMemo(
    () => examCalendarSummaryCounts(slots, distributedPaperIds),
    [slots, distributedPaperIds],
  );

  const visibleSlots = useMemo(
    () =>
      slots.filter((s) =>
        matchesExamCalendarSlotFilter(s, slotFilter, distributedPaperIds),
      ),
    [slots, slotFilter, distributedPaperIds],
  );

  const publishReadiness = useMemo(() => {
    if (!hasCalendar) return { ready: false, hint: "" };
    if (isPublished) {
      return {
        ready: true,
        hint: "Live for students — edit exams below, then Save updates.",
      };
    }
    return {
      ready: true,
      hint: "Publish with 1 exam or all 6 — empty slots still appear in your plan.",
    };
  }, [hasCalendar, isPublished]);

  const persistSlots = useCallback(
    async (
      nextSlots: EditableSlot[],
      opts?: { forceApplyServer?: boolean },
    ): Promise<boolean> => {
      if (!calendar) return false;
      const merged = applyNumericDraftsToSlots(
        nextSlots,
        numericDraftsRef.current,
      );
      const generation = ++saveGeneration.current;
      const savedKey = slotsPayloadKey(merged);
      setSaving(true);
      setError(null);
      try {
        const payload = merged.map((s, i) => ({
          id: s.id,
          sort_order: i + 1,
          slot_type: s.slot_type,
          title: s.title,
          exam_date: s.exam_date ?? null,
          marks: s.marks ?? null,
          duration_mins: s.duration_mins ?? null,
          instructions: s.instructions ?? null,
          chapters: s.chapters.map((c) => ({
            chapter_key: c.chapter_key,
            chapter_label: c.chapter_label,
            ncert_class: c.ncert_class ?? ncertClassKey,
            pdf_url: c.pdf_url,
          })),
        }));
        const updated = await saveTeacherExamCalendarSlots(calendar.id, payload);
        setCalendar(updated);
        const localMatchesSave =
          generation === saveGeneration.current &&
          slotsPayloadKey(slotsRef.current) === savedKey;
        if (localMatchesSave || opts?.forceApplyServer) {
          slotsDirty.current = false;
          setNumericDrafts({});
          setSlots(updated.slots.map((s) => ({ ...s })));
        }
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [calendar, ncertClassKey],
  );

  useEffect(() => {
    if (loading || saving || !hasCalendar || !slotsDirty.current) {
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      void persistSlots(slotsRef.current);
    }, 2500);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [slots, loading, saving, hasCalendar, persistSlots]);

  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    numericDraftsRef.current = numericDrafts;
  }, [numericDrafts]);

  function markDirty(updater: (prev: EditableSlot[]) => EditableSlot[]) {
    slotsDirty.current = true;
    setSlots(updater);
  }

  function setNumericDraft(
    slotId: string,
    field: "marks" | "duration",
    value: string,
  ) {
    setNumericDrafts((prev) => ({
      ...prev,
      [slotId]: { ...prev[slotId], [field]: value },
    }));
  }

  function clearNumericDraft(slotId: string, field: "marks" | "duration") {
    setNumericDrafts((prev) => {
      const entry = prev[slotId];
      if (!entry || entry[field] === undefined) return prev;
      const nextEntry = { ...entry };
      delete nextEntry[field];
      const next = { ...prev };
      if (Object.keys(nextEntry).length === 0) delete next[slotId];
      else next[slotId] = nextEntry;
      return next;
    });
  }

  function commitNumericDraft(slotId: string, field: "marks" | "duration") {
    const raw = numericDrafts[slotId]?.[field];
    if (raw === undefined) return;
    clearNumericDraft(slotId, field);
    const parsed = parseSlotNumeric(raw);
    if (raw.trim() !== "" && parsed === null) return;
    markDirty((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? field === "marks"
            ? { ...s, marks: parsed }
            : { ...s, duration_mins: parsed }
          : s,
      ),
    );
  }

  async function handleCreateDraft() {
    setSaving(true);
    setError(null);
    try {
      const created = await createTeacherExamCalendar({
        class_id: classId,
        subject,
        academic_year: academicYear,
        template_id: templateId,
      });
      setCalendar(created);
      setSlots(created.slots.map((s) => ({ ...s })));
      setTemplateId(created.template_id);
      slotsDirty.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create calendar");
    } finally {
      setSaving(false);
    }
  }

  function saveDraftWithNumericFlush() {
    const flushed = applyNumericDraftsToSlots(slots, numericDrafts);
    setNumericDrafts({});
    setSlots(flushed);
    slotsDirty.current = true;
    void persistSlots(flushed).then(() => {
      if (calendar?.status === "published") {
        notifyTeacherPortalRefresh();
        showSuccess("Exam calendar updated for students");
      }
    });
  }

  async function handlePublish() {
    if (!calendar) return;
    const flushed = applyNumericDraftsToSlots(slots, numericDrafts);
    setNumericDrafts({});
    setSlots(flushed);
    slotsDirty.current = true;
    const saved = await persistSlots(flushed, { forceApplyServer: true });
    if (!saved) {
      setPublishErrors([
        "Could not save your exam plan before publish. Check the error above, then try again.",
      ]);
      return;
    }
    setSaving(true);
    setPublishErrors([]);
    try {
      const res = await publishTeacherExamCalendar(calendar.id);
      if (!res.ok) {
        setPublishErrors(
          res.errors ?? [
            "Publish failed. If another published calendar exists for this class and subject, unpublish it first.",
          ],
        );
        return;
      }
      const full = await fetchTeacherExamCalendar(calendar.id);
      activeCalendarIdRef.current = full.id;
      setCalendar(full);
      setSlots(full.slots.map((s) => ({ ...s })));
      slotsDirty.current = false;
      showSuccess("Exam calendar published — students can see it now");
      notifyTeacherPortalRefresh();
    } catch (e) {
      setPublishErrors([e instanceof Error ? e.message : "Publish failed"]);
    } finally {
      setSaving(false);
    }
  }

  async function handleUnpublish() {
    if (!calendar) return;
    setSaving(true);
    try {
      const updated = await unpublishTeacherExamCalendar(calendar.id);
      setCalendar(updated);
      setSlots(updated.slots.map((s) => ({ ...s })));
      notifyTeacherPortalRefresh();
      showSuccess("Calendar moved back to draft");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Unpublish failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    if (!calendar) return;
    setSaving(true);
    try {
      const dup = await duplicateTeacherExamCalendar(calendar.id);
      setCalendar(dup);
      setSlots(dup.slots.map((s) => ({ ...s })));
      showSuccess("Duplicate draft created — edit and publish when ready");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Duplicate failed");
    } finally {
      setSaving(false);
    }
  }

  function updateSlot(id: string, patch: Partial<EditableSlot>) {
    markDirty((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addChaptersBulk(slotId: string, chapters: ManifestChapter[]) {
    markDirty((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        const existing = new Set(s.chapters.map((c) => c.chapter_key));
        const added = chapters
          .filter((ch) => !existing.has(ch.chapter_key))
          .map((ch) => ({
            chapter_key: ch.chapter_key,
            chapter_label: ch.chapter_label,
            ncert_class: ncertClassKey,
            pdf_url: ch.pdf_url,
          }));
        return { ...s, chapters: [...s.chapters, ...added] };
      }),
    );
  }

  function addChapterToSlot(slotId: string, label: string, pdfUrl: string) {
    const key = pdfUrl || label;
    markDirty((prev) =>
      prev.map((s) => {
        if (s.id !== slotId) return s;
        if (s.chapters.some((c) => c.chapter_key === key)) return s;
        return {
          ...s,
          chapters: [
            ...s.chapters,
            {
              chapter_key: key,
              chapter_label: label,
              ncert_class: ncertClassKey,
              pdf_url: pdfUrl,
            },
          ],
        };
      }),
    );
  }

  function removeChapter(slotId: string, chapterKey: string) {
    markDirty((prev) =>
      prev.map((s) =>
        s.id === slotId
          ? {
              ...s,
              chapters: s.chapters.filter((c) => c.chapter_key !== chapterKey),
            }
          : s,
      ),
    );
  }

  const emptySlotFields = {
    exam_date: null,
    marks: null,
    duration_mins: null,
    chapters: [] as ExamCalendarSlotChapter[],
  };

  function clearSlot(slotId: string) {
    setNumericDrafts((prev) => {
      if (!prev[slotId]) return prev;
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    markDirty((prev) =>
      prev.map((s) => (s.id === slotId ? { ...s, ...emptySlotFields } : s)),
    );
  }

  function confirmClearAll() {
    setNumericDrafts({});
    markDirty((prev) => prev.map((s) => ({ ...s, ...emptySlotFields })));
    setClearAllConfirmOpen(false);
    showSuccess("Cleared — click Save when ready");
  }

  function confirmClearSlot() {
    if (!clearSlotTarget) return;
    clearSlot(clearSlotTarget.id);
    setClearSlotTarget(null);
    showSuccess(`Cleared ${clearSlotTarget.title}`);
  }

  function removeSlot(slotId: string) {
    setNumericDrafts((prev) => {
      if (!prev[slotId]) return prev;
      const next = { ...prev };
      delete next[slotId];
      return next;
    });
    markDirty((prev) => prev.filter((s) => s.id !== slotId));
  }

  function confirmRemoveSlot() {
    if (!removeSlotTarget) return;
    const title = removeSlotTarget.title;
    removeSlot(removeSlotTarget.id);
    setRemoveSlotTarget(null);
    showSuccess(`Removed ${title}`);
  }

  function addEmptySlot() {
    const id = `new-${Date.now()}`;
    markDirty((prev) => [
      ...prev,
      {
        id,
        sort_order: prev.length + 1,
        slot_type: "unit_test",
        title: `Unit Test ${prev.length + 1}`,
        exam_date: null,
        marks: null,
        duration_mins: null,
        chapters: [],
      },
    ]);
  }

  const chapterPickerSlot = chapterPickerSlotId
    ? slots.find((s) => s.id === chapterPickerSlotId)
    : null;

  const filterSelectClass =
    "w-full rounded-xl border-2 border-slate-400 bg-slate-50 px-3 py-1.5 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:border-slate-500 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-60";

  const filterToolbar = (
    <PortalListFilterPanel variant="toolbar">
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-4 gap-y-2">
        <label className="block min-w-[7.5rem] text-sm">
          <span className="mb-1 block font-semibold text-slate-900">Class</span>
          <select
            disabled={setupLocked}
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className={`${filterSelectClass}`}
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[7.5rem] text-sm">
          <span className="mb-1 block font-semibold text-slate-900">Subject</span>
          <select
            disabled={setupLocked}
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className={`${filterSelectClass}`}
          >
            {teachingSubjects.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-[6.5rem] text-sm">
          <span className="mb-1 block font-semibold text-slate-900">Academic year</span>
          <select
            disabled={setupLocked}
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className={`${filterSelectClass}`}
          >
            {academicYearOptions().map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
    </PortalListFilterPanel>
  );

  const calendarToolbarActions =
    !loading && hasCalendar ? (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => setClearAllConfirmOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition-all hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
          title="Clear all dates, marks, duration, and chapters"
        >
          <RotateCcw className="h-4 w-4" aria-hidden />
          Clear all
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={saveDraftWithNumericFlush}
          className={`${dashboardHeader.secondaryBtn} font-semibold text-slate-900 disabled:opacity-50`}
          title={
            isPublished
              ? publishReadiness.hint
              : "Save your exam plan as a draft"
          }
        >
          {isPublished ? "Save updates" : "Save draft"}
        </button>
        {isPublished ? (
          <button
            type="button"
            disabled={saving}
            onClick={handleUnpublish}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-50 disabled:opacity-50"
            title="Hide calendar from students until you publish again"
          >
            Unpublish
          </button>
        ) : (
          <button
            type="button"
            disabled={saving || !publishReadiness.ready}
            title={publishReadiness.hint}
            onClick={handlePublish}
            className={`${dashboardHeader.accentBtn} disabled:opacity-50`}
          >
            {saving ? "Publishing…" : "Publish calendar"}
          </button>
        )}
      </div>
    ) : null;

  return (
    <>
      <LmsToast toast={toast} theme="light" />

      <TeacherPortalListLayout
        toolbarStart={!loading ? filterToolbar : null}
        toolbarEnd={calendarToolbarActions}
      >
        <TeacherListPageShell title="Exam Calendar" titleInShell>
          {loading ? (
            <PortalAssignmentPageLoading label="Loading exam calendar" />
          ) : (
            <div className="w-full space-y-6">
              {error ? (
                <p className="rounded-xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-sm text-rose-700">
                  {error}
                </p>
              ) : null}

              {publishErrors.length > 0 ? (
                <ul className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {publishErrors.map((e) => (
                    <li key={e}>• {e}</li>
                  ))}
                </ul>
              ) : null}

              {!setupLocked ? (
                <section className={`${portalList.listPanel} p-5 lg:p-6`}>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Exam template
                  </p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    {TEMPLATES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setTemplateId(t.id)}
                        className={`rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${
                          templateId === t.id
                            ? "border-indigo-500 bg-indigo-50 ring-2 ring-indigo-400/30"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                        }`}
                      >
                        <p className="font-medium text-slate-900">{t.title}</p>
                        <p className="mt-1 text-xs text-slate-500">{t.desc}</p>
                      </button>
                    ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleCreateDraft}
                      className={`${dashboardHeader.primaryBtn} disabled:opacity-50`}
                    >
                      {saving ? "Creating…" : "Create exam calendar"}
                    </button>
                  </div>
                </section>
              ) : null}

              {hasCalendar && calendar ? (
                <section className="space-y-4">
                  <PortalExamCalendarSummaryCards
                    counts={slotSummary}
                    onFilterClick={setSlotFilter}
                    activeFilterTab={slotFilter}
                  />

                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-base font-bold tracking-tight text-slate-900">
                        Exam schedule
                      </h2>
                      {syllabusCoverage && syllabusCoverage.total > 0 ? (
                        <div className="mt-2 max-w-md">
                          <p className="text-xs font-medium text-slate-500">
                            Syllabus coverage: {syllabusCoverage.used} /{" "}
                            {syllabusCoverage.total} chapters ({syllabusCoverage.pct}
                            %)
                          </p>
                          <div
                            className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"
                            role="progressbar"
                            aria-valuenow={syllabusCoverage.pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <div
                              className="h-full rounded-full bg-sky-500 transition-all"
                              style={{
                                width: `${Math.max(syllabusCoverage.pct, syllabusCoverage.pct === 0 ? 0 : 4)}%`,
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>
                    {calendar.status === "published" ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-100">
                        Published
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800 ring-1 ring-amber-100">
                        Draft
                      </span>
                    )}
                  </div>

                  {visibleSlots.length === 0 && slots.length > 0 ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-8 text-center">
                      <p className="text-sm font-medium text-slate-700">
                        No exams match this filter
                      </p>
                      <button
                        type="button"
                        onClick={() => setSlotFilter("all")}
                        className="mt-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        Show all exams
                      </button>
                    </div>
                  ) : (
                    <div className={`${portalList.listPanel} pb-1`}>
                      <ul className="divide-y-2 divide-slate-200">
                        {visibleSlots.map((slot) => (
                          <ExamCalendarSlotRow
                            key={slot.id}
                            slot={slot}
                            status={slotStatusFor(slot, distributedPaperIds)}
                            calendarId={calendar.id}
                            subject={subject}
                            ncertClassKey={ncertClassKey}
                            numericDrafts={numericDrafts}
                            onTitleChange={(id, title) => updateSlot(id, { title })}
                            onDateChange={(id, examDate) =>
                              updateSlot(id, { exam_date: examDate })
                            }
                            onNumericDraft={setNumericDraft}
                            onNumericCommit={commitNumericDraft}
                            onClear={(id, title) =>
                              setClearSlotTarget({ id, title })
                            }
                            onRemove={(id, title) =>
                              setRemoveSlotTarget({ id, title })
                            }
                            onChapterPicker={setChapterPickerSlotId}
                            onRemoveChapter={removeChapter}
                            onDistribute={setDistributeSlot}
                          />
                        ))}
                      </ul>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={addEmptySlot}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-700"
                  >
                    <Plus className="h-4 w-4" />
                    Add exam slot
                  </button>
                </section>
              ) : null}

            </div>
          )}
        </TeacherListPageShell>
      </TeacherPortalListLayout>

      <ExamCalendarClearConfirmDialog
        open={clearAllConfirmOpen}
        mode="all"
        examCount={slots.length}
        onConfirm={confirmClearAll}
        onCancel={() => setClearAllConfirmOpen(false)}
      />
      <ExamCalendarClearConfirmDialog
        open={Boolean(clearSlotTarget)}
        mode="single"
        slotTitle={clearSlotTarget?.title ?? ""}
        onConfirm={confirmClearSlot}
        onCancel={() => setClearSlotTarget(null)}
      />
      <ExamCalendarClearConfirmDialog
        open={Boolean(removeSlotTarget)}
        mode="remove"
        slotTitle={removeSlotTarget?.title ?? ""}
        onConfirm={confirmRemoveSlot}
        onCancel={() => setRemoveSlotTarget(null)}
      />

      {distributeSlot?.linked_paper_id && (
        <CreatePaperDistributionModal
          open={Boolean(distributeSlot)}
          paperId={distributeSlot.linked_paper_id}
          defaultTitle={`${distributeSlot.title} — ${subject}`}
          classId={classId}
          defaultDueAt={distributeSlot.exam_date}
          onClose={() => setDistributeSlot(null)}
          onCreated={() => {
            setDistributeSlot(null);
            showSuccess("Paper distributed to class");
            void loadCalendar();
          }}
        />
      )}

      {chapterPickerSlot && (
        <ExamCalendarChapterPickerModal
          open={Boolean(chapterPickerSlotId)}
          slotTitle={chapterPickerSlot.title}
          manifestChapters={manifestChapters}
          existingKeys={new Set(chapterPickerSlot.chapters.map((c) => c.chapter_key))}
          ncertClassKey={ncertClassKey}
          manifestSubject={manifestSubject}
          onClose={() => setChapterPickerSlotId(null)}
          onApply={(chapters) => addChaptersBulk(chapterPickerSlot.id, chapters)}
          onAddSingle={(label, url) =>
            addChapterToSlot(chapterPickerSlot.id, label, url)
          }
        />
      )}
    </>
  );
}
