"use client";

import { useEffect, useState } from "react";
import NumericStepper from "@/components/lms/teacher/NumericStepper";
import { mcqOptionText } from "@/lib/quizQuestions";

export type PaperQuestionDraft = {
  id: string;
  type: string;
  text: string;
  marks: number;
  options?: string[];
  correct_answer?: string;
  source?: string;
};

type Props = {
  open: boolean;
  sectionType: string;
  initial?: PaperQuestionDraft | null;
  defaultMarks?: number;
  onClose: () => void;
  onSave: (q: PaperQuestionDraft) => void;
};

function normalizeSectionType(sectionType: string): "mcq" | "short" | "long" {
  const st = sectionType.trim().toLowerCase();
  if (st === "mcq") return "mcq";
  if (st === "long") return "long";
  return "short";
}

export default function PaperQuestionFormModal({
  open,
  sectionType,
  initial,
  defaultMarks = 1,
  onClose,
  onSave,
}: Props) {
  const qType = normalizeSectionType(sectionType);
  const [text, setText] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [modelAnswer, setModelAnswer] = useState("");
  const [marks, setMarks] = useState(1);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setText(initial.text);
      setMarks(Number(initial.marks) || defaultMarks);
      setModelAnswer(initial.correct_answer || "");
      if (qType === "mcq" && initial.options?.length) {
        const opts = [...initial.options];
        while (opts.length < 4) opts.push("");
        setOptions(opts.slice(0, 4));
        const ci = initial.options.findIndex((o) => o === initial.correct_answer);
        setCorrectIndex(ci >= 0 ? ci : 0);
      } else {
        setOptions(["", "", "", ""]);
        setCorrectIndex(0);
      }
    } else {
      setText("");
      setOptions(["", "", "", ""]);
      setCorrectIndex(0);
      setModelAnswer("");
      setMarks(defaultMarks);
    }
  }, [open, initial, defaultMarks, qType]);

  if (!open) return null;

  function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;

    if (qType === "mcq") {
      const filled = options.map((o) => o.trim()).filter(Boolean);
      if (filled.length < 2) return;
      const normalizedOptions = filled.map((o) => mcqOptionText(o));
      const correct =
        normalizedOptions[correctIndex] || normalizedOptions[0];
      onSave({
        id: initial?.id || `manual-${Date.now().toString(36)}`,
        type: "mcq",
        text: trimmed,
        marks: Math.max(0, marks),
        options: normalizedOptions,
        correct_answer: correct,
        source: "manual",
      });
      onClose();
      return;
    }

    onSave({
      id: initial?.id || `manual-${Date.now().toString(36)}`,
      type: qType,
      text: trimmed,
      marks: Math.max(0, marks),
      correct_answer: modelAnswer.trim() || undefined,
      source: "manual",
    });
    onClose();
  }

  const sectionLabel =
    qType === "mcq" ? "MCQ" : qType === "long" ? "Long answer" : "Short answer";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] portal-modal-overlay-enter p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">
          {initial ? "Edit question" : "Add question manually"}
        </h2>
        <p className="mt-1 text-xs text-slate-600">Section type: {sectionLabel}</p>

        <div className="mt-4 space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Question</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
            />
          </div>

          {qType === "mcq" ? (
            <>
              {options.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct"
                    checked={correctIndex === i}
                    onChange={() => setCorrectIndex(i)}
                    className="text-emerald-500"
                  />
                  <input
                    value={opt}
                    onChange={(e) => {
                      const next = [...options];
                      next[i] = e.target.value;
                      setOptions(next);
                    }}
                    placeholder={`Option ${String.fromCharCode(65 + i)}`}
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  />
                </div>
              ))}
              <p className="text-xs text-slate-500">
                Select the radio button for the correct option
              </p>
            </>
          ) : (
            <div>
              <label className="text-xs font-medium text-slate-600">
                Model answer (optional)
              </label>
              <textarea
                value={modelAnswer}
                onChange={(e) => setModelAnswer(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="Reference answer for teachers"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-slate-600">Marks</label>
            <div className="mt-1">
              <NumericStepper
                value={marks}
                onChange={setMarks}
                min={0}
                max={100}
                allowDecimal
                decimalPlaces={1}
                ariaLabel="Question marks"
                compact
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Save question
          </button>
        </div>
      </div>
    </div>
  );
}
