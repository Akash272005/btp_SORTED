"use client";

/**
 * Admin students — class-filtered list, move class, CSV import, at-risk badges.
 * Route: /admin/students
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRightLeft,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import { HoverAction } from "@/components/lms/admin/HoverAction";
import MoveClassModal from "@/components/lms/admin/MoveClassModal";
import StudentFormModal, {
  type StudentSavedInfo,
} from "@/components/lms/admin/StudentFormModal";
import StudentImportModal from "@/components/lms/admin/StudentImportModal";
import LmsToast from "@/components/lms/LmsToast";
import { useLmsToast } from "@/hooks/useLmsToast";
import {
  deleteAdminUser,
  fetchAdminClasses,
  fetchAdminUsers,
  fetchAtRiskStudents,
  type AdminClassListOut,
  type AdminStudentImportResult,
  type AdminUser,
} from "@/services/lmsApi";

function StudentsPageContent() {
  const searchParams = useSearchParams();
  const { toast, showSuccess, showError } = useLmsToast();

  const [students, setStudents] = useState<AdminUser[]>([]);
  const [classes, setClasses] = useState<AdminClassListOut[]>([]);
  const [atRiskIds, setAtRiskIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterClass, setFilterClass] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [moveTarget, setMoveTarget] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const classId = searchParams.get("class_id");
    const q = searchParams.get("search");
    const create = searchParams.get("create");
    if (classId) setFilterClass(classId);
    if (q) setSearch(q);
    if (create === "1" || create === "student") setFormOpen(true);
  }, [searchParams]);

  const classNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of classes) map[c.id] = c.name;
    return map;
  }, [classes]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [classRows, studentRows, atRiskRows] = await Promise.all([
        fetchAdminClasses(),
        fetchAdminUsers({
          role: "student",
          class_id: filterClass || undefined,
          search: search.trim() || undefined,
          limit: 500,
        }),
        fetchAtRiskStudents(filterClass || undefined).catch(() => []),
      ]);
      setClasses(classRows);
      setStudents(studentRows);
      setAtRiskIds(new Set(atRiskRows.map((r) => r.student_id)));
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [filterClass, search, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const PASSWORD_TOAST_MS = 6000;

  const showPasswordToast = (message: string, password: string) => {
    showSuccess(message, { durationMs: PASSWORD_TOAST_MS, copyText: password });
  };

  const handleStudentSaved = (info: StudentSavedInfo) => {
    if (info.mode === "create" && info.password) {
      showPasswordToast(`Student created · Password: ${info.password}`, info.password);
    } else if (info.mode === "update" && info.password) {
      showPasswordToast(`Password updated · New password: ${info.password}`, info.password);
    } else {
      showSuccess("Student updated");
    }
    void load();
  };

  const handleImported = (result: AdminStudentImportResult, defaultPassword: string) => {
    if (result.created > 0) {
      const summary =
        result.skipped > 0
          ? `Imported ${result.created} students · ${result.skipped} skipped`
          : `Imported ${result.created} students`;
      showPasswordToast(`${summary} · Default password: ${defaultPassword}`, defaultPassword);
    } else {
      showError(`Import failed · ${result.skipped} rows skipped`);
    }
    void load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteAdminUser(deleteTarget.id);
      showSuccess(`${deleteTarget.full_name} deleted`);
      setDeleteTarget(null);
      void load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteLoading(false);
    }
  };

  const activeClasses = useMemo(
    () => classes.filter((c) => c.is_active !== false),
    [classes],
  );

  return (
    <div className="min-h-full bg-background px-4 py-8 sm:px-8">
      <LmsToast toast={toast} theme="light" />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          View and manage learners by class. Bulk import or move between sections.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setImportOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-vidya-200 bg-vidya-50 px-4 py-2.5 text-sm font-medium text-vidya-700 hover:bg-vidya-100"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-vidya-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-vidya-600/25 hover:bg-vidya-700"
          >
            <Plus className="h-4 w-4" />
            Add student
          </button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
        >
          <option value="">All classes</option>
          {activeClasses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-vidya-600" />
          </div>
        ) : students.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <UserPlus className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No students found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Add a student or import a CSV to get started.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Name</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Email</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Roll</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Class</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((row, i) => {
                  const isAtRisk = atRiskIds.has(row.id);
                  const classLabel =
                    (row.class_id && classNameById[row.class_id]) || row.grade || "—";
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-border last:border-0 ${
                        i % 2 === 1 ? "bg-muted/20" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-vidya-100 text-xs font-semibold text-vidya-700">
                            {row.avatar_initials ||
                              row.full_name
                                .split(" ")
                                .map((p) => p[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                          </span>
                          <span className="font-medium text-foreground">{row.full_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{row.email}</td>
                      <td className="px-4 py-3 text-muted-foreground">{row.roll_no ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{classLabel}</td>
                      <td className="px-4 py-3">
                        {isAtRisk ? (
                          <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                            At-risk
                          </span>
                        ) : (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            Active
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <HoverAction label="Move class">
                            <button
                              type="button"
                              onClick={() => setMoveTarget(row)}
                              aria-label="Move class"
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <ArrowRightLeft className="h-4 w-4" />
                            </button>
                          </HoverAction>
                          <HoverAction label="Edit student">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(row);
                                setFormOpen(true);
                              }}
                              aria-label="Edit student"
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </HoverAction>
                          <HoverAction label="Delete student">
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(row)}
                              aria-label="Delete student"
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </HoverAction>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formOpen ? (
        <StudentFormModal
          editing={editing}
          classes={classes}
          defaultClassId={filterClass || undefined}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
          onSaved={handleStudentSaved}
        />
      ) : null}

      {moveTarget ? (
        <MoveClassModal
          student={moveTarget}
          classes={classes}
          classNameById={classNameById}
          onClose={() => setMoveTarget(null)}
          onMoved={() => {
            showSuccess(`${moveTarget.full_name} moved successfully`);
            void load();
          }}
        />
      ) : null}

      {importOpen ? (
        <StudentImportModal
          onClose={() => setImportOpen(false)}
          onImported={handleImported}
        />
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">Delete student?</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Permanently delete {deleteTarget.full_name} ({deleteTarget.email})? This cannot be
              undone.
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
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AdminStudentsPageContent() {
  return (
    <ProtectedRoute roles={["admin"]}>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-vidya-600" />
          </div>
        }
      >
        <StudentsPageContent />
      </Suspense>
    </ProtectedRoute>
  );
}


export default function AdminStudentsPage() {
  return (
    <Suspense fallback={null}>
      <AdminStudentsPageContent />
    </Suspense>
  );
}
