"use client";

/** Move student to another class — editable roll when destination class has a conflict. */

import { useMemo, useState } from "react";
import { ArrowRightLeft, Loader2, X } from "lucide-react";
import { moveAdminStudentClass, type AdminClassListOut, type AdminUser } from "@/services/lmsApi";

type MoveClassModalProps = {
  student: AdminUser;
  classes: AdminClassListOut[];
  classNameById: Record<string, string>;
  onClose: () => void;
  onMoved: () => void;
};

export default function MoveClassModal({
  student,
  classes,
  classNameById,
  onClose,
  onMoved,
}: MoveClassModalProps) {
  const activeClasses = useMemo(
    () => classes.filter((c) => c.is_active !== false && c.id !== student.class_id),
    [classes, student.class_id],
  );

  const [targetClassId, setTargetClassId] = useState(activeClasses[0]?.id ?? "");
  const [rollNo, setRollNo] = useState(student.roll_no ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fromLabel =
    (student.class_id && classNameById[student.class_id]) ||
    student.grade ||
    student.class_id ||
    "—";

  const targetLabel = classNameById[targetClassId] ?? "selected class";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetClassId) {
      setError("Select a destination class");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await moveAdminStudentClass(student.id, targetClassId, rollNo.trim() || null);
      onMoved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Move failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">Move student</h2>
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
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <p className="font-medium text-foreground">{student.full_name}</p>
            <p className="text-xs text-muted-foreground">Currently in {fromLabel}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">From</label>
            <input
              disabled
              value={fromLabel}
              className="w-full rounded-lg border border-border bg-muted/40 px-3.5 py-2 text-sm text-muted-foreground"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">To</label>
            <select
              required
              value={targetClassId}
              onChange={(e) => {
                setTargetClassId(e.target.value);
                setError("");
              }}
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
            >
              {activeClasses.length === 0 ? (
                <option value="">No other active classes</option>
              ) : (
                activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-foreground">
              Roll no in {targetLabel}
            </label>
            <input
              value={rollNo}
              onChange={(e) => {
                setRollNo(e.target.value);
                setError("");
              }}
              placeholder="Unique within class"
              className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Change roll if that number is already taken in the destination class.
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
              disabled={saving || !targetClassId}
              className="inline-flex items-center gap-2 rounded-lg bg-vidya-600 px-4 py-2 text-sm font-medium text-white hover:bg-vidya-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-4 w-4" />
              )}
              Move student
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
