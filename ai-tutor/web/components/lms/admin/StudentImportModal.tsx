"use client";

/** CSV bulk student import — template download, preview, validation errors per row. */

import { useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  Download,
  FileUp,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import {
  importAdminStudents,
  type AdminStudentImportRow,
  type AdminStudentImportResult,
} from "@/services/lmsApi";

export const DEFAULT_STUDENT_IMPORT_PASSWORD = "student123";

const TEMPLATE_CSV = "name,email,class,roll_no\nAarav Sharma,aarav.new@student.vidyasetu.in,Class 8-A,31\n";

type ParsedRow = AdminStudentImportRow & {
  rowNumber: number;
  error?: string;
};

type StudentImportModalProps = {
  onClose: () => void;
  onImported: (result: AdminStudentImportResult, defaultPassword: string) => void;
};

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function parseCsv(text: string): ParsedRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map(normalizeHeader);
  const nameIdx = headers.findIndex((h) => h === "name" || h === "full_name");
  const emailIdx = headers.findIndex((h) => h === "email");
  const classIdx = headers.findIndex((h) => h === "class" || h === "class_id");
  const rollIdx = headers.findIndex((h) => h === "roll_no" || h === "roll");

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const full_name = nameIdx >= 0 ? cells[nameIdx]?.trim() : "";
    const email = emailIdx >= 0 ? cells[emailIdx]?.trim() : "";
    const classValue = classIdx >= 0 ? cells[classIdx]?.trim() : "";
    const roll_no = rollIdx >= 0 ? cells[rollIdx]?.trim() : "";

    let error: string | undefined;
    if (!full_name) error = "Name is required";
    else if (!email) error = "Email is required";
    else if (!classValue) error = "Class is required";

    rows.push({
      rowNumber: i + 1,
      full_name,
      email,
      class: classValue,
      roll_no: roll_no || undefined,
      error,
    });
  }
  return rows;
}

export default function StudentImportModal({ onClose, onImported }: StudentImportModalProps) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState("");

  const validRows = useMemo(() => rows.filter((r) => !r.error), [rows]);
  const invalidRows = useMemo(() => rows.filter((r) => r.error), [rows]);

  const handleFile = async (file: File) => {
    setError("");
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      setError("CSV is empty or missing data rows");
      setRows([]);
      setFileName("");
      return;
    }
    setRows(parsed);
    setFileName(file.name);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "students-import-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setImporting(true);
    setError("");
    try {
      const payload: AdminStudentImportRow[] = validRows.map((r) => ({
        full_name: r.full_name,
        email: r.email,
        class: r.class,
        roll_no: r.roll_no,
      }));
      const result = await importAdminStudents(payload, DEFAULT_STUDENT_IMPORT_PASSWORD);
      onImported(result, DEFAULT_STUDENT_IMPORT_PASSWORD);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Import CSV</h2>
            <p className="text-xs text-muted-foreground">
              Columns: name, email, class, roll_no
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-vidya-200 bg-vidya-50 px-3 py-2 text-sm font-medium text-vidya-700 hover:bg-vidya-100">
              <Upload className="h-4 w-4" />
              Choose file
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </label>
            <button
              type="button"
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Download sample CSV
            </button>
            {fileName ? (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <FileUp className="h-3.5 w-3.5" />
                {fileName}
              </span>
            ) : null}
          </div>

          {rows.length > 0 ? (
            <div className="rounded-xl border border-border">
              <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                <span>
                  {validRows.length} valid · {invalidRows.length} with errors
                </span>
              </div>
              <div className="max-h-64 overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Email</th>
                      <th className="px-3 py-2">Class</th>
                      <th className="px-3 py-2">Roll</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.rowNumber} className="border-b border-border last:border-0">
                        <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                        <td className="px-3 py-2">{row.full_name || "—"}</td>
                        <td className="px-3 py-2">{row.email || "—"}</td>
                        <td className="px-3 py-2">{row.class || "—"}</td>
                        <td className="px-3 py-2">{row.roll_no || "—"}</td>
                        <td className="px-3 py-2">
                          {row.error ? (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700">
                              <AlertCircle className="h-3.5 w-3.5" />
                              {row.error}
                            </span>
                          ) : (
                            <span className="text-xs text-emerald-700">Ready</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
              <Upload className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
                Upload a CSV file to preview rows before importing.
              </p>
            </div>
          )}

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={importing || validRows.length === 0}
            onClick={() => void handleImport()}
            className="inline-flex items-center gap-2 rounded-lg bg-vidya-600 px-4 py-2 text-sm font-medium text-white hover:bg-vidya-700 disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Import {validRows.length > 0 ? `${validRows.length} students` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
