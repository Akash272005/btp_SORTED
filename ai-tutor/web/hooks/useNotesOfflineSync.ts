"use client";

import { useCallback, useEffect, useState } from "react";
import { countPendingNotes, flushPendingNotes } from "@/lib/notesDb";

export function useNotesOfflineSync() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [pendingCount, setPendingCount] = useState(0);

  const refreshPending = useCallback(async () => {
    setPendingCount(await countPendingNotes());
  }, []);

  const syncNow = useCallback(async () => {
    const n = await flushPendingNotes();
    await refreshPending();
    return n;
  }, [refreshPending]);

  useEffect(() => {
    const onOnline = () => {
      setIsOnline(true);
      void syncNow();
    };
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    void refreshPending();
    void syncNow();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [syncNow, refreshPending]);

  return { isOnline, pendingCount, syncNow, refreshPending };
}
