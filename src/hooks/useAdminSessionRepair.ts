"use client";

import { useEffect, useState } from "react";
import { signIn as nextAuthSignIn, useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { useT } from "@/lib/i18n/useT";

/**
 * The real Auth.js session (checked by every 3D-pipeline write route via
 * src/lib/adminAuth.ts) is a SEPARATE thing from the Zustand `auth` mock
 * flag most of the admin UI gates on, and the two can fall out of sync: the
 * mock persists to localStorage indefinitely, while the real session cookie
 * can expire, or its establishing signIn() call can fail/lag, leaving the
 * UI looking "signed in as Admin" while every upload/delete/publish
 * silently 401s.
 *
 * `admin/page.tsx` already carried this exact auto-repair logic inline —
 * this hook extracts it so the two full-page 3D editors
 * (`/admin/3d-experience/[projectId]`, `/admin/3d-map-control/[projectId]`)
 * can use it too. Those routes are reachable directly by URL (bypassing
 * `admin/page.tsx`'s own gate entirely), so a real session going stale
 * while sitting on one of them previously had no repair path at all — the
 * confirmed root cause of "3D Experience upload always fails."
 */
export function useAdminSessionRepair() {
  const auth = useAppStore((s) => s.auth);
  const { status: sessionStatus } = useSession();
  const [authError, setAuthError] = useState<string | null>(null);
  const [reauthing, setReauthing] = useState(false);
  const { t } = useT();

  async function establishAdminSession() {
    setReauthing(true);
    setAuthError(null);
    try {
      const result = await nextAuthSignIn("credentials", {
        email: "admin@rozaris.demo",
        password: "1",
        redirect: false,
      });
      if (!result || result.error) {
        setAuthError(t("admin.sessionEstablishFailed"));
      }
    } catch {
      setAuthError(t("admin.sessionEstablishFailed"));
    } finally {
      setReauthing(false);
    }
  }

  useEffect(() => {
    // Auto-repair once the real session is confirmed missing (not while
    // still "loading") for a user the mock already believes is signed in —
    // e.g. after the JWT cookie expired since the last visit.
    if (auth.signedIn && sessionStatus === "unauthenticated" && !reauthing) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      establishAdminSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.signedIn, sessionStatus]);

  return { sessionStatus, authError, reauthing, establishAdminSession };
}
