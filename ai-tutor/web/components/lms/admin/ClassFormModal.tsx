"use client";

/** Create / edit class modal — grade, section, academic year, archive toggle. */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import type { AdminClassListOut } from "@/services/lmsApi";

export type ClassFormMode = "create" | "edit";

export type ClassFormValues = {
  grade: string;
  section: string;
  academic_year: string;
  name: string;
  is_active: boolean;
};

type ClassFormModalProps = {
  mode: ClassFormMode;
  editing: AdminClassListOut | null;
  defaultAcademicYear?: string;
  onClose: () => void;
  onCreate: (payload: {
    grade: string;
    section?: string | null;
    academic_year: string;
  }) => Promise<void>;
  onUpdate: (
    classId: string,
    payload: {
      name: string;
      grade: string;
      section?: string | null;
      academic_year: string;
      is_active: boolean;
    },
  ) => Promise<void>;
};

const EMPTY_CREATE = {
  grade: "",
  section: "",
  academic_year: "",
};

function defaultClassName(grade: string, section: string): string {
  const g = grade.trim();
  const sec = section.trim();
  if (!g) return "";
  return sec ? `Class ${g}-${sec.toUpperCase()}` : `Class ${g}`;
}

export default function ClassFormModal({
  mode,
  editing,
  defaultAcademicYear = "2025-26",
  onClose,
  onCreate,
  onUpdate,
}: ClassFormModalProps) {
  const [form, setForm] = useState(() =>
    mode === "edit" && editing
      ? {
          grade: editing.grade,
          section: editing.section ?? "",
          academic_year: editing.academic_year ?? defaultAcademicYear,
          name: editing.name,
          is_active: editing.is_active !== false,
        }
      : {
          ...EMPTY_CREATE,
          academic_year: defaultAcademicYear,
          name: "",
          is_active: true,
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const initialStructure = useRef<{ grade: string; section: string } | null>(null);

  useEffect(() => {
    if (mode === "edit" && editing) {
      initialStructure.current = {
        grade: editing.grade,
        section: editing.section ?? "",
      };
      setForm({
        grade: editing.grade,
        section: editing.section ?? "",
        academic_year: editing.academic_year ?? defaultAcademicYear,
        name: editing.name,
        is_active: editing.is_active !== false,
      });
    }
  }, [mode, editing, defaultAcademicYear]);

  const set = <K extends keyof ClassFormValues>(key: K, value: ClassFormValues[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const previewName = useMemo(
    () => defaultClassName(form.grade, form.section),
    [form.grade, form.section],
  );

  useEffect(() => {
    if (mode !== "edit" || !previewName || !initialStructure.current) return;
    const changed =
      form.grade !== initialStructure.current.grade ||
      form.section !== initialStructure.current.section;
    if (changed) {
      setForm((f) => ({ ...f, name: previewName }));
    }
  }, [form.grade, form.section, mode, previewName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const grade = form.grade.trim();
      const section = form.section.trim();
      if (!grade) {
        setError("Grade is required");
        return;
      }

      if (mode === "create") {
        await onCreate({
          grade,
          section: section || null,
          academic_year: form.academic_year.trim() || defaultAcademicYear,
        });
      } else if (editing) {
        await onUpdate(editing.id, {
          name: form.name.trim() || previewName || `Class ${grade}`,
          grade,
          section: section || null,
          academic_year: form.academic_year.trim() || defaultAcademicYear,
          is_active: form.is_active,
        });
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  };

  const gradeSectionFields = (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">Grade</label>
        <input
          required
          value={form.grade}
          onChange={(e) => set("grade", e.target.value)}
          placeholder="e.g. 10"
          className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          Section <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <input
          value={form.section}
          onChange={(e) => set("section", e.target.value.toUpperCase())}
          placeholder="e.g. A — leave blank if none"
          maxLength={8}
          className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
        />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            {mode === "create" ? "Add class" : "Edit class"}
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
          {gradeSectionFields}

          {previewName ? (
            <p className="rounded-lg border border-vidya-100 bg-vidya-50/50 px-3 py-2 text-sm text-foreground">
              {mode === "create" ? "Will create" : "Will save as"}:{" "}
              <span className="font-semibold">{previewName}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {form.section.trim()
                  ? `Grade ${form.grade.trim()} · Section ${form.section.trim().toUpperCase()}`
                  : `Grade ${form.grade.trim()} only (no section)`}
              </span>
            </p>
          ) : null}

          {mode === "edit" ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Class name
              </label>
              <input
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Updates automatically when grade or section changes — you can override it here.
              </p>
            </div>
          ) : null}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Academic year
            </label>
            <input
              required
              value={form.academic_year}
              onChange={(e) => set("academic_year", e.target.value)}
              placeholder="2025-26"
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
            />
          </div>

          {mode === "edit" ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => set("is_active", e.target.checked)}
                className="h-4 w-4 rounded border-border text-vidya-600 focus:ring-vidya-500"
              />
              Active class (uncheck to archive)
            </label>
          ) : (
            <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              A join code like <span className="font-mono font-semibold">JOIN-10-2026</span> (grade
              only) or <span className="font-mono font-semibold">JOIN-10A-2026</span> (with section)
              will be generated automatically.
            </p>
          )}

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
              {mode === "create" ? "Save class" : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
