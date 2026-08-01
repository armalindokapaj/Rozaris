"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";

/**
 * Zustand's persist middleware is skipHydration:true so the server-rendered
 * markup never depends on localStorage. This component triggers the client
 * rehydration exactly once after mount.
 */
export function StoreHydration() {
  useEffect(() => {
    useAppStore.persist.rehydrate();
  }, []);
  return null;
}
