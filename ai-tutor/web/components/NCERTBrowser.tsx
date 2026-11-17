"use client";

import React, { useEffect, useState } from "react";
import { useGlobal } from "@/context/GlobalContext";

interface ManifestFiles {
  [className: string]: {
    [subject: string]: Array<{ filename: string; url: string; book_or_chapter: string }>;
  };
}

export default function NCERTBrowser({ compact }: { compact?: boolean }) {
  const [manifest, setManifest] = useState<ManifestFiles | null>(null);
  const [expandedClass, setExpandedClass] = useState<string | null>(null);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const { setChatState, chatState, setToast } = useGlobal();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/ncert/manifest.json");
        if (!res.ok) return;
        const data = await res.json();
        setManifest(data);
      } catch (e) {
        console.warn("NCERT manifest not found", e);
      }
    };
    load();
  }, []);

  if (!manifest) return null;

  const handleSelectPdf = (url: string) => {
    // Set selected PDF in chat state and enable RAG
    setChatState((prev: any) => ({ ...prev, selectedPdfUrl: url, enableRag: true }));
    // Optionally focus chat input or notify user
    if (setToast) {
      setToast({ message: `Selected PDF for RAG: ${url}`, type: "success" });
      setTimeout(() => setToast!(null), 3000);
    }
  };

  return (
    <div className={compact ? "p-2" : "p-4 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700"}>
      {!compact && <h3 className="font-bold text-lg mb-2">NCERT PDFs</h3>}
      <div className="max-h-64 overflow-y-auto">
        {Object.keys(manifest)
          .sort()
          .map((cls) => (
            <div key={cls} className="mb-3">
              <button
                onClick={() => setExpandedClass(expandedClass === cls ? null : cls)}
                className="font-semibold text-sm"
              >
                {cls}
              </button>
              {expandedClass === cls && (
                <div className="mt-2 pl-3">
                  {Object.keys(manifest[cls]).map((subj) => (
                    <div key={subj} className="mb-2">
                      <button
                        onClick={() => setExpandedSubject(expandedSubject === `${cls}/${subj}` ? null : `${cls}/${subj}`)}
                        className="text-sm font-medium"
                      >
                        {subj}
                      </button>
                      {expandedSubject === `${cls}/${subj}` && (
                        <ul className="list-disc ml-5 mt-1 text-sm">
                          {manifest[cls][subj].map((f) => (
                            <li key={f.url}>
                              <a className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer" onClick={() => handleSelectPdf(f.url)}>
                                {f.filename}
                              </a>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
