"use client";

import { useMemo, useState } from "react";
import { Minus, Plus } from "lucide-react";

type NumericStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
  decimalPlaces?: number;
  ariaLabel?: string;
  tone?: "default" | "violet";
  compact?: boolean;
  /** Shorter control for dense toolbars (e.g. paper section headers). */
  size?: "md" | "sm";
  /** Allow clearing the field while typing (commits on blur). */
  allowEmptyDraft?: boolean;
  /** Increment/decrement step (default 1). Blur snaps integers to this step when &gt; 1. */
  step?: number;
  /** When true with allowEmptyDraft, typing updates draft only; onChange runs on blur or +/-. */
  commitOnBlurOnly?: boolean;
};

/** Shared +/− stepper for quiz builder numeric fields. */
export default function NumericStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  allowDecimal = false,
  decimalPlaces = 1,
  ariaLabel = "Value",
  tone = "default",
  compact = false,
  size = "md",
  allowEmptyDraft = false,
  step = 1,
  commitOnBlurOnly = false,
}: NumericStepperProps) {
  const delta = Math.max(1, Math.floor(step));

  function clamp(n: number) {
    return Math.min(max, Math.max(min, n));
  }

  function snapToStep(n: number) {
    const clamped = clamp(n);
    if (delta <= 1) return clamped;
    const snapped = Math.round(clamped / delta) * delta;
    return clamp(snapped);
  }
  const [draftValue, setDraftValue] = useState<string | null>(null);
  const useDraft = allowDecimal || allowEmptyDraft;
  const displayValue = useMemo(() => {
    if (useDraft && draftValue !== null) return draftValue;
    if (!allowDecimal) return String(value);
    return Number(value.toFixed(Math.max(0, decimalPlaces))).toString();
  }, [allowDecimal, decimalPlaces, draftValue, useDraft, value]);

  const shellClass =
    tone === "violet"
      ? "border-violet-200 bg-white shadow-sm"
      : "border-slate-200 bg-white shadow-sm";
  const isSm = size === "sm";
  const btnH = isSm ? "h-7 w-7" : compact ? "h-9 w-9" : "h-10 w-10";
  const inputW = isSm ? "w-9 text-xs" : compact ? "w-11 text-sm" : "w-12 text-sm";
  const inputPy = isSm ? "py-1" : "py-2";
  const iconClass = isSm ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <div
      className={`inline-flex items-stretch overflow-hidden rounded-lg border ${shellClass}`}
    >
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={value <= min}
        onClick={() => {
          setDraftValue(null);
          onChange(snapToStep(value - delta));
        }}
        className={`flex ${btnH} shrink-0 items-center justify-center border-r border-inherit text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <Minus className={iconClass} />
      </button>
      <input
        type="text"
        inputMode={allowDecimal ? "decimal" : "numeric"}
        aria-label={ariaLabel}
        value={displayValue}
        onFocus={() => {
          if (!useDraft) return;
          setDraftValue(value.toString());
        }}
        onBlur={() => {
          if (!useDraft) return;
          if (allowDecimal) {
            const normalized = (draftValue ?? "")
              .replace(/[^\d.]/g, "")
              .replace(/(\..*)\./g, "$1");
            if (normalized === "" || normalized === ".") {
              onChange(min);
              setDraftValue(null);
              return;
            }
            const parsed = Number(normalized);
            if (!Number.isFinite(parsed)) {
              onChange(min);
              setDraftValue(null);
              return;
            }
            const fixed = Number(parsed.toFixed(Math.max(0, decimalPlaces)));
            onChange(snapToStep(fixed));
            setDraftValue(null);
            return;
          }
          const raw = (draftValue ?? "").replace(/\D/g, "");
          if (raw === "") {
            onChange(min);
            setDraftValue(null);
            return;
          }
          const parsed = Number(raw);
          onChange(Number.isFinite(parsed) ? snapToStep(parsed) : min);
          setDraftValue(null);
        }}
        onChange={(e) => {
          const trimmed = e.target.value.trim();
          if (trimmed === "") {
            if (useDraft) {
              setDraftValue("");
              return;
            }
            onChange(min);
            return;
          }
          if (allowDecimal) {
            const normalized = trimmed
              .replace(/[^\d.]/g, "")
              .replace(/(\..*)\./g, "$1");
            if (normalized === "" || normalized === ".") {
              setDraftValue(normalized);
              return;
            }
            setDraftValue(normalized);
            const parsed = Number(normalized);
            if (!Number.isFinite(parsed)) {
              return;
            }
            const fixed = Number(parsed.toFixed(Math.max(0, decimalPlaces)));
            onChange(snapToStep(fixed));
            return;
          }
          if (allowEmptyDraft) {
            const raw = trimmed.replace(/\D/g, "");
            if (raw === "") {
              setDraftValue("");
              return;
            }
            setDraftValue(raw);
            if (commitOnBlurOnly) return;
            const parsed = Number(raw);
            if (Number.isFinite(parsed)) {
              onChange(snapToStep(parsed));
            }
            return;
          }
          const raw = trimmed.replace(/\D/g, "");
          if (raw === "") {
            onChange(min);
            return;
          }
          onChange(snapToStep(Number(raw)));
        }}
        className={`${inputW} border-0 bg-transparent ${inputPy} text-center font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-inset ${
          tone === "violet" ? "focus:ring-violet-400" : "focus:ring-indigo-400"
        }`}
      />
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        disabled={value >= max}
        onClick={() => {
          setDraftValue(null);
          onChange(snapToStep(value + delta));
        }}
        className={`flex ${btnH} shrink-0 items-center justify-center border-l border-inherit text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40`}
      >
        <Plus className={iconClass} />
      </button>
    </div>
  );
}
