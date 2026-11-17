"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Brain,
  Database,
  Globe,
  Loader2,
  PenLine,
  Sparkles,
} from "lucide-react";
import { useTeacherClassStore } from "@/store/teacherClassStore";
import { apiUrl } from "@/lib/api";
import { resolveCoWriterSource } from "@/lib/coWriterNotebook";
import type { CoWriterCitation } from "@/lib/coWriterNotebook";
import {
  classKeyFromTeacherClassId,
  formatClassBadge,
  getAvailableMedia,
  getChaptersForSubject,
  getSubjectsForClass,
  kbNameForClassSubject,
  listClassKeysFromManifest,
  loadCoWriterContext,
  ncertBookSummary,
  saveCoWriterContext,
  subjectDisplayLabel,
  type ChapterNamesMap,
  type CoWriterContext,
  type JourneyMedium,
  type ManifestFiles,
  type NcertChapterOption,
  type PdfUrlRemap,
} from "@/lib/ncertJourney";

export interface CoWriterContextBarProps {
  kbName: string;
  onContextChange: (ctx: CoWriterContext, kbName: string) => void;
  onStartWriting: (content: string, citations: CoWriterCitation[]) => void;
}

const DEFAULT_CONTEXT: Omit<CoWriterContext, "classKey" | "subjectKey"> = {
  v: 2,
  medium: "English",
  ragEnabled: true,
  webSearchEnabled: false,
  thinkingEnabled: false,
  perspective: "teacher",
};

