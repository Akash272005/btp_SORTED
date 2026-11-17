"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, ChevronLeft } from "lucide-react";
import { useAuthStore } from "@/store/authStore";
import type { AuthUser } from "@/types/lms";
import {
  buildChapterContext,
  formatClassBadge,
  getChaptersForSubject,
  getSubjectsForClass,
  parseClassKeyFromUser,
  subjectDisplayLabel,
  type ChapterNamesMap,
  type JourneyMedium,
  type ManifestFiles,
  type NcertChapterOption,
  type PdfUrlRemap,
  type StudentChatContext,
} from "@/lib/ncertJourney";

type Step = "medium" | "subject" | "chapter";

const STEPS: { id: Step; label: string }[] = [
  { id: "medium", label: "Language" },
  { id: "subject", label: "Subject" },
  { id: "chapter", label: "Chapter" },
];

interface StudentChatJourneyProps {
  onChapterReady: (ctx: StudentChatContext) => void;
}

function profileSubtitle(user: AuthUser): string {
  const parts: string[] = [];
  if (user.roll_no) parts.push(`Roll No. ${user.roll_no}`);
  if (user.grade) parts.push(user.grade);
  return parts.join(" · ") || "Student";
}

function ChoicePill({
  label,
  selected,
  onClick,
  className = "",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-5 py-2.5 text-sm font-medium transition-all ${
        selected
          ? "border-vidya-400 bg-vidya-50 text-vidya-800 shadow-sm dark:border-vidya-500/60 dark:bg-vidya-900/30 dark:text-vidya-100"
          : "border-border bg-card text-foreground hover:border-vidya-300 hover:bg-vidya-50/70 dark:hover:border-vidya-600 dark:hover:bg-vidya-950/30"
      } ${className}`}
    >
      {label}
    </button>
  );
}

export default function StudentChatJourney({
  onChapterReady,
}: StudentChatJourneyProps) {
  const user = useAuthStore((s) => s.user);
  const [manifest, setManifest] = useState<ManifestFiles | null>(null);
  const [chapterNames, setChapterNames] = useState<ChapterNamesMap | null>(null);
  const [pdfUrlRemap, setPdfUrlRemap] = useState<PdfUrlRemap | null>(null);
  const [step, setStep] = useState<Step>("medium");
  const [medium, setMedium] = useState<JourneyMedium | null>(null);
  const [subjectKey, setSubjectKey] = useState<string | null>(null);
  const [chapter, setChapter] = useState<NcertChapterOption | null>(null);

  const classKey = useMemo(
    () => parseClassKeyFromUser(user?.grade, user?.class_id),
    [user?.grade, user?.class_id],
  );

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

  const subjects = useMemo(
    () => (manifest ? getSubjectsForClass(manifest, classKey, medium) : []),
    [manifest, classKey, medium],
  );

  const chapters = useMemo(() => {
    if (!manifest || !medium || !subjectKey) return [];
    return getChaptersForSubject(
      manifest,
      chapterNames,
      classKey,
      subjectKey,
      medium,
      pdfUrlRemap,
    );
  }, [manifest, chapterNames, classKey, subjectKey, medium, pdfUrlRemap]);

  const stepIndex =
    step === "chapter" ? 2 : STEPS.findIndex((s) => s.id === step);

  const canContinue =
    (step === "medium" && medium) ||
    (step === "subject" && subjectKey) ||
    (step === "chapter" && chapter);

  const goNext = () => {
    if (step === "medium" && medium) {
      setStep("subject");
      return;
    }
    if (step === "subject" && subjectKey) {
      setStep("chapter");
      return;
    }
    if (step === "chapter" && chapter && medium && subjectKey) {
      onChapterReady(buildChapterContext(classKey, medium, subjectKey, chapter));
    }
  };

  const goBack = () => {
    if (step === "chapter") {
      setStep("subject");
      return;
    }
    if (step === "subject") {
      setStep("medium");
    }
  };

  if (!user) return null;

  const initials =
    user.avatar_initials ||
    user.full_name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-8 flex items-center gap-4 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-sm">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-vidya-100 text-base font-bold text-vidya-800 dark:bg-vidya-900/50 dark:text-vidya-200">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-foreground">
            {user.full_name}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            {profileSubtitle(user)}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-vidya-600 px-3 py-1 text-xs font-semibold text-white">
          {formatClassBadge(classKey)}
        </span>
      </div>

      <div className="mb-10 flex items-center justify-center">
        {STEPS.map((s, i) => {
          const active = i === stepIndex;
          const done = i < stepIndex;
          return (
            <div key={s.id} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold ${
                    active
                      ? "bg-vidya-600 text-white"
                      : done
                        ? "bg-vidya-200 text-vidya-900 dark:bg-vidya-800 dark:text-vidya-100"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-4 w-4" /> : i + 1}
                </div>
                <span
                  className={`mt-2 text-xs font-medium ${
                    active ? "text-vidya-600 dark:text-vidya-400" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`mx-3 mb-5 h-px w-12 sm:w-20 ${
                    i < stepIndex ? "bg-vidya-400" : "bg-border"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="min-h-[220px]">
        {step === "medium" && (
          <>
            <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
              Choose your language
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Hindi or English medium · {formatClassBadge(classKey)}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <ChoicePill
                label="English"
                selected={medium === "English"}
                onClick={() => {
                  setMedium("English");
                  setSubjectKey(null);
                  setChapter(null);
                }}
              />
              <ChoicePill
                label="हिंदी (Hindi)"
                selected={medium === "Hindi"}
                onClick={() => {
                  setMedium("Hindi");
                  setSubjectKey(null);
                  setChapter(null);
                }}
              />
            </div>
          </>
        )}

        {step === "subject" && medium && (
          <>
            <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
              What do you want to study?
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {medium} medium · subjects for {formatClassBadge(classKey)}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              {subjects.map((key) => (
                <ChoicePill
                  key={key}
                  label={subjectDisplayLabel(key)}
                  selected={subjectKey === key}
                  onClick={() => {
                    setSubjectKey(key);
                    setChapter(null);
                  }}
                />
              ))}
            </div>
          </>
        )}

        {step === "chapter" && medium && subjectKey && (
          <>
            <h2 className="text-center text-2xl font-bold text-foreground sm:text-3xl">
              Pick a chapter
            </h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              {subjectDisplayLabel(subjectKey)} · {medium}
            </p>
            <div className="mt-6 max-h-[min(50vh,420px)] overflow-y-auto rounded-2xl border border-border bg-muted/40 p-4">
              <div className="flex flex-wrap justify-center gap-2.5">
                {chapters.map((ch) => (
                  <ChoicePill
                    key={ch.rawCode}
                    label={ch.displayTitle}
                    selected={chapter?.rawCode === ch.rawCode}
                    onClick={() => setChapter(ch)}
                    className="text-left !rounded-2xl max-w-full"
                  />
                ))}
              </div>
              {chapters.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No chapters found for this subject and language.
                </p>
              )}
            </div>
          </>
        )}
      </div>

      <div className="mt-10 flex items-center justify-between">
        {step !== "medium" ? (
          <button
            type="button"
            onClick={goBack}
            className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={goNext}
          disabled={!canContinue}
          className="inline-flex items-center gap-2 rounded-full border border-vidya-300 bg-vidya-600 px-6 py-2.5 text-sm font-medium text-white transition enabled:hover:bg-vidya-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-vidya-500"
        >
          {step === "chapter" ? "Open chapter" : "Continue"}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
