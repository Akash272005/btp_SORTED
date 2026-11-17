/** NCERT catalog helpers for the personalized student chat journey. */

export interface ManifestEntry {
  filename: string;
  url: string;
  label: string;
  medium: string;
  raw_code: string;
}

export type ManifestFiles = Record<
  string,
  Record<string, ManifestEntry[]>
>;

export type ChapterNamesMap = Record<
  string,
  Record<string, Record<string, string>>
>;

/** raw_code → title extracted from PDF metadata (fallback). */
export type PdfTitlesMap = Record<string, string>;

/** raw_code → corrected PDF URL (Azure blob files are often mislabeled). */
export type PdfUrlRemap = Record<
  string,
  Record<string, Record<string, string>>
>;

export type JourneyMedium = "English" | "Hindi";

export interface NcertChapterOption {
  rawCode: string;
  url: string;
  label: string;
  displayTitle: string;
}

/** Persisted selection for student chapter + chat workspace */
export interface StudentChatContext {
  v: 2;
  classKey: string;
  classNum: number;
  medium: JourneyMedium;
  subjectKey: string;
  subjectLabel: string;
  chapterUrl: string;
  chapterLabel: string;
  chapterRawCode: string;
}

const SECONDARY_SUBJECT_ORDER = [
  "maths",
  "science",
  "social-science",
  "hindi",
  "english",
];

const SENIOR_SCIENCE_ORDER = [
  "physics",
  "chemistry",
  "maths",
  "biology",
  "english",
  "computer-science",
];

const SUBJECT_LABELS: Record<string, string> = {
  maths: "Maths",
  science: "Science",
  "social-science": "Social Science",
  hindi: "Hindi",
  english: "English",
  sanskrit: "Sanskrit",
  physics: "Physics",
  chemistry: "Chemistry",
  biology: "Biology",
  "computer-science": "Computer Science",
  accountancy: "Accountancy",
  economics: "Economics",
  history: "History",
  geography: "Geography",
  "political-science": "Political Science",
  psychology: "Psychology",
  sociology: "Sociology",
  "business-studies": "Business Studies",
};

const STORAGE_KEY = "vidyasetu-student-chat-context";
const COWRITER_STORAGE_KEY = "vidyasetu-co-writer-context";

/** Persisted NCERT context for Co-Writer (teacher class prep). */
export interface CoWriterContext {
  v: 2;
  classKey: string;
  subjectKey: string;
  medium: JourneyMedium;
  chapterLabel?: string;
  chapterUrl?: string;
  chapterRawCode?: string;
  ragEnabled: boolean;
  webSearchEnabled: boolean;
  thinkingEnabled: boolean;
  perspective: "teacher" | "student";
  teacherDescription?: string;
}

/** Legacy v1 shape (loaded and migrated to v2). */
interface CoWriterContextV1 {
  v: 1;
  classKey: string;
  subjectKey: string;
  chapterLabel?: string;
  ragEnabled: boolean;
}

function migrateCoWriterContext(
  parsed: CoWriterContext | CoWriterContextV1,
): CoWriterContext | null {
  if (!parsed?.classKey || !parsed?.subjectKey) return null;
  if (parsed.v === 2) return parsed as CoWriterContext;
  if (parsed.v === 1) {
    return {
      v: 2,
      classKey: parsed.classKey,
      subjectKey: parsed.subjectKey,
      medium: "English",
      chapterLabel: parsed.chapterLabel,
      ragEnabled: parsed.ragEnabled,
      webSearchEnabled: false,
      thinkingEnabled: false,
      perspective: "teacher",
    };
  }
  return null;
}

export function listClassKeysFromManifest(manifest: ManifestFiles): string[] {
  return Object.keys(manifest)
    .filter((k) => k.startsWith("class-"))
    .sort((a, b) => classNumFromKey(a) - classNumFromKey(b));
}

export function ncertBookSummary(
  manifest: ManifestFiles | null,
  classKey: string,
  subjectKey: string,
  medium: JourneyMedium,
): string {
  if (!manifest) return "";
  const entries = (manifest[classKey]?.[subjectKey] || []).filter(
    (e) => e.medium === medium,
  );
  const chapters = entries.filter(
    (e) => !/prelims|contents/i.test(e.label) && !/1ps$/i.test(e.raw_code),
  );
  return `NCERT ${formatClassBadge(classKey)} ${subjectDisplayLabel(subjectKey)} · ${chapters.length} chapters · ${medium}`;
}

export function classKeyFromTeacherClassId(classId: string): string {
  const m = classId.match(/\b(\d{1,2})\b/);
  if (m) return `class-${m[1]}`;
  return "class-8";
}

export function saveCoWriterContext(ctx: CoWriterContext): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(COWRITER_STORAGE_KEY, JSON.stringify(ctx));
}

