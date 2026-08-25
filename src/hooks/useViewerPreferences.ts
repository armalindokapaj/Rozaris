"use client";

import { useCallback, useSyncExternalStore } from "react";

import type { ViewerQualityLevel } from "@/lib/viewerQuality";

/**
 * More / Settings Menu PRD (2026-08-16) §25 "viewerPreferences" — a small,
 * self-contained localStorage store, deliberately NOT added to the
 * shared, platform-wide `useAppStore` (which several other concurrent
 * sessions are actively editing — see this session's own memory — and
 * which is used far outside the Project Viewer this session is scoped
 * to). Language and Currency are the two settings this PRD explicitly
 * says must reuse real platform infrastructure instead of a viewer-local
 * one (§10/§12) — those two read/write `useAppStore`'s own `locale`/
 * `currency` directly from MoreMenu.tsx, not through this hook. Only the
 * genuinely viewer-scoped preferences live here: Area Units, Reduced
 * Motion (a manual override layered on top of the OS-level
 * `prefers-reduced-motion` query — see useEffectiveReducedMotion.ts), and
 * Interface Auto-Hide.
 *
 * Same SSR-safe `useSyncExternalStore` + localStorage pattern already
 * established in this file tree (useMediaQuery.ts, FirstVisitHint.tsx) —
 * a plain `useEffect`+`setState` read trips this codebase's
 * react-hooks/set-state-in-effect rule.
 */
const STORAGE_KEY = "rozaris:viewerPreferences";

export type AreaUnit = "m2" | "ft2";

export interface ViewerPreferences {
  areaUnit: AreaUnit;
  /** null = follow the OS `prefers-reduced-motion` query (default);
   * true/false = explicit visitor override, per PRD §13. */
  reducedMotionOverride: boolean | null;
  /** PRD §14 — default ON. */
  interfaceAutoHide: boolean;
  /** Settings → Quality (2026-08-25). "auto" = defer to the project's own
   * published `qualityPreset`, i.e. exactly the behaviour that existed
   * before this preference did; the four manual levels override it. See
   * lib/viewerQuality.ts for what each one actually changes. */
  quality: ViewerQualityLevel;
}

export const DEFAULT_VIEWER_PREFERENCES: ViewerPreferences = {
  areaUnit: "m2",
  reducedMotionOverride: null,
  interfaceAutoHide: true,
  quality: "auto",
};

let cached: ViewerPreferences = DEFAULT_VIEWER_PREFERENCES;
const listeners = new Set<() => void>();

function read(): ViewerPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VIEWER_PREFERENCES;
    return { ...DEFAULT_VIEWER_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_VIEWER_PREFERENCES;
  }
}

function write(next: ViewerPreferences) {
  cached = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore — worst case the preference doesn't survive a reload
  }
  listeners.forEach((l) => l());
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
function getSnapshot() {
  return cached;
}
function getServerSnapshot() {
  return DEFAULT_VIEWER_PREFERENCES;
}

export function useViewerPreferences() {
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setAreaUnit = useCallback((areaUnit: AreaUnit) => write({ ...read(), areaUnit }), []);
  const setReducedMotionOverride = useCallback(
    (reducedMotionOverride: boolean | null) => write({ ...read(), reducedMotionOverride }),
    []
  );
  const setInterfaceAutoHide = useCallback((interfaceAutoHide: boolean) => write({ ...read(), interfaceAutoHide }), []);
  const setQuality = useCallback((quality: ViewerQualityLevel) => write({ ...read(), quality }), []);
  const reset = useCallback(() => write(DEFAULT_VIEWER_PREFERENCES), []);

  return { ...prefs, setAreaUnit, setReducedMotionOverride, setInterfaceAutoHide, setQuality, reset };
}

/** One-time sync read on module init so the very first render (before any
 * hook has mounted) already reflects a previously-saved preference rather
 * than the default — mirrors the snapshot `useSyncExternalStore` would
 * read anyway, just available a tick earlier for non-hook consumers. */
if (typeof window !== "undefined") {
  cached = read();
}
