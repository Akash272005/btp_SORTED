"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function toDateTimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function parseDateTimeLocalValue(s: string): Date | null {
  if (!s.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function defaultDueDraft(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  d.setHours(10, 0, 0, 0);
  return d;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  id?: string;
  min?: Date;
};

export default function DateTimePickerField({
  value,
  onChange,
  required,
  id,
  min,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number; width: number } | null>(
    null,
  );
  const applied = parseDateTimeLocalValue(value);
  const [draft, setDraft] = useState<Date>(() => applied ?? defaultDueDraft());
  const [viewMonth, setViewMonth] = useState(() => (applied ?? new Date()).getMonth());
  const [viewYear, setViewYear] = useState(() => (applied ?? new Date()).getFullYear());

  useEffect(() => {
    if (!open) return;
    const parsed = parseDateTimeLocalValue(value) ?? defaultDueDraft();
    setDraft(parsed);
    setViewMonth(parsed.getMonth());
    setViewYear(parsed.getFullYear());
  }, [open, value]);

  function updatePanelPosition() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(340, window.innerWidth - 16);
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = window.innerWidth - width - 8;
    }
    left = Math.max(8, left);
    setPanelStyle({ top: rect.bottom + 8, left, width });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePanelPosition();
    window.addEventListener("resize", updatePanelPosition);
    window.addEventListener("scroll", updatePanelPosition, true);
    return () => {
      window.removeEventListener("resize", updatePanelPosition);
      window.removeEventListener("scroll", updatePanelPosition, true);
    };
  }, [open, viewMonth, viewYear]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        rootRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const display = applied
    ? applied.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Select date and time";

  const calendarDays = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const startPad = first.getDay();
    const total = daysInMonth(viewYear, viewMonth);
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startPad; i += 1) cells.push(null);
    for (let day = 1; day <= total; day += 1) {
      cells.push(new Date(viewYear, viewMonth, day));
    }
    return cells;
  }, [viewMonth, viewYear]);

  const hours12 = draft.getHours() % 12 || 12;
  const ampm: "AM" | "PM" = draft.getHours() >= 12 ? "PM" : "AM";
  const minutes = draft.getMinutes();

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleString(undefined, {
    month: "long",
    year: "numeric",
  });

  function shiftMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewMonth(d.getMonth());
    setViewYear(d.getFullYear());
  }

  function setDraftDatePart(date: Date) {
    const next = new Date(draft);
    next.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
    setDraft(next);
  }

  function setDraftTime(h24: number, m: number) {
    const next = new Date(draft);
    next.setHours(h24, m, 0, 0);
    setDraft(next);
  }

  function setHours12(h12: number, nextAmpm: "AM" | "PM") {
    let h24 = h12 % 12;
    if (nextAmpm === "PM") h24 += 12;
    setDraftTime(h24, minutes);
  }

  function isDayDisabled(day: Date): boolean {
    if (!min) return false;
    return startOfDay(day) < startOfDay(min);
  }

  function handleOk() {
    onChange(toDateTimeLocalValue(draft));
    setOpen(false);
  }

  function handleToday() {
    const t = new Date();
    if (min && t < min) {
      setDraft(new Date(min));
    } else {
      setDraft(t);
    }
    setViewMonth(t.getMonth());
    setViewYear(t.getFullYear());
  }

  function handleClear() {
    onChange("");
    setOpen(false);
  }

  const hourOptions = Array.from({ length: 12 }, (_, i) => i + 1);
  const minuteOptions = Array.from({ length: 60 }, (_, i) => i);

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        onClick={() => {
          setOpen((o) => {
            const next = !o;
            if (next) {
              requestAnimationFrame(updatePanelPosition);
            }
            return next;
          });
        }}
        className={clsx(
          "mt-1 flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm shadow-sm transition-colors hover:border-slate-300 focus:border-indigo-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20",
          applied ? "text-slate-800" : "text-slate-400",
        )}
      >
        <span className="truncate">{display}</span>
        <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {required ? (
        <input
          type="text"
          value={value}
          required
          tabIndex={-1}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
          readOnly
          aria-hidden
        />
      ) : null}

      {open && panelStyle && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Choose date and time"
              style={{
                position: "fixed",
                top: panelStyle.top,
                left: panelStyle.left,
                width: panelStyle.width,
                zIndex: 80,
              }}
              className="rounded-xl border border-slate-200 bg-white p-3 text-slate-900 shadow-2xl"
            >
          <div className="flex gap-3">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center justify-between gap-1">
                <span className="text-sm font-semibold">{monthLabel}</span>
                <div className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    className="rounded p-1 hover:bg-slate-100"
                    aria-label="Previous month"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    className="rounded p-1 hover:bg-slate-100"
                    aria-label="Next month"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] font-medium text-slate-500">
                {WEEKDAYS.map((w) => (
                  <span key={w} className="py-1">
                    {w}
                  </span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5 text-center text-sm">
                {calendarDays.map((day, i) =>
                  day ? (
                    <button
                      key={`${day.toISOString()}-${i}`}
                      type="button"
                      disabled={isDayDisabled(day)}
                      onClick={() => setDraftDatePart(day)}
                      className={clsx(
                        "rounded-full py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                        sameDay(day, draft)
                          ? "bg-blue-600 font-semibold text-white"
                          : "hover:bg-slate-100",
                      )}
                    >
                      {day.getDate()}
                    </button>
                  ) : (
                    <span key={`empty-${i}`} />
                  ),
                )}
              </div>

              <div className="mt-2 flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={handleClear}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="font-medium text-blue-600 hover:underline"
                >
                  Today
                </button>
              </div>
            </div>

            <div className="flex w-[88px] shrink-0 flex-col gap-2 border-l border-slate-200 pl-3">
              <label className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                Time
              </label>
              <select
                value={hours12}
                onChange={(e) => setHours12(Number(e.target.value), ampm)}
                className="rounded border border-slate-200 px-1 py-1 text-sm"
                aria-label="Hour"
              >
                {hourOptions.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <select
                value={minutes}
                onChange={(e) => {
                  let h24 = hours12 % 12;
                  if (ampm === "PM") h24 += 12;
                  setDraftTime(h24, Number(e.target.value));
                }}
                className="rounded border border-slate-200 px-1 py-1 text-sm"
                aria-label="Minute"
              >
                {minuteOptions.map((m) => (
                  <option key={m} value={m}>
                    {String(m).padStart(2, "0")}
                  </option>
                ))}
              </select>
              <div className="flex flex-col gap-1">
                {(["AM", "PM"] as const).map((part) => (
                  <button
                    key={part}
                    type="button"
                    onClick={() => setHours12(hours12, part)}
                    className={clsx(
                      "rounded px-2 py-1 text-xs font-semibold",
                      ampm === part
                        ? "bg-blue-600 text-white"
                        : "border border-slate-200 text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    {part}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOk}
            className="mt-3 w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            OK
          </button>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
