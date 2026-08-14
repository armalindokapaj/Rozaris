"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";

/**
 * The real Auth.js session (checked by every 3D-pipeline write route via
 * src/lib/adminAuth.ts) is a SEPARATE thing from the Zustand `auth` mock
 * flag most of the admin UI gates on, and the two can fall out of sync: the
 * mock persists to localStorage indefinitely, while the real session cookie
 * can expire, leaving the UI looking "signed in as Admin" while every
 * upload/delete/publish silently 401s.
 *
 * `admin/page.tsx` already carried this exact repair-prompt logic inline —
 * this hook extracts it so the two full-page 3D editors
 * (`/admin/3d-experience/[projectId]`, `/admin/3d-map-control/[projectId]`)
 * can use it too. Those routes are reachable directly by URL (bypassing
 * `admin/page.tsx`'s own gate entirely), so a real session going stale
 * while sitting on one of them previously had no repair path at all — the
 * confirmed root cause of "3D Experience upload always fails."
 *
 * ⚠️ SECURITY FIX (see the "Rozaris Platform Audit" T-close-auth-gaps
 * follow-up): this used to auto-repair — and every call site's "Reconnect"
 * button used to repair — by silently signing in with the hardcoded seeded
 * admin@rozaris.demo/"1" credentials, with no check on who was actually at
 * the keyboard. That was a real, deployed one-click (and in the
 * auto-effect's case, zero-click) privilege escalation: any signed-in
 * demo buyer/publisher landing on an admin route got a genuine Auth.js
 * admin session for free. Real re-authentication requires real
 * credentials, which this hook doesn't have — so it now only *prompts*,
 * via the same global SignInModal every other sign-in flow in the app
 * uses (which has its own explicit, visible demo-admin button for
 * testers, same as every other role — no different from any other
 * sign-in, and no longer a hidden bypass).
 *
 * Deliberately no auto-repair effect anymore either: a stale/missing real
 * session now only ever surfaces a visible prompt the signed-in person has
 * to act on, never a silent re-auth.
 */
export function useAdminSessionRepair() {
  const openSignIn = useAppStore((s) => s.openSignIn);
  const { status: sessionStatus } = useSession();
  const [authError] = useState<string | null>(null);

  function establishAdminSession() {
    openSignIn();
  }

  return { sessionStatus, authError, reauthing: false, establishAdminSession };
}
