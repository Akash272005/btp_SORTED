"use client";

/**
 * LMS login — loads public school branding; Student | Teacher | Admin demo tabs.
 * Route: /login
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import SchoolBrandMark from "@/components/lms/SchoolBrandMark";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";
import type { UserRole } from "@/types/lms";

const ROLES: { id: UserRole; label: string; hint: string }[] = [
  { id: "student", label: "Student", hint: "himanshu.k@learningbix.com" },
  { id: "teacher", label: "Teacher", hint: "ravi@teacher.vidyasetu.in" },
  { id: "admin", label: "Admin", hint: "admin@vidyasetu.in" },
];

const DEMO_PASSWORD: Record<UserRole, string> = {
  student: "123456",
  teacher: "teacher123",
  admin: "admin123",
};

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, error, clearError } = useAuthStore();
  const schoolBranding = usePortalStore((s) => s.schoolBranding);
  const fetchSchoolBranding = usePortalStore((s) => s.fetchSchoolBranding);
  const [role, setRole] = useState<UserRole>("student");
  const [email, setEmail] = useState(ROLES[0].hint);
  const [password, setPassword] = useState(DEMO_PASSWORD.student);

  useEffect(() => {
    void fetchSchoolBranding({ public: true });
  }, [fetchSchoolBranding]);

  const portalSubtitle =
    role === "admin"
      ? "Admin Portal"
      : role === "teacher"
        ? "Teacher Portal"
        : "Student Portal";

  const onRoleChange = (r: UserRole) => {
    setRole(r);
    const hint = ROLES.find((x) => x.id === r)?.hint ?? "";
    setEmail(hint);
    setPassword(DEMO_PASSWORD[r]);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const redirect = await login(email, password, role);
      router.push(redirect);
    } catch {
      /* error in store */
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-vidya-50 via-white to-slate-100 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 shadow-xl">
        <div className="mb-8 flex flex-col items-center text-center">
          <SchoolBrandMark
            branding={schoolBranding}
            portalSubtitle={portalSubtitle}
            size="login"
            showPlatformCredit
          />
          <p className="mt-3 text-sm text-slate-500">Sign in to your portal</p>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2">
          {ROLES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => onRoleChange(r.id)}
              className={`rounded-xl border py-2.5 text-sm font-medium transition-colors ${
                role === r.id
                  ? "border-vidya-600 bg-vidya-600 text-white"
                  : "border-slate-200 text-slate-600 hover:border-vidya-300"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-vidya-500 focus:ring-2 focus:ring-vidya-100"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-vidya-500 focus:ring-2 focus:ring-vidya-100"
              required
            />
          </div>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-vidya-600 py-3 text-sm font-semibold text-white hover:bg-vidya-700 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Sign in
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          Demo accounts are pre-seeded. Google OAuth available when{" "}
          <code className="text-vidya-600">GOOGLE_CLIENT_ID</code> is set.
        </p>
      </div>
    </div>
  );
}
