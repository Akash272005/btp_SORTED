"use client";

/**
 * Admin teachers — assign teacher ↔ class ↔ subject; unassigned teachers CTA.
 * Route: /admin/teachers
 */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search, Trash2, UserPlus } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import TeacherAssignModal from "@/components/lms/admin/TeacherAssignModal";
import { HoverAction } from "@/components/lms/admin/HoverAction";
import LmsToast from "@/components/lms/LmsToast";
import { useLmsToast } from "@/hooks/useLmsToast";
import {
  createAdminTeacherAssignment,
  deleteAdminTeacherAssignment,
  fetchAdminClasses,
  fetchAdminSettings,
  fetchAdminTeacherSubjects,
  updateAdminTeacherAssignment,
  type AdminClassListOut,
  type AdminTeacherAssignment,
  type AdminTeacherSubjectsList,
  type AdminUnassignedTeacher,
} from "@/services/lmsApi";

function TeachersPageContent() {
  const { toast, showSuccess, showError } = useLmsToast();

  const [data, setData] = useState<AdminTeacherSubjectsList | null>(null);
  const [classes, setClasses] = useState<AdminClassListOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultYear, setDefaultYear] = useState("2025-26");
  const [search, setSearch] = useState("");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<AdminTeacherAssignment | null>(null);
  const [presetTeacherId, setPresetTeacherId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminTeacherAssignment | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [teacherData, classRows, settings] = await Promise.all([
        fetchAdminTeacherSubjects(),
        fetchAdminClasses(),
        fetchAdminSettings().catch(() => null),
      ]);
      setData(teacherData);
      setClasses(classRows);
      if (settings?.academic_year) setDefaultYear(settings.academic_year);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load teachers");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const teacherOptions = useMemo(() => {
    if (!data) return [];
    const assigned = new Map<number, { full_name: string; email: string }>();
    for (const row of data.assignments) {
      assigned.set(row.teacher_id, {
        full_name: row.teacher_name,
        email: row.teacher_email,
      });
    }
    for (const row of data.unassigned_teachers) {
      assigned.set(row.id, { full_name: row.full_name, email: row.email });
    }
    return Array.from(assigned.entries())
      .map(([id, t]) => ({ id, ...t }))
      .sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [data]);

  const filteredAssignments = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.assignments;
    return data.assignments.filter((row) => {
      const hay = `${row.teacher_name} ${row.class_name} ${row.subjects.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, search]);

  const filteredUnassigned = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.unassigned_teachers;
    return data.unassigned_teachers.filter((row) => {
      const hay = `${row.full_name} ${row.email}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, search]);

  const handleCreate = async (payload: {
    teacher_id: number;
    class_id: string;
    subjects: string[];
    academic_year: string;
  }) => {
    await createAdminTeacherAssignment(payload);
    showSuccess("Teacher assigned");
    await load();
  };

  const handleUpdate = async (
    mappingId: number,
    payload: { class_id: string; subjects: string[]; academic_year: string },
  ) => {
    await updateAdminTeacherAssignment(mappingId, payload);
    showSuccess("Assignment updated");
    await load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteAdminTeacherAssignment(deleteTarget.id);
      showSuccess(`${deleteTarget.teacher_name} unassigned from ${deleteTarget.class_name}`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteLoading(false);
    }
  };

  const openAssign = (teacher?: AdminUnassignedTeacher) => {
    setEditing(null);
    setPresetTeacherId(teacher?.id ?? null);
    setModalMode("create");
  };

  return (
    <div className="min-h-full bg-background px-4 py-8 sm:px-8">
      <LmsToast toast={toast} theme="light" />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Map staff to classes and subjects. Teacher portal shows only assigned classes.
        </p>
        <button
          type="button"
          onClick={() => openAssign()}
          className="inline-flex items-center gap-2 rounded-xl bg-vidya-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-vidya-600/25 hover:bg-vidya-700"
        >
          <Plus className="h-4 w-4" />
          Assign teacher
        </button>
      </div>

      <div className="mb-5">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teacher or class…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-vidya-600" />
          </div>
        ) : !data || (filteredAssignments.length === 0 && filteredUnassigned.length === 0) ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <UserPlus className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No teachers found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {teacherOptions.length === 0 ? (
                <>
                  Create a teacher account in{" "}
                  <Link href="/admin/users?role=teacher" className="text-vidya-600 hover:underline">
                    All Users
                  </Link>{" "}
                  first.
                </>
              ) : (
                "Assign a teacher to a class to get started."
              )}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Teacher</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Class</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Subject(s)</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAssignments.map((row, i) => (
                  <tr
                    key={row.id}
                    className={`border-b border-border last:border-0 ${
                      i % 2 === 1 ? "bg-muted/20" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.teacher_name}</div>
                      <div className="text-xs text-muted-foreground">{row.teacher_email}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{row.class_name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.subjects.map((s) => (
                          <span
                            key={s}
                            className="rounded-full bg-vidya-50 px-2 py-0.5 text-xs font-medium text-vidya-700"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                        Active
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <HoverAction label="Edit assignment">
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(row);
                              setPresetTeacherId(null);
                              setModalMode("edit");
                            }}
                            aria-label="Edit assignment"
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        </HoverAction>
                        <HoverAction label="Remove assignment">
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(row)}
                            aria-label="Remove assignment"
                            className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </HoverAction>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUnassigned.map((row) => (
                  <tr key={`unassigned-${row.id}`} className="border-b border-border bg-amber-50/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground">{row.full_name}</div>
                      <div className="text-xs text-muted-foreground">{row.email}</div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">—</td>
                    <td className="px-4 py-3 text-muted-foreground italic">Not assigned</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                        Unassigned
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openAssign(row)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-vidya-200 bg-vidya-50 px-3 py-1.5 text-xs font-medium text-vidya-700 hover:bg-vidya-100"
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        Assign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalMode && data ? (
        <TeacherAssignModal
          mode={modalMode}
          assignment={editing}
          teachers={teacherOptions}
          classes={classes}
          subjects={data.available_subjects}
          defaultAcademicYear={defaultYear}
          presetTeacherId={presetTeacherId}
          onClose={() => {
            setModalMode(null);
            setEditing(null);
            setPresetTeacherId(null);
          }}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
        />
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">Remove assignment?</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Unassign {deleteTarget.teacher_name} from {deleteTarget.class_name}? The teacher
              account will remain in All Users.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleteLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminTeachersPage() {
  return (
    <ProtectedRoute roles={["admin"]}>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-vidya-600" />
          </div>
        }
      >
        <TeachersPageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
