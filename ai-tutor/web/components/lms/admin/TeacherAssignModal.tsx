"use client";

/** Assign or edit teacher ↔ class ↔ subject mapping (one row per class in the table). */

import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import type {
  AdminClassListOut,
  AdminTeacherAssignment,
  AdminUnassignedTeacher,
} from "@/services/lmsApi";

type TeacherOption = {
  id: number;
  full_name: string;
  email: string;
};

type TeacherAssignModalProps = {
  mode: "create" | "edit";
  assignment: AdminTeacherAssignment | null;
  teachers: TeacherOption[];
  classes: AdminClassListOut[];
  subjects: string[];
  defaultAcademicYear?: string;
  presetTeacherId?: number | null;
  onClose: () => void;
  onCreate: (payload: {
    teacher_id: number;
    class_id: string;
    subjects: string[];
    academic_year: string;
  }) => Promise<void>;
  onUpdate: (
    mappingId: number,
    payload: { class_id: string; subjects: string[]; academic_year: string },
  ) => Promise<void>;
};

export default function TeacherAssignModal({
  mode,
  assignment,
  teachers,
  classes,
  subjects,
  defaultAcademicYear = "2025-26",
  presetTeacherId = null,
  onClose,
  onCreate,
  onUpdate,
}: TeacherAssignModalProps) {
  const activeClasses = useMemo(
    () => classes.filter((c) => c.is_active !== false),
    [classes],
  );

  const [teacherId, setTeacherId] = useState(
    () => String(assignment?.teacher_id ?? presetTeacherId ?? teachers[0]?.id ?? ""),
  );
  const [classId, setClassId] = useState(
    () => assignment?.class_id ?? activeClasses[0]?.id ?? "",
  );
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(
    () => new Set(assignment?.subjects ?? []),
  );
  const [academicYear, setAcademicYear] = useState(
    () => assignment?.academic_year ?? defaultAcademicYear,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (mode === "edit" && assignment) {
      setTeacherId(String(assignment.teacher_id));
      setClassId(assignment.class_id);
      setSelectedSubjects(new Set(assignment.subjects));
      setAcademicYear(assignment.academic_year ?? defaultAcademicYear);
    } else if (presetTeacherId) {
      setTeacherId(String(presetTeacherId));
    }
  }, [mode, assignment, presetTeacherId, defaultAcademicYear]);

  const toggleSubject = (subject: string) => {
    setSelectedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subject)) next.delete(subject);
      else next.add(subject);
      return next;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const subjectList = Array.from(selectedSubjects);
      if (!teacherId) {
        setError("Select a teacher");
        return;
      }
      if (!classId) {
        setError("Select a class");
        return;
      }
      if (subjectList.length === 0) {
        setError("Select at least one subject");
        return;
      }
      const year = academicYear.trim() || defaultAcademicYear;
      if (mode === "create") {
        await onCreate({
          teacher_id: Number(teacherId),
          class_id: classId,
          subjects: subjectList,
          academic_year: year,
        });
      } else if (assignment) {
        await onUpdate(assignment.id, {
          class_id: classId,
          subjects: subjectList,
          academic_year: year,
        });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            {mode === "create" ? "Assign teacher" : "Edit assignment"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Teacher</label>
            <select
              required
              disabled={mode === "edit"}
              value={teacherId}
              onChange={(e) => setTeacherId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500 disabled:opacity-60"
            >
              <option value="" disabled>
                Select teacher
              </option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Class</label>
            <select
              required
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
            >
              {activeClasses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-foreground">Subjects</label>
            <div className="grid grid-cols-2 gap-2">
              {subjects.map((subject) => (
                <label
                  key={subject}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted/50"
                >
                  <input
                    type="checkbox"
                    checked={selectedSubjects.has(subject)}
                    onChange={() => toggleSubject(subject)}
                    className="h-4 w-4 rounded border-border text-vidya-600 focus:ring-vidya-500"
                  />
                  {subject}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Academic year
            </label>
            <input
              required
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-vidya-600 px-4 py-2 text-sm font-medium text-white hover:bg-vidya-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
