"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import ModalCloseButton from "@/components/lms/portal/ModalCloseButton";
import NCERTRagDropdown from "@/components/NCERTRagDropdown";
import {
  chaptersInRange,
  termOnePreset,
  type ManifestChapter,
} from "@/lib/examCalendarBulkChapters";

type Props = {
  open: boolean;
  slotTitle: string;
  manifestChapters: ManifestChapter[];
  existingKeys: Set<string>;
  ncertClassKey: string;
  manifestSubject: string;
  onClose: () => void;
  onApply: (chapters: ManifestChapter[]) => void;
  onAddSingle: (label: string, pdfUrl: string) => void;
};

export default function ExamCalendarChapterPickerModal({
  open,
  slotTitle,
  manifestChapters,
  existingKeys,
  ncertClassKey,
  manifestSubject,
  onClose,
  onApply,
  onAddSingle,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [bulkFrom, setBulkFrom] = useState(1);
  const [bulkTo, setBulkTo] = useState(3);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setFilter("");
    setBulkFrom(1);
    setBulkTo(3);
  }, [open]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return manifestChapters;
    return manifestChapters.filter((ch) =>
      ch.chapter_label.toLowerCase().includes(q),
    );
  }, [manifestChapters, filter]);

  if (!open) return null;

  function toggle(key: string) {
    if (existingKeys.has(key)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function applySelected() {
    const picked = manifestChapters.filter((ch) => selected.has(ch.chapter_key));
    if (picked.length) onApply(picked);
    onClose();
  }

  function applyRange() {
    const picked = chaptersInRange(manifestChapters, bulkFrom, bulkTo).filter(
      (ch) => !existingKeys.has(ch.chapter_key),
    );
    if (picked.length) onApply(picked);
    onClose();
  }

  function applyTermOne() {
    const picked = termOnePreset(manifestChapters).filter(
      (ch) => !existingKeys.has(ch.chapter_key),
    );
    if (picked.length) onApply(picked);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] portal-modal-overlay-enter p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[min(85vh,640px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Add chapters</h2>
            <p className="mt-0.5 text-sm text-slate-600">{slotTitle}</p>
          </div>
          <ModalCloseButton onClick={onClose} absolute={false} />
        </header>

        <div className="space-y-3 border-b border-slate-800 px-5 py-3">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search chapters…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
          />
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Quick add:</span>
            <input
              type="number"
              min={1}
              value={bulkFrom}
              onChange={(e) => setBulkFrom(Number(e.target.value))}
              className="w-12 rounded border border-slate-200 bg-white px-2 py-1 text-white"
              aria-label="From chapter"
            />
            <span className="text-slate-500">–</span>
            <input
              type="number"
              min={1}
              value={bulkTo}
              onChange={(e) => setBulkTo(Number(e.target.value))}
              className="w-12 rounded border border-slate-200 bg-white px-2 py-1 text-white"
              aria-label="To chapter"
            />
            <button
              type="button"
              onClick={applyRange}
              className="rounded-md bg-slate-700 px-2 py-1 text-slate-700 hover:bg-slate-600"
            >
              Range
            </button>
            <button
              type="button"
              onClick={applyTermOne}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-slate-500 hover:text-slate-800"
            >
              Term 1
            </button>
          </div>
        </div>

        <ul className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          {manifestChapters.length === 0 ? (
            <li className="py-8 text-center text-sm text-slate-500">
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
              Loading chapter list…
            </li>
          ) : filtered.length === 0 ? (
            <li className="py-6 text-center text-sm text-slate-500">
              No chapters match your search.
            </li>
          ) : (
            filtered.map((ch) => {
              const already = existingKeys.has(ch.chapter_key);
              const checked = already || selected.has(ch.chapter_key);
              return (
                <li key={ch.chapter_key}>
                  <label
                    className={`flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50 ${
                      already ? "cursor-not-allowed opacity-50" : ""
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={already}
                      onChange={() => toggle(ch.chapter_key)}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20"
                    />
                    <span className="text-sm text-slate-700">{ch.chapter_label}</span>
                    {already && (
                      <span className="ml-auto text-xs text-slate-500">Added</span>
                    )}
                  </label>
                </li>
              );
            })
          )}
        </ul>

        <div className="border-t border-slate-800 px-5 py-3">
          <p className="mb-2 text-xs text-slate-500">Or search NCERT</p>
          <NCERTRagDropdown
            kbs={[]}
            fullWidth
            restrictClassKey={ncertClassKey}
            restrictSubjectKey={manifestSubject}
            onSelectPdf={(url, label) => {
              onAddSingle(label, url);
              onClose();
            }}
          />
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-800 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={applySelected}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            Add {selected.size > 0 ? `${selected.size} ` : ""}selected
          </button>
        </footer>
      </div>
    </div>
  );
}
