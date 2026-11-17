import {
  getChaptersForSubject,
  type ChapterNamesMap,
  type ManifestFiles,
  type PdfUrlRemap,
} from "./ncertJourney";

export type ManifestChapter = {
  chapter_key: string;
  chapter_label: string;
  pdf_url: string;
  raw_code: string;
};

let manifestCache: ManifestFiles | null = null;
let chapterNamesCache: ChapterNamesMap | null = null;
let pdfUrlRemapCache: PdfUrlRemap | null = null;

export async function loadNcertManifest(): Promise<ManifestFiles> {
  if (manifestCache) return manifestCache;
  const res = await fetch("/ncert/manifest.json");
  if (!res.ok) throw new Error("Could not load NCERT manifest");
  manifestCache = (await res.json()) as ManifestFiles;
  return manifestCache;
}

async function loadChapterNames(): Promise<ChapterNamesMap> {
  if (chapterNamesCache) return chapterNamesCache;
  const res = await fetch("/ncert/chapter_names.json");
  if (!res.ok) return {};
  chapterNamesCache = (await res.json()) as ChapterNamesMap;
  return chapterNamesCache;
}

export async function loadPdfUrlRemap(): Promise<PdfUrlRemap | null> {
  if (pdfUrlRemapCache) return pdfUrlRemapCache;
  const res = await fetch("/ncert/pdf_url_remap.json");
  if (!res.ok) return null;
  const data = (await res.json()) as { remap?: PdfUrlRemap };
  pdfUrlRemapCache = data.remap ?? null;
  return pdfUrlRemapCache;
}

export function subjectManifestKey(subject: string): string {
  const s = subject.trim().toLowerCase();
  if (s === "maths" || s === "mathematics") return "mathematics";
  if (s === "social science") return "social-science";
  return s;
}

/** English NCERT chapters with human titles from chapter_names.json (same as NCERT picker). */
export async function listManifestChapters(
  ncertClassKey: string,
  subject: string,
): Promise<ManifestChapter[]> {
  const [manifest, chapterNames, pdfUrlRemap] = await Promise.all([
    loadNcertManifest(),
    loadChapterNames(),
    loadPdfUrlRemap(),
  ]);
  const subj = subjectManifestKey(subject);
  const rows = getChaptersForSubject(
    manifest,
    chapterNames,
    ncertClassKey,
    subj,
    "English",
    pdfUrlRemap,
  );
  return rows.map((ch) => ({
    chapter_key: ch.url || ch.rawCode,
    chapter_label: ch.displayTitle,
    pdf_url: ch.url,
    raw_code: ch.rawCode,
  }));
}

function chapterNumber(ch: ManifestChapter): number | null {
  const fromLabel = ch.chapter_label.match(/Ch\s*(\d+)/i);
  if (fromLabel) return Number(fromLabel[1]);
  const m = ch.raw_code.match(/(\d{2})$/);
  if (m) {
    const n = parseInt(m[1], 10);
    return n >= 1 ? n : null;
  }
  return null;
}

export function chaptersInRange(
  all: ManifestChapter[],
  from: number,
  to: number,
): ManifestChapter[] {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  return all.filter((ch) => {
    const n = chapterNumber(ch);
    return n != null && n >= lo && n <= hi;
  });
}

export function termOnePreset(all: ManifestChapter[]): ManifestChapter[] {
  const nums = all
    .map((ch) => ({ ch, n: chapterNumber(ch) }))
    .filter((x): x is { ch: ManifestChapter; n: number } => x.n != null);
  if (!nums.length) return [];
  const max = Math.max(...nums.map((x) => x.n));
  const cutoff = Math.max(1, Math.ceil(max / 2));
  return nums.filter((x) => x.n <= cutoff).map((x) => x.ch);
}
