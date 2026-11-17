"use client";

import { useEffect, useMemo, useState } from "react";
import { BookMarked, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import NCERTRagDropdown from "@/components/NCERTRagDropdown";
import { apiUrl } from "@/lib/api";

interface KnowledgeBase {
  name: string;
  is_default?: boolean;
  statistics?: {
    status?: string;
    rag_initialized?: boolean;
    [key: string]: unknown;
  };
}

function kbReadyForSource(kb: KnowledgeBase): boolean {
  const st = kb.statistics?.status;
  if (st === "initializing" || st === "processing" || st === "error")
    return false;
  return true;
}

export interface GuideNcertPanelProps {
  selectedKb: string;
  selectedPdfUrl: string;
  onSelectKb: (name: string) => void;
  onSelectPdf: (url: string, label: string) => void;
}

export default function GuideNcertPanel({
  selectedKb,
  selectedPdfUrl,
  onSelectKb,
  onSelectPdf,
}: GuideNcertPanelProps) {
  const { t } = useTranslation();
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const [kbsLoading, setKbsLoading] = useState(true);

  const knowledgeBasesForPicker = useMemo(() => {
    const ready = kbs.filter(kbReadyForSource);
    // Prefer NCERT per-class/per-subject KBs; show all ready KBs as fallback
    const ncert = ready.filter((k) => k.name.startsWith("ncert-"));
    return ncert.length > 0 ? ncert : ready;
  }, [kbs]);

  useEffect(() => {
    const controller = new AbortController();
    setKbsLoading(true);
    fetch(apiUrl("/api/v1/knowledge/list"), { signal: controller.signal })
      .then((res) => res.json())
      .then((data: KnowledgeBase[]) => {
        const kbList = Array.isArray(data) ? data : [];
        setKbs(kbList);
      })
      .catch(() => setKbs([]))
      .finally(() => setKbsLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (kbsLoading || knowledgeBasesForPicker.length === 0 || selectedKb) return;
    const pick =
      knowledgeBasesForPicker.find((k) => k.name.startsWith("ncert-")) ||
      knowledgeBasesForPicker[0];
    if (pick) onSelectKb(pick.name);
  }, [kbsLoading, knowledgeBasesForPicker, selectedKb, onSelectKb]);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col overflow-visible">
      <div className="p-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 flex justify-between items-center">
        <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <BookMarked className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          {t("NCERT Knowledge")}
        </h2>
      </div>

      <div className="p-3">
        {kbsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-indigo-600 dark:text-indigo-400" />
          </div>
        ) : knowledgeBasesForPicker.length === 0 ? (
          <p className="text-sm text-center text-slate-400 dark:text-slate-500 py-4">
            {t("guide.ncert_no_kb")}
          </p>
        ) : (
          <div className="w-full flex flex-wrap items-center gap-2">
            <NCERTRagDropdown
              kbs={knowledgeBasesForPicker.map((k) => ({ name: k.name }))}
              selectedKb={selectedKb}
              selectedPdfUrl={selectedPdfUrl}
              onSelectKb={onSelectKb}
              onSelectPdf={onSelectPdf}
            />
          </div>
        )}
      </div>
    </div>
  );
}