export function loadCoWriterContext(): CoWriterContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(COWRITER_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CoWriterContext | CoWriterContextV1;
    return migrateCoWriterContext(parsed);
  } catch {
    return null;
  }
}

export function clearCoWriterContext(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(COWRITER_STORAGE_KEY);
}

export function parseClassKeyFromUser(
  grade?: string | null,
  classId?: string | null,
): string {
  const blob = [grade, classId].filter(Boolean).join(" ");
  const m = blob.match(/\b(\d{1,2})\b/);
  if (m) return `class-${m[1]}`;
  return "class-8";
}

export function classNumFromKey(classKey: string): number {
  return parseInt(classKey.replace("class-", ""), 10) || 8;
}

export function formatClassBadge(classKey: string): string {
  const n = classNumFromKey(classKey);
  const suffix =
    n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th";
  return `Class ${n}${suffix}`;
}

export function subjectDisplayLabel(subjectKey: string): string {
  return (
    SUBJECT_LABELS[subjectKey] ||
    subjectKey
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  );
}

export function resolveChapterName(
  chapterNames: ChapterNamesMap | null,
  classKey: string,
  subjectKey: string,
  rawCode: string,
): string {
  if (!chapterNames) return "";
  const subjKey = subjectKey.toLowerCase().replace(/\s+/g, "-");
  return (
    chapterNames[classKey]?.[subjKey]?.[rawCode] ||
    chapterNames[classKey]?.[subjectKey]?.[rawCode] ||
    ""
  );
}

function stripManifestLabel(label: string): string {
  return label.replace(/^🇬🇧 |^🇮🇳 /, "").trim();
}

function looksLikeRawCode(name: string, rawCode: string): boolean {
  const n = name.trim();
  if (!n) return true;
  if (n.toLowerCase() === rawCode.toLowerCase()) return true;
  return /^[a-z]{2,5}\d[a-z0-9]{1,6}$/i.test(n);
}

function isGoodPdfTitle(title: string): boolean {
  const t = title.trim();
  if (t.length < 4 || t.length > 120) return false;
  if (/indd|\.pdf|chapter\s*\d+\.indd/i.test(t)) return false;
  if (/^\d+\.\s*\([a-z]\)/i.test(t)) return false;
  if (/^textbook for c lass/i.test(t)) return false;
  return true;
}

function isUsableChapterTitle(name: string, rawCode: string): boolean {
  const n = name.trim();
  if (n.length < 2) return false;
  if (looksLikeRawCode(n, rawCode)) return false;
  return true;
}

/** Human-readable chapter title — same resolution as chat NCERT source picker. */
export function getNcertChapterDisplayLabel(
  chapterNames: ChapterNamesMap | null,
  classKey: string,
  subjectKey: string,
  entry: Pick<ManifestEntry, "label" | "raw_code">,
  pdfTitles?: PdfTitlesMap | null,
): string {
  const fallback = stripManifestLabel(entry.label) || entry.raw_code;
  const fromCatalog = resolveChapterName(
    chapterNames,
    classKey,
    subjectKey,
    entry.raw_code,
  ).trim();
  if (isUsableChapterTitle(fromCatalog, entry.raw_code)) {
    return fromCatalog;
  }
  const fromPdf = (pdfTitles?.[entry.raw_code] || "").trim();
  if (isUsableChapterTitle(fromPdf, entry.raw_code) && isGoodPdfTitle(fromPdf)) {
    return fromPdf;
  }
  return fallback;
}

export function filterNcertManifestFiles(
  files: ManifestEntry[],
  medium: JourneyMedium | "all",
): ManifestEntry[] {
  if (medium === "all") return files;
  return files.filter((f) => f.medium === medium);
}

export function resolveChapterPdfUrl(
  pdfUrlRemap: PdfUrlRemap | null,
  classKey: string,
  subjectKey: string,
  rawCode: string,
  manifestUrl: string,
): string {
  if (!pdfUrlRemap) return manifestUrl;
  const subjKey = subjectKey.toLowerCase().replace(/\s+/g, "-");
  return (
    pdfUrlRemap[classKey]?.[subjKey]?.[rawCode] ||
    pdfUrlRemap[classKey]?.[subjectKey]?.[rawCode] ||
    manifestUrl
  );
}

export function normalizeStudentChatContext(
  ctx: StudentChatContext,
  pdfUrlRemap: PdfUrlRemap | null,
): StudentChatContext {
  const chapterUrl = resolveChapterPdfUrl(
    pdfUrlRemap,
    ctx.classKey,
    ctx.subjectKey,
    ctx.chapterRawCode,
    ctx.chapterUrl,
  );
  if (chapterUrl === ctx.chapterUrl) return ctx;
  return { ...ctx, chapterUrl };
}

