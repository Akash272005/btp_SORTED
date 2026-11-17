"use client";

/** Create / edit student — password returned via onSaved for toast display (not in table). */

import { useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import {
  createAdminUser,
  updateAdminUser,
  type AdminClassListOut,
  type AdminUser,
} from "@/services/lmsApi";

export type StudentSavedInfo = {
  mode: "create" | "update";
  password?: string;
};

type StudentFormModalProps = {
  editing: AdminUser | null;
  classes: AdminClassListOut[];
  defaultClassId?: string;
  onClose: () => void;
  onSaved: (info: StudentSavedInfo) => void;
};

type FormData = {
  full_name: string;
  email: string;
  password: string;
  class_id: string;
  roll_no: string;
};

export default function StudentFormModal({
  editing,
  classes,
  defaultClassId,
  onClose,
  onSaved,
}: StudentFormModalProps) {
  const activeClasses = classes.filter((c) => c.is_active !== false);
  const initialClassId = defaultClassId || activeClasses[0]?.id || "";

  const [form, setForm] = useState<FormData>(() =>
    editing
      ? {
          full_name: editing.full_name,
          email: editing.email,
          password: "",
          class_id: editing.class_id ?? initialClassId,
          roll_no: editing.roll_no ?? "",
        }
      : {
          full_name: "",
          email: "",
          password: "",
          class_id: initialClassId,
          roll_no: "",
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (key: keyof FormData, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const selectedClass = activeClasses.find((c) => c.id === form.class_id);
      if (editing) {
        const newPassword = form.password.trim();
        const payload: Record<string, string | null> = {
          full_name: form.full_name.trim(),
          class_id: form.class_id,
          grade: selectedClass?.name ?? form.class_id,
          roll_no: form.roll_no.trim() || null,
        };
        if (newPassword) payload.password = newPassword;
        await updateAdminUser(editing.id, payload);
        onSaved(newPassword ? { mode: "update", password: newPassword } : { mode: "update" });
      } else {
        const password = form.password.trim();
        if (!password) {
          setError("Password is required for new students");
          return;
        }
        await createAdminUser({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          password,
          role: "student",
          class_id: form.class_id,
          grade: selectedClass?.name ?? form.class_id,
          roll_no: form.roll_no.trim() || null,
        });
        onSaved({ mode: "create", password });
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
            {editing ? "Edit student" : "Add student"}
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
            <label className="mb-1.5 block text-sm font-medium text-foreground">Full name</label>
            <input
              required
              value={form.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
            />
          </div>

          {!editing ? (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
              />
            </div>
          ) : (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">Email</label>
              <input
                disabled
                value={form.email}
                className="w-full rounded-lg border border-border bg-muted/40 px-3.5 py-2 text-sm text-muted-foreground"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              {editing ? "New password (optional)" : "Password"}
            </label>
            <input
              type="text"
              required={!editing}
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder={editing ? "Leave blank to keep current" : "student123"}
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">Class</label>
            <select
              required
              value={form.class_id}
              onChange={(e) => set("class_id", e.target.value)}
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
            <label className="mb-1.5 block text-sm font-medium text-foreground">Roll no</label>
            <input
              value={form.roll_no}
              onChange={(e) => set("roll_no", e.target.value)}
              placeholder="Unique within class"
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Must be unique per class (e.g. two students in Class 8-A cannot both be roll 1).
            </p>
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
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
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {editing ? "Save changes" : "Create student"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
