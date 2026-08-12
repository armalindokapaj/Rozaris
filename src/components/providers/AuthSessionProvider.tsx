"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Thin client wrapper so `signIn()`/`useSession()` from `next-auth/react`
 * work anywhere in the tree — needed for the Admin console's "Sign In as
 * Admin" button to establish a real server session (see
 * src/lib/adminAuth.ts) alongside its existing Zustand mock sign-in.
 * Every other dashboard/page is untouched by this — none of them call
 * `useSession()`, so this has no effect outside the Admin 3D editors.
 */
export function AuthSessionProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
