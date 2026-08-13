"use client";

import { useEffect, useState } from "react";
import type { PlatformHdri } from "@/lib/types";

/** The shared Platform HDRI library (`/api/platform-hdri`, GET is public) —
 * used by the admin editor's "Platform HDRI" picker to populate its
 * dropdown. Empty array while loading or on error, never `null` — callers
 * treat "no HDRIs yet" the same as "still loading". */
export function usePlatformHdris(): PlatformHdri[] {
  const [hdris, setHdris] = useState<PlatformHdri[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform-hdri")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: PlatformHdri[]) => {
        if (!cancelled) setHdris(rows);
      })
      .catch(() => {
        if (!cancelled) setHdris([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return hdris;
}
