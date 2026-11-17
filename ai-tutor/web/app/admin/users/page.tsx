"use client";

/**
 * All users — account CRUD for students, teachers, and admins (any role).
 * Route: /admin/users
 */

import { useEffect, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Pencil, Trash2, Search, X, Check, Loader2, UserPlus, Copy } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import { useAuthStore } from "@/store/authStore";
import { apiUrl } from "@/lib/api";
import { fetchAdminClasses, type AdminClassListOut } from "@/services/lmsApi";

// ── Types ──────────────────────────────────────────────────────────────────

interface AdminUser {
  id: number;
  email: string;
  full_name: string;
  role: "student" | "teacher" | "admin";
  grade: string | null;
  roll_no: string | null;
  class_id: string | null;
  avatar_initials: string | null;
  password: string | null;
  created_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  student: "bg-vidya-50 text-vidya-700 dark:bg-vidya-900/30 dark:text-vidya-300",
  teacher: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  admin: "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
};

// ── Create/Edit Modal ──────────────────────────────────────────────────────

interface UserFormData {
  full_name: string;
  email: string;
  password: string;
  role: "student" | "teacher" | "admin";
  class_id: string;
  roll_no: string;
}

const EMPTY_FORM: UserFormData = {
  full_name: "",
  email: "",
  password: "",
  role: "student",
  class_id: "",
  roll_no: "",
};

