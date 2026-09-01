"use client";

import { useEffect, useState } from "react";
import type { FeatureFlagKey } from "@/lib/featureFlags";

export function useFeatureFlags(): Record<FeatureFlagKey, boolean> {
  const [flags, setFlags] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/feature-flags")
      .then((r) => (r.ok ? r.json() : {}))
      .then(setFlags)
      .catch(() => {});
  }, []);

  return new Proxy(flags, {
    get: (target, prop: string) => (prop in target ? target[prop] : true),
  }) as Record<FeatureFlagKey, boolean>;
}
