"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { apiUrl } from "@/lib/api";
import { setRoleCookie } from "@/lib/authCookie";
import { usePortalStore } from "@/store/portalStore";
import type { AuthUser, UserRole } from "@/types/lms";

const ROLE_HOME: Record<UserRole, string> = {
  student: "/student/dashboard",
  teacher: "/teacher/dashboard",
  admin: "/admin/dashboard",
};

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  hydrated: boolean;
  login: (email: string, password: string, role: UserRole) => Promise<string>;
  loginGoogle: (idToken: string, role: UserRole) => Promise<string>;
  restoreSession: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      loading: false,
      error: null,
      hydrated: false,

      clearError: () => set({ error: null }),

      login: async (email, password, role) => {
        set({ loading: true, error: null });
        try {
          const res = await fetch(apiUrl("/api/auth/login"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password, role }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || "Login failed");
          set({ token: data.access_token, loading: false });
          await get().restoreSession();
          return data.redirect || ROLE_HOME[role];
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Login failed";
          set({ error: msg, loading: false });
          throw e;
        }
      },

      loginGoogle: async (idToken, role) => {
        set({ loading: true, error: null });
        try {
          const res = await fetch(apiUrl("/api/auth/google"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id_token: idToken, role }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.detail || "Google sign-in failed");
          set({ token: data.access_token, loading: false });
          await get().restoreSession();
          return data.redirect || ROLE_HOME[role];
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Google sign-in failed";
          set({ error: msg, loading: false });
          throw e;
        }
      },

      restoreSession: async () => {
        const token = get().token;
        if (!token) {
          setRoleCookie(null);
          set({ user: null, hydrated: true });
          return;
        }
        set({ loading: true });
        try {
          const res = await fetch(apiUrl("/api/auth/me"), {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            setRoleCookie(null);
            set({ token: null, user: null, loading: false, hydrated: true });
            return;
          }
          const user = (await res.json()) as AuthUser;
          setRoleCookie(user.role);
          set({ user, loading: false, hydrated: true, error: null });
        } catch {
          setRoleCookie(null);
          set({ token: null, user: null, loading: false, hydrated: true });
        }
      },

      logout: () => {
        setRoleCookie(null);
        usePortalStore.getState().clearSchoolBranding(); // drop cached school name/logo
        set({ token: null, user: null, error: null });
      },
    }),
    {
      name: "vidyasetu-auth",
      partialize: (s) => ({ token: s.token }),
      onRehydrateStorage: () => (state) => {
        state?.restoreSession();
      },
    },
  ),
);

export function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export { ROLE_HOME };
