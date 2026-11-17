"use client";

import { formatMcqOptionDisplay } from "@/lib/quizQuestions";
import { portalList } from "@/lib/portalListUi";
import type { TeacherQuizQuestion } from "@/lib/teacherQuiz";

export default function QuizPreviewPanel({
  title,
  questions,
  previewIndex,
  onPreviewIndex,
}: {
  title: string;
  questions: TeacherQuizQuestion[];
  previewIndex: number;
  onPreviewIndex: (i: number) => void;
}) {
  const q = questions[previewIndex];

  return (
    <div className={`${portalList.listPanel} p-5`}>
      <h3 className="text-sm font-semibold text-slate-900">Student preview</h3>
      <p className="mt-1 text-xs text-slate-500">
        How students will see each MCQ
      </p>
      {questions.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">Add questions to preview.</p>
      ) : (
        <>
          <p className="mt-4 font-medium text-slate-900">{title || "Quiz title"}</p>
          {q ? (
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs text-indigo-600">
                Question {previewIndex + 1} of {questions.length}
              </p>
              <p className="mt-2 text-sm text-slate-800">{q.text}</p>
              <ul className="mt-3 space-y-2">
                {(q.options || []).map((opt, oi) => (
                  <li
                    key={`${q.id}-opt-${oi}`}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  >
                    {formatMcqOptionDisplay(oi, opt)}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-1">
            {questions.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onPreviewIndex(i)}
                className={`h-8 w-8 rounded-lg text-xs font-medium ${
                  i === previewIndex
                    ? "bg-indigo-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
