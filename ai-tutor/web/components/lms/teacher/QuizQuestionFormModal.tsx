"use client";

import { useEffect, useState } from "react";
import type { TeacherQuizQuestion } from "@/lib/teacherQuiz";
import MarksStepper from "@/components/lms/teacher/MarksStepper";

type Props = {
  open: boolean;
  initial?: TeacherQuizQuestion | null;
  /** Default marks when adding a new question (from generate panel setting). */
  defaultMarks?: number;
  onClose: () => void;
  onSave: (q: TeacherQuizQuestion) => void;
};

export default function QuizQuestionFormModal({
  open,
  initial,
  defaultMarks = 1,
  onClose,
  onSave,
}: Props) {
  const [text, setText] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [marks, setMarks] = useState(1);

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setText(initial.text);
      setMarks(initial.marks || 1);
      if (initial.type === "mcq" && initial.options?.length) {
        const opts = [...initial.options];
        while (opts.length < 4) opts.push("");
        setOptions(opts.slice(0, 4));
        const ci = initial.options.findIndex(
          (o) => o === initial.correct_answer,
        );
        setCorrectIndex(ci >= 0 ? ci : 0);
      } else {
        setOptions(["", "", "", ""]);
        setCorrectIndex(0);
      }
    } else {
      setText("");
      setOptions(["", "", "", ""]);
      setCorrectIndex(0);
      setMarks(defaultMarks);
    }
  }, [open, initial, defaultMarks]);

  if (!open) return null;

  function handleSave() {
    const trimmed = text.trim();
    if (!trimmed) return;
    const filled = options.map((o) => o.trim()).filter(Boolean);
    if (filled.length < 2) return;
    const q: TeacherQuizQuestion = {
      id: initial?.id || `q-${Date.now().toString(36)}`,
      type: "mcq",
      text: trimmed,
      marks,
      options: filled,
      correct_answer: filled[correctIndex] || filled[0],
      source: initial?.source || "manual",
    };
    onSave(q);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-[2px] portal-modal-overlay-enter p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-slate-900">
          {initial ? "Edit question" : "Add question manually"}
        </h2>
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
            Green check = select the correct option
          </p>
          <MarksStepper value={marks} onChange={setMarks} min={1} max={10} />
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