export default function CoWriterContextBar({
  kbName,
  onContextChange,
  onStartWriting,
}: CoWriterContextBarProps) {
  const { t } = useTranslation();
  const teacherClassId = useTeacherClassStore((s) => s.classId);

  const [manifest, setManifest] = useState<ManifestFiles | null>(null);
  const [chapterNames, setChapterNames] = useState<ChapterNamesMap | null>(
    null,
  );
  const [pdfUrlRemap, setPdfUrlRemap] = useState<PdfUrlRemap | null>(null);
  const [classKey, setClassKey] = useState("class-8");
  const [subjectKey, setSubjectKey] = useState("");
  const [chapterLabel, setChapterLabel] = useState("");
  const [chapterUrl, setChapterUrl] = useState<string | undefined>();
  const [chapterRawCode, setChapterRawCode] = useState<string | undefined>();
  const [medium, setMedium] = useState<JourneyMedium>("English");
  const [ragEnabled, setRagEnabled] = useState(true);
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [perspective, setPerspective] = useState<"teacher" | "student">(
    "teacher",
  );
  const [teacherDescription, setTeacherDescription] = useState("");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/ncert/manifest.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setManifest)
      .catch(() => setManifest(null));
    fetch("/ncert/chapter_names.json")
      .then((r) => (r.ok ? r.json() : null))
      .then(setChapterNames)
      .catch(() => setChapterNames(null));
    fetch("/ncert/pdf_url_remap.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setPdfUrlRemap(data?.remap ?? null))
      .catch(() => setPdfUrlRemap(null));
  }, []);

  useEffect(() => {
    const saved = loadCoWriterContext();
    if (saved) {
      setClassKey(saved.classKey);
      setSubjectKey(saved.subjectKey);
      setMedium(saved.medium);
      setChapterLabel(saved.chapterLabel || "");
      setChapterUrl(saved.chapterUrl);
      setChapterRawCode(saved.chapterRawCode);
      setRagEnabled(saved.ragEnabled);
      setWebSearchEnabled(saved.webSearchEnabled);
      setThinkingEnabled(saved.thinkingEnabled);
      setPerspective(saved.perspective || "teacher");
      setTeacherDescription(saved.teacherDescription || "");
      return;
    }
    setClassKey(classKeyFromTeacherClassId(teacherClassId));
  }, [teacherClassId]);

  const classKeys = useMemo(
    () => (manifest ? listClassKeysFromManifest(manifest) : []),
    [manifest],
  );

  const availableMedia = useMemo(() => {
    if (!manifest || !subjectKey) return ["English"] as JourneyMedium[];
    return getAvailableMedia(manifest, classKey, subjectKey);
  }, [manifest, classKey, subjectKey]);

  const subjects = useMemo(
    () => (manifest ? getSubjectsForClass(manifest, classKey, medium) : []),
    [manifest, classKey, medium],
  );

  const chapters = useMemo(() => {
    if (!manifest || !subjectKey) return [];
    return getChaptersForSubject(
      manifest,
      chapterNames,
      classKey,
      subjectKey,
      medium,
      pdfUrlRemap,
    );
  }, [manifest, chapterNames, classKey, subjectKey, medium, pdfUrlRemap]);

  const bookSummary = useMemo(
    () => ncertBookSummary(manifest, classKey, subjectKey, medium),
    [manifest, classKey, subjectKey, medium],
  );

  const currentContext = useMemo((): CoWriterContext | null => {
    if (!subjectKey) return null;
    return {
      ...DEFAULT_CONTEXT,
      classKey,
      subjectKey,
      medium,
      chapterLabel: chapterLabel || undefined,
      chapterUrl,
      chapterRawCode,
      ragEnabled,
      webSearchEnabled,
      thinkingEnabled,
      perspective,
      teacherDescription: teacherDescription.trim() || undefined,
    };
  }, [
    classKey,
    subjectKey,
    medium,
    chapterLabel,
    chapterUrl,
    chapterRawCode,
    ragEnabled,
    webSearchEnabled,
    thinkingEnabled,
    perspective,
    teacherDescription,
  ]);

  useEffect(() => {
    if (subjects.length > 0 && !subjects.includes(subjectKey)) {
      setSubjectKey(subjects[0]);
      setChapterLabel("");
      setChapterUrl(undefined);
      setChapterRawCode(undefined);
    }
  }, [subjects, subjectKey]);

  useEffect(() => {
    if (availableMedia.length > 0 && !availableMedia.includes(medium)) {
      setMedium(availableMedia[0]);
    }
  }, [availableMedia, medium]);

  const resolvedKb = useMemo(
    () => (subjectKey ? kbNameForClassSubject(classKey, subjectKey) : kbName),
    [classKey, subjectKey, kbName],
  );

  useEffect(() => {
    if (!currentContext) return;
    saveCoWriterContext(currentContext);
    onContextChange(currentContext, resolvedKb);
  }, [currentContext, resolvedKb, onContextChange]);

  const selectChapter = (ch: NcertChapterOption | null) => {
    if (!ch) {
      setChapterLabel("");
      setChapterUrl(undefined);
      setChapterRawCode(undefined);
      return;
    }
    setChapterLabel(ch.displayTitle);
    setChapterUrl(ch.url);
    setChapterRawCode(ch.rawCode);
  };

  const handleStartWriting = async () => {
    if (!currentContext) return;
    const source = resolveCoWriterSource(currentContext);
    if (!source) {
      setStartError(t("cowriter.start.select_source"));
      return;
    }

    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(apiUrl("/api/v1/co_writer/start_writing"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          class_key: currentContext.classKey,
          subject_key: currentContext.subjectKey,
          chapter_label: currentContext.chapterLabel,
          kb_name: resolvedKb || undefined,
          description: currentContext.teacherDescription,
          perspective: currentContext.perspective,
          source,
          enable_thinking: currentContext.thinkingEnabled,
        }),
      });
      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      onStartWriting(data.content || "", data.citations || []);
    } catch (e: unknown) {
      setStartError(
        e instanceof Error ? e.message : t("cowriter.start.error"),
      );
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-2 border-b border-slate-100 bg-gradient-to-r from-rose-50/80 to-purple-50/80 px-3 py-2 dark:border-slate-700 dark:from-rose-950/30 dark:to-purple-950/30">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
          <BookOpen className="h-3.5 w-3.5 text-rose-500" />
          {t("cowriter.context.title")}
        </div>

        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-600 dark:bg-slate-800">
          {(["teacher", "student"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPerspective(p)}
              className={`rounded-md px-2.5 py-1 text-[10px] font-semibold capitalize ${
                perspective === p
                  ? "bg-rose-500 text-white"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {t(`cowriter.perspective.${p}`)}
            </button>
          ))}
        </div>

        <select
          value={classKey}
          onChange={(e) => {
            setClassKey(e.target.value);
            setSubjectKey("");
            selectChapter(null);
          }}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          aria-label={t("cowriter.context.class")}
        >
          {classKeys.map((ck) => (
            <option key={ck} value={ck}>
              {formatClassBadge(ck)}
            </option>
          ))}
        </select>

        <select
          value={subjectKey}
          onChange={(e) => {
            setSubjectKey(e.target.value);
            selectChapter(null);
          }}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          aria-label={t("cowriter.context.subject")}
        >
          {subjects.map((s) => (
            <option key={s} value={s}>
              {subjectDisplayLabel(s)}
            </option>
          ))}
        </select>

        <select
          value={medium}
          onChange={(e) => setMedium(e.target.value as JourneyMedium)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          aria-label={t("cowriter.context.medium")}
        >
          {availableMedia.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>

        <select
          value={chapterLabel}
          onChange={(e) => {
            const ch = chapters.find((c) => c.displayTitle === e.target.value);
            if (ch) selectChapter(ch);
            else selectChapter(null);
          }}
          className="min-w-[10rem] rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          aria-label={t("cowriter.context.chapter")}
        >
          <option value="">{t("cowriter.context.all_chapters")}</option>
          {chapters.map((ch) => (
            <option key={ch.rawCode} value={ch.displayTitle}>
              {ch.displayTitle}
            </option>
          ))}
        </select>

        <button
          type="button"
          disabled={starting || !currentContext}
          onClick={() => void handleStartWriting()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-rose-500 to-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:from-rose-600 hover:to-purple-700 disabled:opacity-60"
        >
          {starting ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <PenLine className="h-3.5 w-3.5" />
          )}
          {t("cowriter.start.button")}
        </button>
      </div>

      {bookSummary && (
        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          <Sparkles className="mr-1 inline h-3 w-3 text-rose-400" />
          {bookSummary}
          {resolvedKb && ragEnabled && (
            <span className="ml-2 text-slate-400">· KB: {resolvedKb}</span>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="mb-1 block text-[10px] font-bold uppercase text-slate-500">
            {perspective === "teacher"
              ? t("cowriter.context.teacher_description")
              : t("cowriter.context.student_description")}
          </label>
          <textarea
            value={teacherDescription}
            onChange={(e) => setTeacherDescription(e.target.value)}
            rows={2}
            placeholder={
              perspective === "teacher"
                ? t("cowriter.context.teacher_description_placeholder")
                : t("cowriter.context.student_description_placeholder")
            }
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-4">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={ragEnabled}
              onChange={(e) => setRagEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            <Database className="h-3 w-3 text-purple-500" />
            {t("cowriter.context.rag")}
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={webSearchEnabled}
              onChange={(e) => setWebSearchEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            <Globe className="h-3 w-3 text-blue-500" />
            {t("cowriter.context.web_search")}
          </label>
          <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={thinkingEnabled}
              onChange={(e) => setThinkingEnabled(e.target.checked)}
              className="rounded border-slate-300"
            />
            <Brain className="h-3 w-3 text-indigo-500" />
            {t("cowriter.context.thinking")}
          </label>
        </div>
      </div>

      {startError && (
        <p className="rounded-lg bg-red-50 px-2 py-1 text-[11px] text-red-600 dark:bg-red-900/30 dark:text-red-400">
          {startError}
        </p>
      )}
    </div>
  );
}
