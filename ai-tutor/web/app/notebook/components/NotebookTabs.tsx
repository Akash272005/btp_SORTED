"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import AiSavesPanel from "./AiSavesPanel";
import MyNotesPanel from "./MyNotesPanel";

export type NotebookTab = "notes" | "ai";

function NotebookTabsInner() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: NotebookTab = tabParam === "notes" ? "notes" : "ai";

  const setTab = (tab: NotebookTab) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "ai") {
      params.delete("tab");
      params.delete("view");
    } else {
      params.set("tab", "notes");
    }
    const qs = params.toString();
    router.replace(`/notebook${qs ? `?${qs}` : ""}`, { scroll: false });
  };

  return (
    <div className="h-screen flex flex-col p-4 gap-3 min-h-0">
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => setTab("notes")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "notes"
              ? "bg-emerald-600 text-white shadow-md shadow-emerald-500/20"
              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
          }`}
        >
          {t("notes.tab_my_notes")}
        </button>
        <button
          type="button"
          onClick={() => setTab("ai")}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === "ai"
              ? "bg-indigo-600 text-white shadow-md shadow-indigo-500/20"
              : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
          }`}
        >
          {t("notes.tab_ai_saves")}
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {activeTab === "notes" ? <MyNotesPanel /> : <AiSavesPanel />}
      </div>
    </div>
  );
}

export default function NotebookTabs() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center text-slate-400">
          Loading…
        </div>
      }
    >
      <NotebookTabsInner />
    </Suspense>
  );
}
