"use client";

import { useState } from "react";
import { signIn as nextAuthSignIn } from "next-auth/react";

/**
 * Shared real sign-in submit logic for SignInModal and JoinMenu (real auth
 * to UI pass — see the "Rozaris Platform Audit" memory) — both used to run
 * the same client-only `findDemoAccount()` check independently; now both
 * call this instead of duplicating the real `next-auth/react` `signIn()`
 * call and its error handling.
 *
 * `redirect: false` — these are inline popovers/modals, not full-page
 * flows; the caller stays on the current page and just closes on success.
 * The session->Zustand `auth` mirror (`AuthSessionSync`, mounted once in
 * `app/layout.tsx`) picks up the new session and updates every existing
 * `useAppStore(s => s.auth)` reader automatically once it re-renders.
 */
export function useCredentialsSignIn() {
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(email: string, password: string): Promise<boolean> {
    setSubmitting(true);
    setError(false);
    try {
      const result = await nextAuthSignIn("credentials", { email, password, redirect: false });
      if (!result || result.error) {
        setError(true);
        return false;
      }
      return true;
    } finally {
      setSubmitting(false);
    }
  }

  return { submit, error, setError, submitting };
}
