"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useAppStore } from "@/lib/store";

export function useAdminSessionRepair() {
  const openSignIn = useAppStore((s) => s.openSignIn);
  const { status: sessionStatus } = useSession();
  const [authError] = useState<string | null>(null);

  function establishAdminSession() {
    openSignIn();
  }

  return { sessionStatus, authError, reauthing: false, establishAdminSession };
}
