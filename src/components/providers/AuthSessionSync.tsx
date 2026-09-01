"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";
import { useStoreHydrated } from "@/hooks/useStoreHydrated";

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
