"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ExamCalendarSlot } from "@/services/lmsApi";

type SlotRow = Pick<
  ExamCalendarSlot,
  "id" | "title" | "exam_date" | "slot_type"
>;

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

/** Monday-based offset: 0 = Monday … 6 = Sunday */
function mondayOffset(year: number, month: number) {
  const dow = new Date(year, month, 1).getDay();
  return dow === 0 ? 6 : dow - 1;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export default function ExamCalendarMonthView({
  slots,
  onSelectSlot,
  theme = "dark",
}: {
  slots: SlotRow[];
  onSelectSlot?: (slotId: string) => void;
  theme?: "dark" | "light";
}) {
  const light = theme === "light";
  const dated = useMemo(
    () =>
      slots.filter((s): s is SlotRow & { exam_date: string } =>
        Boolean(s.exam_date),
      ),
    [slots],
  );
  const initial = useMemo(() => {
    if (dated.length) return new Date(dated[0].exam_date);
    return new Date();
  }, [dated]);

  const [cursor, setCursor] = useState(() => startOfMonth(initial));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const label = cursor.toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const byDay = useMemo(() => {
    const map = new Map<string, SlotRow[]>();
    for (const s of dated) {
      const d = new Date(s.exam_date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [dated]);

  const offset = mondayOffset(year, month);
  const totalDays = daysInMonth(year, month);
  const cells: Array<{ day: number | null; date?: Date }> = [];
  for (let i = 0; i < offset; i++) cells.push({ day: null });
  for (let d = 1; d <= totalDays; d++) {
    cells.push({ day: d, date: new Date(year, month, d) });
  }
  while (cells.length % 7 !== 0) cells.push({ day: null });

  const today = new Date();

  return (
    <div
      className={
        light
          ? "rounded-2xl border border-slate-200 bg-white p-4"
          : "rounded-2xl border border-slate-700/80 bg-slate-900/60 p-4"
      }
    >
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() =>
            setCursor(new Date(year, month - 1, 1))
          }
          className={
            light
              ? "rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100"
              : "rounded-lg border border-slate-600 p-2 text-slate-300 hover:bg-slate-800"
          }
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p
          className={`text-sm font-semibold ${light ? "text-slate-900" : "text-white"}`}
        >
          {label}
        </p>
        <button
          type="button"
          onClick={() =>
            setCursor(new Date(year, month + 1, 1))
          }
          className={
            light
              ? "rounded-lg border border-slate-300 p-2 text-slate-600 hover:bg-slate-100"
              : "rounded-lg border border-slate-600 p-2 text-slate-300 hover:bg-slate-800"
          }
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1 font-medium">
            {w}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (cell.day == null || !cell.date) {
            return <div key={`empty-${idx}`} className="min-h-[4.5rem]" />;
          }
          const key = `${cell.date.getFullYear()}-${cell.date.getMonth()}-${cell.date.getDate()}`;
          const daySlots = byDay.get(key) ?? [];
          const isToday = sameDay(cell.date, today);
          return (
            <div
              key={key}
              className={`min-h-[4.5rem] rounded-lg border p-1 text-left ${
                isToday
                  ? light
                    ? "border-indigo-400 bg-indigo-50"
                    : "border-violet-500/60 bg-violet-500/10"
                  : light
                    ? "border-slate-200 bg-slate-50"
                    : "border-slate-700/60 bg-slate-800/40"
              }`}
            >
              <span
                className={`text-xs font-medium ${
                  isToday
                    ? light
                      ? "text-indigo-700"
                      : "text-violet-300"
                    : "text-slate-400"
                }`}
              >
                {cell.day}
              </span>
              <ul className="mt-0.5 space-y-0.5">
                {daySlots.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => onSelectSlot?.(s.id)}
                      className={
                        light
                          ? "w-full truncate rounded bg-indigo-100 px-1 py-0.5 text-left text-[10px] font-medium text-indigo-800 hover:bg-indigo-200"
                          : "w-full truncate rounded bg-violet-600/30 px-1 py-0.5 text-left text-[10px] font-medium text-violet-100 hover:bg-violet-600/50"
                      }
                      title={s.title}
                    >
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {!dated.length && (
        <p className="mt-3 text-center text-xs text-slate-500">
          Add exam dates to see them on the month grid.
        </p>
      )}
    </div>
  );
}
