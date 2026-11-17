"use client";

/**
 * Portal shell state — sidebar collapse, nav badges, school branding cache.
 */

import { create } from "zustand";
import {
  fetchPublicSchoolBranding,
  fetchSchoolBranding,
  type SchoolBranding,
} from "@/services/lmsApi";

const PORTAL_SIDEBAR_COLLAPSED_KEY = "portalSidebarCollapsed";

interface PortalState {
  navBadges: Record<string, number>;
  setNavBadges: (badges: Record<string, number>) => void;
  sidebarCollapsed: boolean;
  sidebarHydrated: boolean;
  hydrateSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  /** Cached GET /api/portal/branding — school name, logo, academic year */
  schoolBranding: SchoolBranding | null;
  schoolBrandingLoading: boolean;
  fetchSchoolBranding: (opts?: { public?: boolean }) => Promise<SchoolBranding | null>;
  clearSchoolBranding: () => void;
  /** Set when a quiz is deleted so Quiz Builder can clear stale session. */
  deletedQuizId: string | null;
  notifyQuizDeleted: (quizId: string) => void;
  clearDeletedQuizNotify: () => void;
}

function persistSidebarCollapsed(collapsed: boolean) {
  if (typeof window !== "undefined") {
    localStorage.setItem(PORTAL_SIDEBAR_COLLAPSED_KEY, String(collapsed));
  }
}

export const usePortalStore = create<PortalState>((set) => ({
  navBadges: {},
  setNavBadges: (navBadges) =>
    set((state) => ({ navBadges: { ...state.navBadges, ...navBadges } })),
  sidebarCollapsed: false,
  sidebarHydrated: false,
  hydrateSidebar: () => {
    if (typeof window === "undefined") return;
    const collapsed = localStorage.getItem(PORTAL_SIDEBAR_COLLAPSED_KEY) === "true";
    set({ sidebarCollapsed: collapsed, sidebarHydrated: true });
  },
  setSidebarCollapsed: (collapsed) => {
    persistSidebarCollapsed(collapsed);
    set({ sidebarCollapsed: collapsed });
  },
  toggleSidebar: () =>
    set((state) => {
      const next = !state.sidebarCollapsed;
      persistSidebarCollapsed(next);
      return { sidebarCollapsed: next };
    }),
  schoolBranding: null,
  schoolBrandingLoading: false,
  fetchSchoolBranding: async (opts) => {
    set({ schoolBrandingLoading: true });
    try {
      const branding = opts?.public
        ? await fetchPublicSchoolBranding()
        : await fetchSchoolBranding();
      set({ schoolBranding: branding, schoolBrandingLoading: false });
      return branding;
    } catch {
      set({ schoolBrandingLoading: false });
      return null;
    }
  },
  clearSchoolBranding: () => set({ schoolBranding: null }),
  deletedQuizId: null,
  notifyQuizDeleted: (quizId) => set({ deletedQuizId: quizId }),
  clearDeletedQuizNotify: () => set({ deletedQuizId: null }),
}));

export const PORTAL_SIDEBAR_WIDTH_EXPANDED = 260;
export const PORTAL_SIDEBAR_WIDTH_COLLAPSED = 72;
