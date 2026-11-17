"use client";

/**
 * Admin school settings — name, logo, academic year, session months, feature toggles.
 * Route: /admin/settings
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Info, Loader2, Save, Upload } from "lucide-react";
import ProtectedRoute from "@/components/lms/ProtectedRoute";
import LmsToast from "@/components/lms/LmsToast";
import { useLmsToast } from "@/hooks/useLmsToast";
import {
  NCERT_CURRICULUM_LABEL,
  SESSION_MONTHS,
  fetchAdminSettings,
  formatSessionRange,
  getAdminAcademicYearOptions,
  updateAdminSettings,
  uploadAdminSchoolLogo,
  type AdminSettings,
} from "@/services/lmsApi";
import { usePortalStore } from "@/store/portalStore";

const FEATURE_TOGGLES: Array<{
  key: string;
  label: string;
  description: string;
}> = [
  {
    key: "ai_quiz_generation",
    label: "AI quiz generation",
    description: "Allow teachers to generate quizzes from NCERT content using AI.",
  },
  {
    key: "ai_paper_grading",
    label: "AI paper grading",
    description: "Allow AI to assist with grading subjective answers.",
  },
  {
    key: "video_learning",
    label: "Video learning",
    description: "Enable video lessons and learning content for students.",
  },
  {
    key: "parent_notifications",
    label: "Parent notifications",
    description: "Send updates and alerts to parents when enabled.",
  },
];

const NOTIFICATION_TOGGLES: Array<{
  key: string;
  label: string;
  description: string;
}> = [
  {
    key: "email_on_join_code_signup",
    label: "Email when student joins via join code",
    description: "Notify the school head when a student registers with a class join code.",
  },
  {
    key: "weekly_summary_email",
    label: "Weekly summary to school head",
    description: "Receive a weekly digest of school activity and engagement.",
  },
];

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border px-4 py-3 hover:bg-muted/30">
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 shrink-0 rounded border-border text-vidya-600 focus:ring-vidya-500"
      />
    </label>
  );
}

function AdminSettingsContent() {
  const { toast, showSuccess, showError } = useLmsToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [schoolName, setSchoolName] = useState("");
  const [academicYear, setAcademicYear] = useState("2025-26");
  const [sessionStartMonth, setSessionStartMonth] = useState(4);
  const [sessionEndMonth, setSessionEndMonth] = useState(3);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});

  const academicYearOptions = useMemo(
    () => getAdminAcademicYearOptions(new Date(), academicYear, sessionStartMonth),
    [academicYear, sessionStartMonth],
  );

  const sessionRangeLabel = useMemo(
    () => formatSessionRange(sessionStartMonth, sessionEndMonth),
    [sessionStartMonth, sessionEndMonth],
  );

  const applySettings = useCallback((data: AdminSettings) => {
    setSchoolName(data.school_name);
    setAcademicYear(data.academic_year);
    setSessionStartMonth(data.session_start_month ?? 4);
    setSessionEndMonth(data.session_end_month ?? 3);
    setLogoUrl(data.logo_url ?? null);
    setFeatures({ ...data.settings });
    setNotifications({ ...data.notifications });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminSettings();
      applySettings(data);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [applySettings, showError]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleSave = async () => {
    const trimmedYear = academicYear.trim();
    if (!trimmedYear) {
      showError("Academic year is required");
      return;
    }
    setSaving(true);
    try {
      const featurePayload: Record<string, boolean> = {};
      for (const row of FEATURE_TOGGLES) {
        featurePayload[row.key] = Boolean(features[row.key]);
      }
      const notificationPayload: Record<string, boolean> = {};
      for (const row of NOTIFICATION_TOGGLES) {
        notificationPayload[row.key] = Boolean(notifications[row.key]);
      }
      const updated = await updateAdminSettings({
        school_name: schoolName.trim(),
        academic_year: trimmedYear,
        session_start_month: sessionStartMonth,
        session_end_month: sessionEndMonth,
        settings: featurePayload,
        notifications: notificationPayload,
      });
      applySettings(updated);
      await usePortalStore.getState().fetchSchoolBranding();
      showSuccess("Settings saved");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleLogoPick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showError("Logo must be 2MB or smaller");
      return;
    }
    setUploadingLogo(true);
    try {
      const updated = await uploadAdminSchoolLogo(file);
      applySettings(updated);
      await usePortalStore.getState().fetchSchoolBranding();
      showSuccess("Logo updated");
    } catch (e) {
      showError(e instanceof Error ? e.message : "Logo upload failed");
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-vidya-600" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background px-4 py-8 sm:px-8">
      <LmsToast toast={toast} theme="light" />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Manage your school profile, NCERT curriculum label, and feature preferences.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-vidya-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm shadow-vidya-600/25 hover:bg-vidya-700 disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save changes
        </button>
      </div>

      <div className="space-y-6">
        <SettingsCard
          title="Profile"
          description="School identity shown on the admin dashboard and reports."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                School name
              </label>
              <input
                value={schoolName}
                onChange={(e) => setSchoolName(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Curriculum
              </label>
              <input
                disabled
                value={NCERT_CURRICULUM_LABEL}
                className="w-full rounded-lg border border-border bg-muted/40 px-3.5 py-2 text-sm text-muted-foreground"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                NCERT content is aligned with CBSE. More boards coming later.
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Session starts in
              </label>
              <select
                value={sessionStartMonth}
                onChange={(e) => setSessionStartMonth(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
              >
                {SESSION_MONTHS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Session ends in
              </label>
              <select
                value={sessionEndMonth}
                onChange={(e) => setSessionEndMonth(Number(e.target.value))}
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
              >
                {SESSION_MONTHS.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.label}
                  </option>
                ))}
              </select>
            </div>
            {sessionRangeLabel ? (
              <p className="sm:col-span-2 text-xs text-muted-foreground">
                Your school session: {sessionRangeLabel}
                {sessionEndMonth < sessionStartMonth
                  ? " (spans two calendar years)"
                  : ""}
              </p>
            ) : null}
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium text-foreground">
                Academic year
              </label>
              <input
                list="academic-year-suggestions"
                value={academicYear}
                onChange={(e) => setAcademicYear(e.target.value)}
                placeholder="e.g. 2025-26"
                className="w-full rounded-lg border border-border bg-background px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-vidya-500"
              />
              <datalist id="academic-year-suggestions">
                {academicYearOptions.map((year) => (
                  <option key={year} value={year} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-muted-foreground">
                Type any label your school uses — suggestions update when you change the session
                month above.
              </p>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-2 block text-sm font-medium text-foreground">Logo</label>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
                  {logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoUrl} alt="School logo" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-muted-foreground">No logo</span>
                  )}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => void handleLogoPick(e.target.files?.[0])}
                  />
                  <button
                    type="button"
                    disabled={uploadingLogo}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-lg border border-vidya-200 bg-vidya-50 px-3 py-2 text-sm font-medium text-vidya-700 hover:bg-vidya-100 disabled:opacity-50"
                  >
                    {uploadingLogo ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    Upload new logo
                  </button>
                  <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, or WEBP · max 2MB</p>
                </div>
              </div>
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Features"
          description="Control which platform capabilities are enabled for your school."
        >
          <div className="space-y-2">
            {FEATURE_TOGGLES.map((row) => (
              <ToggleRow
                key={row.key}
                label={row.label}
                description={row.description}
                checked={Boolean(features[row.key])}
                onChange={(value) =>
                  setFeatures((prev) => ({ ...prev, [row.key]: value }))
                }
              />
            ))}
          </div>
        </SettingsCard>

        <SettingsCard title="Notifications" description="Email preferences for school admins.">
          <div className="space-y-2">
            {NOTIFICATION_TOGGLES.map((row) => (
              <ToggleRow
                key={row.key}
                label={row.label}
                description={row.description}
                checked={Boolean(notifications[row.key])}
                onChange={(value) =>
                  setNotifications((prev) => ({ ...prev, [row.key]: value }))
                }
              />
            ))}
          </div>
        </SettingsCard>

        <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Global AI Tutor / LLM configuration stays separate for platform operators. Save
            changes after editing profile, toggles, or notifications.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  return (
    <ProtectedRoute roles={["admin"]}>
      <AdminSettingsContent />
    </ProtectedRoute>
  );
}
