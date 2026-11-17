"use client";

import Link from "next/link";
import { CalendarDays, FileText, Pencil, Plus, RotateCcw, Send, Trash2, X } from "lucide-react";
import { buildPaperBuilderHref } from "@/lib/examCalendarPaperLink";
import {
  formatExamDate,
  slotNumericDisplay,
  slotRowMetaLine,
  slotRowStyles,
  toIsoDate,
  type SlotNumericDraft,
} from "@/lib/examCalendarListUi";
import {
  SLOT_STATUS_LABEL,
  type ExamSlotWorkflowStatus,
} from "@/lib/examCalendarSlotStatus";
import type { ExamCalendarSlot } from "@/services/lmsApi";

function preventNumberWheelScroll(e: React.WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur();
}

type Props = {
  slot: ExamCalendarSlot;
  status: ExamSlotWorkflowStatus;
  calendarId: string;
  subject: string;
  ncertClassKey: string;
  numericDrafts: Record<string, SlotNumericDraft>;
  onTitleChange: (id: string, title: string) => void;
  onDateChange: (id: string, examDate: string | null) => void;
  onNumericDraft: (id: string, field: "marks" | "duration", value: string) => void;
  onNumericCommit: (id: string, field: "marks" | "duration") => void;
  onClear: (id: string, title: string) => void;
  onRemove: (id: string, title: string) => void;
  onChapterPicker: (id: string) => void;
  onRemoveChapter: (slotId: string, chapterKey: string) => void;
  onDistribute: (slot: ExamCalendarSlot) => void;
};

export default function ExamCalendarSlotRow({
  slot,
  status,
  calendarId,
  subject,
  ncertClassKey,
  numericDrafts,
  onTitleChange,
  onDateChange,
  onNumericDraft,
  onNumericCommit,
  onClear,
  onRemove,
  onChapterPicker,
  onRemoveChapter,
  onDistribute,
}: Props) {
  const styles = slotRowStyles(status);
  const ncertClassDigits = ncertClassKey.replace(/^class-/, "");

  return (
    <li
      id={`exam-slot-row-${slot.id}`}
      className={`group transition-all duration-500 ${styles.rowAccent} ${styles.rowHover}`}
    >
      <div className="flex flex-col gap-4 px-4 py-5 sm:px-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          <div className="flex min-w-0 flex-1 gap-4">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${styles.iconWrap}`}
            >
              <CalendarDays className="h-5 w-5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="group/title relative min-w-[10rem] max-w-md flex-1">
                  <input
                    value={slot.title}
                    onChange={(e) => onTitleChange(slot.id, e.target.value)}
                    aria-label="Exam name"
                    title="Rename this exam — e.g. FA1, PT-1, Half Yearly"
                    className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-3 pr-9 text-base font-semibold text-slate-900 shadow-sm transition-colors hover:border-slate-300 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <Pencil
                    className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-colors group-hover/title:text-slate-500 group-focus-within/title:text-indigo-500"
                    aria-hidden
                  />
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ${styles.pill}`}
                >
                  {SLOT_STATUS_LABEL[status]}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {slotRowMetaLine(slot)}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onClear(slot.id, slot.title)}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition-all hover:bg-slate-50 lg:opacity-90 lg:group-hover:opacity-100"
              title="Clear this exam's details"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear
            </button>
            <button
              type="button"
              onClick={() => onRemove(slot.id, slot.title)}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 shadow-sm transition-all hover:bg-rose-50 lg:opacity-90 lg:group-hover:opacity-100"
              title="Remove this exam from the calendar"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 lg:pl-[3.75rem]">
          <div className="group/date relative">
            {!formatExamDate(slot.exam_date) && (
              <span
                className="pointer-events-none absolute inset-y-0 left-3 z-[1] flex items-center text-sm text-slate-500 group-focus-within/date:hidden"
                aria-hidden
              >
                dd/mm/yy
              </span>
            )}
            <input
              type="date"
              aria-label="Exam date (dd/mm/yy)"
              value={formatExamDate(slot.exam_date)}
              onChange={(e) => onDateChange(slot.id, toIsoDate(e.target.value))}
              className={`w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
                !formatExamDate(slot.exam_date)
                  ? "[&::-webkit-datetime-edit]:opacity-0 [&::-webkit-datetime-edit-fields-wrapper]:opacity-0 group-focus-within/date:[&::-webkit-datetime-edit]:opacity-100 group-focus-within/date:[&::-webkit-datetime-edit-fields-wrapper]:opacity-100"
                  : ""
              }`}
            />
          </div>
          <input
            type="text"
            inputMode="numeric"
            aria-label="Marks"
            placeholder="Marks"
            value={slotNumericDisplay(slot, "marks", numericDrafts)}
            onWheel={preventNumberWheelScroll}
            onChange={(e) => onNumericDraft(slot.id, "marks", e.target.value)}
            onBlur={() => onNumericCommit(slot.id, "marks")}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
          <input
            type="text"
            inputMode="numeric"
            aria-label="Duration"
            placeholder="Duration (min)"
            value={slotNumericDisplay(slot, "duration", numericDrafts)}
            onWheel={preventNumberWheelScroll}
            onChange={(e) => onNumericDraft(slot.id, "duration", e.target.value)}
            onBlur={() => onNumericCommit(slot.id, "duration")}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        <div className="flex flex-wrap gap-2 lg:pl-[3.75rem]">
          {slot.chapters.length === 0 ? (
            <span className="text-xs text-slate-500">No chapters yet</span>
          ) : null}
          {slot.chapters.map((ch) => (
            <span
              key={ch.chapter_key}
              className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-3 py-1 text-xs font-medium text-sky-800 ring-1 ring-sky-100"
            >
              {ch.chapter_label}
              <button
                type="button"
                aria-label={`Remove ${ch.chapter_label}`}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveChapter(slot.id, ch.chapter_key);
                }}
                className="-mr-0.5 rounded p-0.5 text-sky-600 hover:bg-sky-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:pl-[3.75rem]">
          <button
            type="button"
            onClick={() => onChapterPicker(slot.id)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-100 active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Add chapter
          </button>
          {slot.chapters.length > 0 ? (
            <>
              <Link
                href={buildPaperBuilderHref({
                  slot,
                  calendarId,
                  subject,
                  ncertClassDigits,
                  linkedPaperId: null,
                })}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 shadow-sm transition-all hover:bg-emerald-100 active:scale-[0.98]"
              >
                <FileText className="h-4 w-4" />
                {slot.linked_paper_id ? "Regenerate paper" : "Generate paper"}
              </Link>
              {slot.linked_paper_id ? (
                <Link
                  href={buildPaperBuilderHref({
                    slot,
                    calendarId,
                    subject,
                    ncertClassDigits,
                    linkedPaperId: slot.linked_paper_id,
                  })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-[0.98]"
                >
                  <FileText className="h-4 w-4" />
                  Edit linked paper
                </Link>
              ) : null}
              {slot.linked_paper_id ? (
                <button
                  type="button"
                  onClick={() => onDistribute(slot)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:border-indigo-300 hover:bg-indigo-100 active:scale-[0.98]"
                >
                  <Send className="h-4 w-4" />
                  Distribute paper
                </button>
              ) : (
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500"
                  title="Generate and save a paper first"
                >
                  <Send className="h-4 w-4 opacity-50" />
                  Distribute paper
                </span>
              )}
            </>
          ) : null}
        </div>
      </div>
    </li>
  );
}