function UserFormModal({
  editing,
  onClose,
  onSaved,
  token,
  classes,
  initialClassId,
}: {
  editing: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
  token: string;
  classes: AdminClassListOut[];
  initialClassId?: string;
}) {
  const defaultClassId = initialClassId || classes[0]?.id || "";
  const [form, setForm] = useState<UserFormData>(() =>
    editing
      ? {
          full_name: editing.full_name,
          email: editing.email,
          password: "",
          role: editing.role,
          class_id: editing.class_id ?? defaultClassId,
          roll_no: editing.roll_no ?? "",
        }
      : { ...EMPTY_FORM, class_id: defaultClassId },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof UserFormData, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const isNew = !editing;
      const url = isNew
        ? apiUrl("/api/admin/users")
        : apiUrl(`/api/admin/users/${editing!.id}`);
      const method = isNew ? "POST" : "PATCH";
      const selectedClass = classes.find((c) => c.id === form.class_id);
      const body: Record<string, string | null> = {
        full_name: form.full_name,
        grade: selectedClass?.name ?? form.class_id,
        class_id: form.class_id,
        roll_no: form.roll_no || null,
      };
      if (isNew) {
        body.email = form.email;
        body.password = form.password;
        body.role = form.role;
      }
      if (form.password && !isNew) body.password = form.password;

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? `Error ${res.status}`);
      }
      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-background border border-border shadow-2xl">
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {editing ? "Edit student" : "Add new student"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Full name</label>
            <input
              required
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              placeholder="e.g. Arjun Verma"
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-vidya-500"
            />
          </div>

          {!editing && (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  placeholder="arjun@student.vidyasetu.in"
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-vidya-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Password</label>
                <input
                  required
                  type="password"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  placeholder="Minimum 6 characters"
                  minLength={6}
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-vidya-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-foreground">Role</label>
                <select
                  value={form.role}
                  onChange={(e) => set("role", e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-vidya-500"
                >
                  <option value="student">Student</option>
                  <option value="teacher">Teacher</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Class</label>
              <select
                value={form.class_id}
                onChange={(e) => set("class_id", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-vidya-500"
              >
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Roll no.</label>
              <input
                value={form.roll_no}
                onChange={(e) => set("roll_no", e.target.value)}
                placeholder="e.g. 05"
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-vidya-500"
              />
            </div>
          </div>

          {editing && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                New password{" "}
                <span className="font-normal text-muted-foreground">(leave blank to keep)</span>
              </label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder="••••••"
                minLength={6}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-vidya-500"
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
              {error}
            </p>
          )}

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
              {editing ? "Save changes" : "Create student"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

function UsersContent() {
  const searchParams = useSearchParams();
  const token = useAuthStore((s) => s.token) ?? "";
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [classes, setClasses] = useState<AdminClassListOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("student");
  const [filterClass, setFilterClass] = useState("");
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const createClassId = searchParams.get("class_id") ?? undefined;

  useEffect(() => {
    const role = searchParams.get("role");
    const classId = searchParams.get("class_id");
    const q = searchParams.get("search");
    const create = searchParams.get("create");
    const highlight = searchParams.get("highlight");

    if (role) setFilterRole(role);
    if (classId) setFilterClass(classId);
    if (q) setSearch(q);
    if (highlight) {
      const id = Number(highlight);
      if (!Number.isNaN(id)) setHighlightId(id);
    }
    if (create === "student") {
      setFilterRole("student");
      setEditing(null);
      setModalOpen(true);
    }
  }, [searchParams]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterRole) params.set("role", filterRole);
      if (filterClass) params.set("class_id", filterClass);
      if (search) params.set("search", search);
      params.set("limit", "200");
      const res = await fetch(apiUrl(`/api/admin/users?${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data: AdminUser[] = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [token, filterRole, filterClass, search]);

  useEffect(() => {
    fetchAdminClasses()
      .then(setClasses)
      .catch(() => setClasses([]));
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleDelete = async (id: number) => {
    setDeleteLoading(true);
    try {
      await fetch(apiUrl(`/api/admin/users/${id}`), {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setDeleteId(null);
      void fetchUsers();
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-background px-4 py-8 sm:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Create, update, and manage students and teachers.
          </p>
        </div>
        <button
          onClick={() => { setEditing(null); setModalOpen(true); }}
          className="inline-flex items-center gap-2 rounded-xl bg-vidya-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-vidya-700 shadow-sm shadow-vidya-600/25"
        >
          <UserPlus className="h-4 w-4" />
          Add student
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3.5 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-vidya-500"
          />
        </div>
        {/* Role filter */}
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-vidya-500"
        >
          <option value="">All roles</option>
          <option value="student">Students</option>
          <option value="teacher">Teachers</option>
          <option value="admin">Admins</option>
        </select>
        {/* Class filter */}
        <select
          value={filterClass}
          onChange={(e) => setFilterClass(e.target.value)}
          className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-vidya-500"
        >
          <option value="">All classes</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-vidya-600" />
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <Plus className="mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">No users found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Adjust filters or add a new student.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Role</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Class</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Roll</th>
                  <th className="px-4 py-3 text-left font-semibold text-muted-foreground">Password</th>
                  <th className="px-4 py-3 text-right font-semibold text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr
                    key={u.id}
                    className={`border-b border-border last:border-0 ${
                      u.id === highlightId
                        ? "bg-indigo-50/80 ring-1 ring-inset ring-indigo-200"
                        : i % 2 === 0
                          ? ""
                          : "bg-muted/20"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-vidya-500 to-vidya-700 text-xs font-bold text-white">
                          {u.avatar_initials ?? u.full_name.slice(0, 2).toUpperCase()}
                        </div>
                        <span className="font-medium text-foreground">{u.full_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${ROLE_COLORS[u.role]}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.class_id
                        ? classes.find((c) => c.id === u.class_id)?.name ?? u.class_id
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.roll_no ?? "—"}</td>
                    <td className="px-4 py-3">
                      {u.password ? (
                        <div className="flex items-center gap-1.5">
                          <code className="rounded bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">
                            {u.password}
                          </code>
                          <button
                            type="button"
                            onClick={() => void navigator.clipboard.writeText(u.password!)}
                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Copy password"
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditing(u); setModalOpen(true); }}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(u.id)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {users.length} user{users.length !== 1 ? "s" : ""} shown
      </p>

      {/* Create / Edit modal */}
      {modalOpen && (
        <UserFormModal
          editing={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={() => void fetchUsers()}
          token={token}
          classes={classes}
          initialClassId={createClassId || filterClass || undefined}
        />
      )}

      {/* Delete confirmation */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-background border border-border p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-foreground">Delete user?</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">
              This will permanently remove the account. This cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setDeleteId(null)}
                className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete(deleteId)}
                disabled={deleteLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminUsersPageContent() {
  return (
    <ProtectedRoute roles={["admin"]}>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-vidya-600" />
          </div>
        }
      >
        <UsersContent />
      </Suspense>
    </ProtectedRoute>
  );
}


export default function AdminUsersPage() {
  return (
    <Suspense fallback={null}>
      <AdminUsersPageContent />
    </Suspense>
  );
}
