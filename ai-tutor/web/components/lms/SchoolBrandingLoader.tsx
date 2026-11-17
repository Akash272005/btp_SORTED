"use client";

/** Fetches /api/portal/branding after login and stores in portalStore. */

import { useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { usePortalStore } from "@/store/portalStore";

/** Loads school branding once the user session is ready. */
export default function SchoolBrandingLoader() {
  const token = useAuthStore((s) => s.token);
  const hydrated = useAuthStore((s) => s.hydrated);
  const fetchBranding = usePortalStore((s) => s.fetchSchoolBranding);

  useEffect(() => {
    if (!hydrated || !token) return;
    void fetchBranding();
  }, [hydrated, token, fetchBranding]);

  return null;
}
