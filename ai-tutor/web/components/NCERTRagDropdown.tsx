"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { useGlobal } from "@/context/GlobalContext";
import {
  filterNcertManifestFiles,
  isKbEquivalent,
  type ManifestEntry,
} from "@/lib/ncertJourney";
import {
  useNcertCatalog,
  type NcertMediumFilter,
} from "@/hooks/useNcertCatalog";

interface NCERTRagDropdownProps {
  kbs: { name: string }[];
  compact?: boolean;
  fullWidth?: boolean;
  selectedKb?: string;
  selectedPdfUrl?: string;
  onSelectKb?: (kbName: string) => void;
  onSelectPdf?: (url: string, label: string, cls?: string, subj?: string, rawCode?: string) => void;
  /** Mimic mode: emphasize NCERT chapter as question content source. */
  variant?: "default" | "mimic";
  /** When set, only this NCERT class appears in the tree (student journey). */
  restrictClassKey?: string | null;
  /** When set with class, only this subject is listed. */
  restrictSubjectKey?: string | null;
}

export default function NCERTRagDropdown({ 
  kbs, 
  compact, 
  fullWidth = false,
  selectedKb: propSelectedKb,
  selectedPdfUrl: propSelectedPdfUrl,
  onSelectKb,
  onSelectPdf,
  restrictClassKey,
  restrictSubjectKey,
  variant = "default",
}: NCERTRagDropdownProps) {
  const {
    manifest,
    getDisplayLabel,
    getPdfUrl,
  } = useNcertCatalog();
  const [isOpen, setIsOpen] = useState(false);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});
  const [mediumFilter, setMediumFilter] = useState<NcertMediumFilter>("English");
  const { setChatState, chatState, setToast } = useGlobal();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuLayout, setMenuLayout] = useState<{
    top: number;
    left: number;
    maxHeight: number;
  } | null>(null);

  // Fallback to chatState if props not provided
  const selectedKb = propSelectedKb !== undefined ? propSelectedKb : chatState.selectedKb;
  const selectedPdfUrl = propSelectedPdfUrl !== undefined ? propSelectedPdfUrl : chatState.selectedPdfUrl;

  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) {
      setMenuLayout(null);
      return;
    }
    const updateLayout = () => {
      const el = buttonRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 10;
      const vw = typeof window !== "undefined" ? window.innerWidth : 1024;
      const vh = typeof window !== "undefined" ? window.innerHeight : 768;
      const width = 320;
      let left = rect.left;
      if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
      const belowTop = rect.bottom + margin;
      const availableBelow = vh - belowTop - 12;
      const maxHeight = Math.min(520, Math.max(220, availableBelow));
      setMenuLayout({
        top: belowTop,
        left,
        maxHeight,
      });
    };
    updateLayout();
    window.addEventListener("resize", updateLayout);
    window.addEventListener("scroll", updateLayout, true);
    return () => {
      window.removeEventListener("resize", updateLayout);
      window.removeEventListener("scroll", updateLayout, true);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const toggleNode = (node: string) => {
    setExpandedNodes(prev => ({ ...prev, [node]: !prev[node] }));
  };

  const handleSelectKb = (kbName: string) => {
    if (onSelectKb) {
      onSelectKb(kbName);
    } else {
      setChatState((prev: any) => ({
        ...prev,
        selectedKb: kbName,
        selectedPdfUrl: "",
        selectedPdfTopicLabel: "",
        enableRag: true,
        enableWebSearch: false,
      }));
    }
    setIsOpen(false);
  };

  const handleSelectPdf = (url: string, label: string, cls?: string, subj?: string, rawCode?: string) => {
    if (onSelectPdf) {
      onSelectPdf(url, label, cls, subj, rawCode);
    } else {
      // Derive the per-class-subject KB name so RAG searches the right index.
      // Falls back to per-class, then to whatever was already selected.
      const n = cls ? cls.replace("class-", "") : null;
      const subjSlug = subj ? subj.toLowerCase().replace(/\s+/g, "-") : null;
      const derivedKb =
        n && subjSlug
          ? `ncert-class-${n}-${subjSlug}`
          : n
          ? `ncert-class-${n}`
          : undefined;
      setChatState((prev: any) => ({
        ...prev,
        selectedKb: derivedKb || prev.selectedKb,
        selectedPdfUrl: url,
        selectedPdfTopicLabel: (label || "").trim(),
        enableRag: true,
        enableWebSearch: false,
      }));
    }
    if (setToast) {
      setToast({ message: `📄 Selected: ${label}`, type: "success" });
      setTimeout(() => setToast(null), 3000);
    }
    setIsOpen(false);
  };

  const getDisplayText = () => {
    if (selectedPdfUrl && manifest) {
      for (const cls of Object.keys(manifest)) {
        for (const subj of Object.keys(manifest[cls])) {
          const files = manifest[cls][subj];
          const match = files.find(
            (f) => getPdfUrl(cls, subj, f) === selectedPdfUrl || f.url === selectedPdfUrl,
          );
          if (match) {
            return getDisplayLabel(cls, subj, match);
          }
        }
      }
      return selectedPdfUrl.split("/").pop() || "Selected PDF";
    }
    if (selectedKb) return selectedKb;
    return variant === "mimic" ? "Select NCERT chapter" : "Select Source";
  };

  const classes = useMemo(() => {
    if (!manifest) return [];
    const all = Object.keys(manifest).sort((a, b) => {
      const numA = parseInt(a.replace("class-", "")) || 0;
      const numB = parseInt(b.replace("class-", "")) || 0;
      return numA - numB;
    });
    if (restrictClassKey && manifest[restrictClassKey]) {
      return [restrictClassKey];
    }
    return all;
  }, [manifest, restrictClassKey]);

  const filterFiles = (files: ManifestEntry[]) =>
    filterNcertManifestFiles(files, mediumFilter);

  const getSubjectCount = (cls: string, subj: string) => {
    if (!manifest) return 0;
    return filterFiles(manifest[cls][subj]).length;
  };

  // Backfill topic label when a PDF URL is already selected but the human chapter title
  // was never stored (older sessions).
  useEffect(() => {
    if (!manifest || !selectedPdfUrl?.trim()) return;
    const existing = (
      typeof chatState.selectedPdfTopicLabel === "string"
        ? chatState.selectedPdfTopicLabel
        : ""
    ).trim();
    if (existing.length >= 4) return;

    for (const cls of Object.keys(manifest)) {
      for (const subj of Object.keys(manifest[cls])) {
        const files = manifest[cls][subj];
        const match = files.find(
          (f) => getPdfUrl(cls, subj, f) === selectedPdfUrl || f.url === selectedPdfUrl,
        );
        if (!match) continue;
        const resolved = getDisplayLabel(cls, subj, match).trim();
        if (resolved.length >= 4) {
          setChatState((prev: any) => {
            if ((prev.selectedPdfUrl || "").trim() !== selectedPdfUrl.trim())
              return prev;
            const have = (
              typeof prev.selectedPdfTopicLabel === "string"
                ? prev.selectedPdfTopicLabel
                : ""
            ).trim();
            if (have.length >= 4) return prev;
            return { ...prev, selectedPdfTopicLabel: resolved };
          });
        }
        return;
      }
    }
  }, [
    manifest,
    selectedPdfUrl,
    chatState.selectedPdfTopicLabel,
    setChatState,
    getDisplayLabel,
    getPdfUrl,
  ]);

  useEffect(() => {
    if (!restrictClassKey) return;
    setExpandedNodes((prev) => {
      const next = { ...prev, [restrictClassKey]: true };
      if (restrictSubjectKey) {
        next[`${restrictClassKey}-${restrictSubjectKey}`] = true;
      }
      return next;
    });
  }, [restrictClassKey, restrictSubjectKey]);

  const visibleKbs = useMemo(() => {
    if (!restrictClassKey) return kbs;
    const n = restrictClassKey.replace("class-", "");
    // Match per-subject KBs (ncert-class-8-science / class_8_science) and per-class KBs (ncert-class-8 / class_8)
    const matched = kbs.filter((k) => {
      const name = k.name.toLowerCase().replace(/^ncert-/, "").replace(/_/g, "-");
      return name.includes(`class-${n}`);
    });
    if (matched.length > 0) return matched;
    // Fallback: any NCERT KB
    return kbs.filter((k) => k.name.startsWith("ncert-") || k.name.startsWith("class_"));
  }, [kbs, restrictClassKey]);

  return (
    <div className={`relative text-left ${fullWidth ? "block w-full min-w-0" : "inline-block"}`} ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${compact ? 'text-[11px] px-2.5 py-1.5' : 'text-sm px-4 py-2'} bg-white/80 dark:bg-slate-800/80 backdrop-blur-md border border-slate-200/60 dark:border-slate-700/60 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500/20 dark:text-slate-100 flex items-center justify-between gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-700/80 transition-all shadow-sm hover:shadow-md active:scale-95 group relative z-10 ${fullWidth ? "w-full min-w-0 max-w-none" : "min-w-[160px] max-w-[260px]"}`}
      >
        <div className="flex items-center gap-2 truncate">
          <svg className="w-4 h-4 text-indigo-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
          <span className="text-slate-400 font-medium">
            {variant === "mimic" ? "Content:" : "Source:"}
          </span>
          <span className="truncate font-semibold tracking-tight">{getDisplayText()}</span>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-indigo-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
      </button>

      {typeof document !== "undefined" &&
        isOpen &&
        menuLayout &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: "fixed",
              top: menuLayout.top,
              left: menuLayout.left,
              width: 320,
              maxHeight: menuLayout.maxHeight,
              zIndex: 10000,
            }}
            className="overflow-y-auto overflow-x-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-[0_20px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_20px_50px_rgba(0,0,0,0.4)] ring-1 ring-slate-200 dark:ring-slate-800 border border-slate-200/50 dark:border-slate-700/50 custom-scrollbar animate-in fade-in zoom-in-95 duration-200"
          >
            <div className="p-4 space-y-4">
              {/* Medium Filter Toggle */}
              {manifest && (
                <div className="px-3 pb-2 flex items-center gap-1.5">
                  {(["English", "Hindi", "all"] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => setMediumFilter(opt)}
                      className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors ${
                        mediumFilter === opt
                          ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                          : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600"
                      }`}
                    >
                      {opt === "English"
                        ? "🇬🇧 Eng"
                        : opt === "Hindi"
                          ? "🇮🇳 Hindi"
                          : "All"}
                    </button>
                  ))}
                </div>
              )}

              {/* Standard KBs */}
              {visibleKbs.length > 0 && (
                <div className="px-3 pb-2">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
                    {restrictClassKey ? "Your class knowledge base" : "Knowledge Bases"}
                  </div>
                  {visibleKbs.map((kb) => (
                    <button
                      key={kb.name}
                      type="button"
                      onClick={() => handleSelectKb(kb.name)}
                      className={`w-full text-left cursor-pointer text-sm px-2 py-1.5 rounded-lg transition-colors ${(selectedKb === kb.name || isKbEquivalent(selectedKb, kb.name)) && !selectedPdfUrl ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium" : "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200"}`}
                    >
                      {kb.name}
                    </button>
                  ))}
                </div>
              )}

              {/* Divider */}
              {visibleKbs.length > 0 && manifest && (
                <div className="border-t border-slate-100 dark:border-slate-700 my-1 mx-3" />
              )}

              {/* NCERT Books */}
              {manifest && (
                <div className="px-3 pt-1 pb-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 px-1">
                    {restrictClassKey ? "Your NCERT textbooks" : "NCERT Documents"}
                  </div>

                  {classes.map((cls) => {
                    const classNum = cls.replace("class-", "");
                    const allSubjects = Object.keys(manifest[cls]).sort();
                    const subjects =
                      restrictSubjectKey && manifest[cls][restrictSubjectKey]
                        ? [restrictSubjectKey]
                        : allSubjects;

                    return (
                      <div key={cls}>
                        <button
                          type="button"
                          onClick={() => toggleNode(cls)}
                          className="w-full text-left cursor-pointer text-sm font-medium px-2 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 flex justify-between items-center transition-colors"
                        >
                          <span>📚 Class {classNum}</span>
                          <span className="text-[10px] text-slate-400 flex items-center gap-1.5">
                            <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-md">
                              {subjects.length} subj
                            </span>
                            {expandedNodes[cls] ? "▼" : "▶"}
                          </span>
                        </button>

                        {expandedNodes[cls] && (
                          <div className="pl-3 mt-0.5 border-l-2 border-blue-100 dark:border-blue-900/50 ml-3 space-y-0.5">
                            {subjects.map((subj) => {
                              const count = getSubjectCount(cls, subj);
                              const filtered = filterFiles(manifest[cls][subj]);
                              const nodeKey = `${cls}-${subj}`;

                              if (count === 0) return null;

                              return (
                                <div key={subj}>
                                  <button
                                    type="button"
                                    onClick={() => toggleNode(nodeKey)}
                                    className="w-full text-left cursor-pointer text-sm px-2 py-1.5 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 flex justify-between items-center capitalize transition-colors"
                                  >
                                    <span className="truncate pr-2">
                                      {subj.replace(/-/g, " ")}
                                    </span>
                                    <span className="text-[10px] text-slate-400 flex items-center gap-1.5 flex-shrink-0">
                                      <span className="bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-md">
                                        {count}
                                      </span>
                                      {expandedNodes[nodeKey] ? "▼" : "▶"}
                                    </span>
                                  </button>

                                  {expandedNodes[nodeKey] && (
                                    <div className="pl-3 py-1 mt-0.5 border-l-2 border-slate-100 dark:border-slate-700/50 ml-2 space-y-0.5">
                                      {filtered.map((f) => {
                                        const displayText = getDisplayLabel(
                                          cls,
                                          subj,
                                          f,
                                        );
                                        const pdfUrl = getPdfUrl(cls, subj, f);
                                        return (
                                          <button
                                            key={pdfUrl}
                                            type="button"
                                            onClick={() =>
                                              handleSelectPdf(
                                                pdfUrl,
                                                displayText,
                                                cls,
                                                subj,
                                                f.raw_code,
                                              )
                                            }
                                            className={`w-full text-left cursor-pointer text-xs px-2 py-1.5 rounded-md transition-colors truncate ${selectedPdfUrl === pdfUrl ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 font-medium" : "hover:bg-blue-50 dark:hover:bg-blue-900/10 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"}`}
                                            title={`${displayText} (${f.filename})`}
                                          >
                                            📄 {displayText}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
