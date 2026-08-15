"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { useStoreHydrated } from "@/hooks/useStoreHydrated";

/**
 * The one place the real Auth.js session becomes the Zustand `auth` slice
 * every existing dashboard/component already reads (real auth to UI pass —
 * see the "Rozaris Platform Audit" memory). Mounted once in app/layout.tsx,
 * next to `AuthSessionProvider`.
 *
 * Waits for `useStoreHydrated()` before writing — `auth` is still in
 * `partialize` (kept for the optimistic "show last-known state
 * immediately" flash-free reload), and `StoreHydration.tsx`'s rehydrate()
 * runs in its own effect; writing here before it finishes risks the
 * rehydrated (stale, pre-session) value clobbering the real one moments
 * later. Same race this app already hit once — see
 * `useStoreHydrated.ts`'s own doc comment on the Admin 3D Experience
 * redirect bug.
 */
export function AuthSessionSync() {
  const { data: session, status } = useSession();
  const hydrated = useStoreHydrated();
  const setAuthFromSession = useAppStore((s) => s.setAuthFromSession);

  useEffect(() => {
    if (!hydrated || status === "loading") return;
    setAuthFromSession(
      status === "authenticated" && session?.user
        ? {
            name: session.user.name,
            role: session.user.role,
            orgType: session.user.orgType,
            publisherId: session.user.publisherId,
            orgRole: session.user.orgRole,
          }
        : null
    );
  }, [hydrated, status, session, setAuthFromSession]);

  return null;
}
