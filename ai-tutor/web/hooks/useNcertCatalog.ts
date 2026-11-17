"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getNcertChapterDisplayLabel,
  resolveChapterPdfUrl,
  type ChapterNamesMap,
  type JourneyMedium,
  type ManifestEntry,
  type ManifestFiles,
  type PdfTitlesMap,
  type PdfUrlRemap,
} from "@/lib/ncertJourney";

export function useNcertCatalog() {
  const [manifest, setManifest] = useState<ManifestFiles | null>(null);
  const [chapterNames, setChapterNames] = useState<ChapterNamesMap | null>(
    null,
  );
  const [pdfTitles, setPdfTitles] = useState<PdfTitlesMap | null>(null);
  const [pdfUrlRemap, setPdfUrlRemap] = useState<PdfUrlRemap | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [manifestRes, namesRes, titlesRes, remapRes] = await Promise.all([
          fetch("/ncert/manifest.json"),
          fetch("/ncert/chapter_names.json"),
          fetch("/ncert/pdf_titles.json"),
          fetch("/ncert/pdf_url_remap.json"),
        ]);

        if (cancelled) return;

        if (manifestRes.ok) {
          setManifest((await manifestRes.json()) as ManifestFiles);
        }
        if (namesRes.ok) {
          setChapterNames((await namesRes.json()) as ChapterNamesMap);
        }
        if (titlesRes.ok) {
          setPdfTitles((await titlesRes.json()) as PdfTitlesMap);
        }
        if (remapRes.ok) {
          const data = (await remapRes.json()) as { remap?: PdfUrlRemap };
          setPdfUrlRemap(data.remap ?? null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const getDisplayLabel = useCallback(
    (
      classKey: string,
      subjectKey: string,
      entry: Pick<ManifestEntry, "label" | "raw_code">,
    ) =>
      getNcertChapterDisplayLabel(
        chapterNames,
        classKey,
        subjectKey,
        entry,
        pdfTitles,
      ),
    [chapterNames, pdfTitles],
  );

  const getPdfUrl = useCallback(
    (
      classKey: string,
      subjectKey: string,
      entry: Pick<ManifestEntry, "raw_code" | "url">,
    ) =>
      resolveChapterPdfUrl(
        pdfUrlRemap,
        classKey,
        subjectKey,
        entry.raw_code,
        entry.url,
      ),
    [pdfUrlRemap],
  );

  return {
    manifest,
    chapterNames,
    pdfTitles,
    pdfUrlRemap,
    loading,
    getDisplayLabel,
    getPdfUrl,
  };
}

export type NcertMediumFilter = JourneyMedium | "all";
