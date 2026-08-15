"use client";

import { useEffect, useState } from "react";
import type { FeatureFlagKey } from "@/lib/featureFlags";

/**
 * Client-side read of the public feature-flag map (`GET /api/feature-flags`)
 * — fail-open on every key until the fetch resolves, matching the
 * server's own fail-open default, so nothing flickers hidden then shown.
 */
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