export function getSubjectsForClass(
  manifest: ManifestFiles,
  classKey: string,
  medium?: JourneyMedium | null,
): string[] {
  const keys = Object.keys(manifest[classKey] || {}).filter((subj) => {
    if (!medium) return true;
    return getAvailableMedia(manifest, classKey, subj).includes(medium);
  });
  const n = classNumFromKey(classKey);
  let order: string[] = [];
  if (n >= 6 && n <= 10) order = SECONDARY_SUBJECT_ORDER;
  else if (n >= 11) order = SENIOR_SCIENCE_ORDER;

  return [...keys].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    }
    return subjectDisplayLabel(a).localeCompare(subjectDisplayLabel(b));
  });
}

export function getAvailableMedia(
  manifest: ManifestFiles,
  classKey: string,
  subjectKey: string,
): JourneyMedium[] {
  const entries = manifest[classKey]?.[subjectKey] || [];
  const media = new Set<JourneyMedium>();
  for (const e of entries) {
    if (e.medium === "English" || e.medium === "Hindi") {
      media.add(e.medium);
    }
  }
  return (["English", "Hindi"] as const).filter((m): m is JourneyMedium =>
    media.has(m),
  );
}

function isChapterEntry(e: ManifestEntry): boolean {
  return (
    !/prelims|contents/i.test(e.label) && !/1ps$/i.test(e.raw_code)
  );
}

export function getChaptersForSubject(
  manifest: ManifestFiles,
  chapterNames: ChapterNamesMap | null,
  classKey: string,
  subjectKey: string,
  medium: JourneyMedium,
  pdfUrlRemap?: PdfUrlRemap | null,
): NcertChapterOption[] {
  const entries = (manifest[classKey]?.[subjectKey] || [])
    .filter((e) => e.medium === medium && isChapterEntry(e))
    .sort((a, b) => a.raw_code.localeCompare(b.raw_code));

  return entries.map((e) => ({
    rawCode: e.raw_code,
    url: resolveChapterPdfUrl(
      pdfUrlRemap ?? null,
      classKey,
      subjectKey,
      e.raw_code,
      e.url,
    ),
    label: e.label,
    displayTitle: getNcertChapterDisplayLabel(
      chapterNames,
      classKey,
      subjectKey,
      e,
    ),
  }));
}

export function saveStudentChatContext(ctx: StudentChatContext): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
}

function isValidContext(raw: unknown): raw is StudentChatContext {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as Record<string, unknown>;
  return (
    o.v === 2 &&
    typeof o.chapterUrl === "string" &&
    o.chapterUrl.length > 0
  );
}

export function loadStudentChatContext(): StudentChatContext | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidContext(parsed)) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearStudentChatContext(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

/** Returns the per-class KB name (used as fallback when subject is unknown). */
export function kbNameForClass(classKey: string): string {
  const n = classNumFromKey(classKey);
  return `ncert-class-${n}`;
}

/**
 * Returns the per-class-subject KB name.
 * e.g. ("class-8", "science") → "ncert-class-8-science"
 * Falls back to kbNameForClass if no subject provided.
 */
export function kbNameForClassSubject(
  classKey: string,
  subjectKey?: string | null,
): string {
  const n = classNumFromKey(classKey);
  if (!subjectKey) return `ncert-class-${n}`;
  const subj = subjectKey.toLowerCase().replace(/\s+/g, "-");
  return `ncert-class-${n}-${subj}`;
}

/**
 * Returns true for any system NCERT knowledge base
 * (ncert-class-8, ncert-class-8-science, ncert-all, class_8_science, etc.)
 */
export function isNcertKb(kbName: string): boolean {
  return kbName.startsWith("ncert-") || kbName.startsWith("class_");
}

/**
 * Checks if two knowledge base names are equivalent (e.g. ncert-class-9-science vs class_9_science)
 */
export function isKbEquivalent(kbName1: string | null | undefined, kbName2: string | null | undefined): boolean {
  if (!kbName1 || !kbName2) return kbName1 === kbName2;
  const norm = (s: string) => s.toLowerCase().replace(/^ncert-/, "").replace(/[-_]/g, "");
  return norm(kbName1) === norm(kbName2);
}

export function buildChapterContext(
  classKey: string,
  medium: JourneyMedium,
  subjectKey: string,
  chapter: NcertChapterOption,
): StudentChatContext {
  return {
    v: 2,
    classKey,
    classNum: classNumFromKey(classKey),
    medium,
    subjectKey,
    subjectLabel: subjectDisplayLabel(subjectKey),
    chapterUrl: chapter.url,
    chapterLabel: chapter.displayTitle,
    chapterRawCode: chapter.rawCode,
  };
}
