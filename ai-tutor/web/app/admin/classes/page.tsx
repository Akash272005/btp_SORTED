"use client";

/**
 * Admin classes — CRUD, join codes, archive; scoped to the admin's school.
 * Route: /admin/classes
 */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import ClassFormModal from "@/components/lms/admin/ClassFormModal";
import { HoverAction } from "@/components/lms/admin/HoverAction";
import LmsToast from "@/components/lms/LmsToast";
import { useLmsToast } from "@/hooks/useLmsToast";
import {
  createAdminClass,
  deleteAdminClass,
  fetchAdminClasses,
  fetchAdminSettings,
  updateAdminClass,
  type AdminClassListOut,
} from "@/services/lmsApi";

type StatusFilter = "all" | "active" | "archived";

function formatGradeSection(grade: string, section: string | null | undefined): string {
  const s = section?.trim();
  if (s) return `${grade} · ${s}`;
  return grade;
}

function ClassesPageContent() {
  const searchParams = useSearchParams();
  const { toast, showSuccess, showError } = useLmsToast();

  const [classes, setClasses] = useState<AdminClassListOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [defaultYear, setDefaultYear] = useState("2025-26");
  const [search, setSearch] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [editing, setEditing] = useState<AdminClassListOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminClassListOut | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, settings] = await Promise.all([
        fetchAdminClasses(),
        fetchAdminSettings().catch(() => null),
      ]);
      setClasses(rows);
      if (settings?.academic_year) setDefaultYear(settings.academic_year);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load classes");
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (searchParams.get("create") === "1") {
      setEditing(null);
      setModalMode("create");
    }
  }, [searchParams]);

  const statusCounts = useMemo(() => {
    const active = classes.filter((c) => c.is_active !== false).length;
    const archived = classes.filter((c) => c.is_active === false).length;
    return { active, archived, all: classes.length };
  }, [classes]);

  const gradeOptions = useMemo(() => {
    let pool = classes;
    if (statusFilter === "active") pool = classes.filter((c) => c.is_active !== false);
    else if (statusFilter === "archived") pool = classes.filter((c) => c.is_active === false);
    const set = new Set(pool.map((c) => c.grade));
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [classes, statusFilter]);

  useEffect(() => {
    if (gradeFilter && !gradeOptions.includes(gradeFilter)) {
      setGradeFilter("");
    }
  }, [gradeFilter, gradeOptions]);

  const filtered = useMemo(() => {
    return classes.filter((row) => {
      const active = row.is_active !== false;
      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "archived" && active) return false;
      if (gradeFilter && row.grade !== gradeFilter) return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        const hay = `${row.name} ${row.grade} ${row.section} ${row.join_code ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [classes, statusFilter, gradeFilter, search]);

  const forStatusOnly = useMemo(() => {
    return classes.filter((row) => {
      const active = row.is_active !== false;
      if (statusFilter === "active" && !active) return false;
      if (statusFilter === "archived" && active) return false;
      return true;
    });
  }, [classes, statusFilter]);

  const blockedByGrade =
    Boolean(gradeFilter && !search.trim()) &&
    forStatusOnly.length > 0 &&
    filtered.length === 0;

  const handleCopy = async (code: string | null | undefined) => {
    if (!code) {
      showError("No join code for this class");
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      showSuccess("Join code copied to clipboard");
    } catch {
      showError("Could not copy — please copy manually");
    }
  };

  const handleCreate = async (payload: {
    grade: string;
    section?: string | null;
    academic_year: string;
  }) => {
    await createAdminClass(payload);
    const sec = payload.section?.trim();
    const label = sec ? `${payload.grade}-${sec.toUpperCase()}` : payload.grade;
    showSuccess(`Class ${label} created`);
    await load();
  };

  const handleUpdate = async (
    classId: string,
    payload: {
      name: string;
      grade: string;
      section?: string | null;
      academic_year: string;
      is_active: boolean;
    },
  ) => {
    await updateAdminClass(classId, payload);
    showSuccess("Class updated");
    await load();
  };

  const handleArchive = async (row: AdminClassListOut) => {
    try {
      await updateAdminClass(row.id, { is_active: false });
      showSuccess(`${row.name} archived — switch filter to "Archived" to view it`);
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Archive failed");
    }
  };

  const handleUnarchive = async (row: AdminClassListOut) => {
    try {
      await updateAdminClass(row.id, { is_active: true });
      showSuccess(`${row.name} restored to Active`);
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Restore failed");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await deleteAdminClass(deleteTarget.id);
      showSuccess(`${deleteTarget.name} deleted`);
      setDeleteTarget(null);
      await load();
    } catch (e) {
      showError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-background px-4 py-8 sm:px-8">
      <LmsToast toast={toast} theme="light" />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Manage sections, join codes, and academic year. Join codes let students join a class
          later (self-registration — coming soon).
        </p>
        <button
          type="button"
          onClick={() => {
            setEditing(null);
            setModalMode("create");
          }}
          className="inline-flex items-center gap-2 rounded-xl bg-vidya-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-vidya-600/25 hover:bg-vidya-700"
        >
          <Plus className="h-4 w-4" />
          Add class
        </button>
      </div>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search class or join code…"
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
          />
        </div>
        <select
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
        >
          <option value="">All grades</option>
          {gradeOptions.map((g) => (
            <option key={g} value={g}>
              Grade {g}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
        >
          <option value="active">Active ({statusCounts.active})</option>
          <option value="archived">Archived ({statusCounts.archived})</option>
          <option value="all">All ({statusCounts.all})</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-vidya-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Plus className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">
              {classes.length === 0
                ? "No classes yet"
                : forStatusOnly.length === 0
                  ? statusFilter === "archived"
                    ? "No archived classes"
                    : "No active classes"
                  : blockedByGrade
                    ? `No ${statusFilter === "archived" ? "archived" : ""} classes in Grade ${gradeFilter}`
                    : "No classes match filters"}
            </p>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {classes.length === 0
                ? "Add your first class to get a join code."
                : blockedByGrade
                  ? `${forStatusOnly.length} ${statusFilter === "archived" ? "archived" : "matching"} class${forStatusOnly.length !== 1 ? "es" : ""} in other grades — clear the grade filter to see them.`
                  : forStatusOnly.length === 0 && statusFilter === "archived"
                    ? "Archive a class from the Active list to see it here."
                    : "Try changing search or filters."}
            </p>
            {blockedByGrade ? (
              <button
                type="button"
                onClick={() => setGradeFilter("")}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border border-vidya-200 bg-vidya-50 px-4 py-2 text-sm font-medium text-vidya-700 hover:bg-vidya-100"
              >
                Show all grades
              </button>
            ) : classes.length === 0 ? (
              <button
                type="button"
                onClick={() => setModalMode("create")}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-vidya-600 px-4 py-2 text-sm font-medium text-white hover:bg-vidya-700"
              >
                <Plus className="h-4 w-4" />
                Add class
              </button>
            ) : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Class</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Grade</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Students</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Join code</th>
                  <th className="px-4 py-3 font-semibold text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row, i) => {
                  const active = row.is_active !== false;
                  return (
                    <tr
                      key={row.id}
                      className={`border-b border-border last:border-0 ${
                        i % 2 === 1 ? "bg-muted/20" : ""
                      } ${!active ? "opacity-70" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{row.name}</div>
                        <div className="text-xs text-muted-foreground">{row.academic_year}</div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatGradeSection(row.grade, row.section)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users?role=student&class_id=${encodeURIComponent(row.id)}`}
                          className="font-medium text-vidya-600 hover:underline"
                        >
                          {row.student_count}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-muted px-2 py-0.5 text-xs font-semibold">
                            {row.join_code ?? "—"}
                          </code>
                          {row.join_code ? (
                            <HoverAction label="Copy join code">
                              <button
                                type="button"
                                onClick={() => void handleCopy(row.join_code)}
                                aria-label="Copy join code"
                                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              >
                                <Copy className="h-4 w-4" />
                              </button>
                            </HoverAction>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {active ? (
                          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                            Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                            Archived
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <HoverAction label="Add student">
                            <Link
                              href={`/admin/users?create=student&class_id=${encodeURIComponent(row.id)}`}
                              aria-label="Add student"
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <UserPlus className="h-4 w-4" />
                            </Link>
                          </HoverAction>
                          <HoverAction label="Edit class">
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(row);
                                setModalMode("edit");
                              }}
                              aria-label="Edit class"
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </HoverAction>
                          {active ? (
                            <HoverAction label="Archive class">
                              <button
                                type="button"
                                onClick={() => void handleArchive(row)}
                                aria-label="Archive class"
                                className="rounded-lg p-1.5 text-muted-foreground hover:bg-amber-50 hover:text-amber-700"
                              >
                                <Archive className="h-4 w-4" />
                              </button>
                            </HoverAction>
                          ) : (
                            <HoverAction label="Restore (unarchive)">
                              <button
                                type="button"
                                onClick={() => void handleUnarchive(row)}
                                aria-label="Restore class"
                                className="rounded-lg p-1.5 text-muted-foreground hover:bg-emerald-50 hover:text-emerald-700"
                              >
                                <ArchiveRestore className="h-4 w-4" />
                              </button>
                            </HoverAction>
                          )}
                          <HoverAction label="Delete class">
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(row)}
                              aria-label="Delete class"
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

      <p className="mt-3 text-xs text-muted-foreground">
        {filtered.length} class{filtered.length !== 1 ? "es" : ""} shown
      </p>

      {modalMode ? (
        <ClassFormModal
          mode={modalMode}
          editing={editing}
          defaultAcademicYear={defaultYear}
          onClose={() => {
            setModalMode(null);
            setEditing(null);
          }}
          onCreate={handleCreate}
          onUpdate={handleUpdate}
        />
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-background p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">Delete class?</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {deleteTarget.student_count > 0
                ? `${deleteTarget.name} has ${deleteTarget.student_count} student(s). Move or remove them before deleting.`
                : `Permanently delete ${deleteTarget.name}? This cannot be undone.`}
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
                disabled={deleteLoading || deleteTarget.student_count > 0}
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

function AdminClassesPageContent() {
  return (
    <ProtectedRoute roles={["admin"]}>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-vidya-600" />
          </div>
        }
      >
        <ClassesPageContent />
      </Suspense>
    </ProtectedRoute>
  );
}


export default function AdminClassesPage() {
  return (
    <Suspense fallback={null}>
      <AdminClassesPageContent />
    </Suspense>
  );
}
