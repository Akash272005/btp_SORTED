"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import type { UserRole } from "@/types/lms";
import { ROLE_HOME } from "@/store/authStore";

interface ProtectedRouteProps {
  children: React.ReactNode;
  roles?: UserRole[];
}

export default function ProtectedRoute({
  children,
  roles,
}: ProtectedRouteProps) {
  const router = useRouter();
  const { token, user, hydrated, restoreSession, loading } = useAuthStore();

  useEffect(() => {
    if (!hydrated) restoreSession();
  }, [hydrated, restoreSession]);

  useEffect(() => {
    if (!hydrated || loading) return;
    if (!token || !user) {
      router.replace("/login");
      return;
    }
    if (roles && !roles.includes(user.role)) {
      router.replace(ROLE_HOME[user.role]);
    }
  }, [hydrated, loading, token, user, roles, router]);

  if (!hydrated || loading || !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-vidya-200 border-t-vidya-600" />
      </div>
    );
  }

  if (roles && !roles.includes(user.role)) return null;

  return <>{children}</>;
}
