"use client";

import NumericStepper from "@/components/lms/teacher/NumericStepper";

type MarksStepperProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  label?: string;
  hint?: string;
  compact?: boolean;
  tone?: "default" | "violet";
};

/** Marks field with label + always-visible +/− stepper. */
export default function MarksStepper({
  value,
  onChange,
  min = 1,
  max = 10,
  label = "Marks",
  hint = "Use + or − to change marks for this question",
  compact = false,
  tone = "default",
}: MarksStepperProps) {
  const labelClass =
    tone === "violet"
      ? "text-xs font-medium text-violet-800"
      : "text-xs font-medium text-slate-500";
  const hintClass =
    tone === "violet" ? "text-[11px] text-violet-600/80" : "text-xs text-slate-500";

  return (
    <div>
      {label ? <label className={labelClass}>{label}</label> : null}
      <div className={label ? (compact ? "mt-1" : "mt-1.5") : ""}>
        <NumericStepper
          value={value}
          onChange={onChange}
          min={min}
          max={max}
          ariaLabel="Marks"
          tone={tone}
          compact={compact}
        />
      </div>
      {hint ? <p className={`mt-1 ${hintClass}`}>{hint}</p> : null}
    </div>
  );
}
