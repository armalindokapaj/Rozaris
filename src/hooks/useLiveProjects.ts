"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import type { Project } from "@/lib/types";

/**
 * Module-level (not React state) in-flight cache — deliberately outside
 * the store. Deduping this via the store's `liveProjectsLoading` boolean
 * instead was tried and caused a real, reproducible bug: that flag was
 * also in the effect's own dependency array, so the cleanup resetting it
 * made the effect immediately re-fire, which set it again, forever
 * ("Maximum update depth exceeded"). It also had a subtler failure mode
 * even before that fix — React StrictMode's dev-only double-invoke (mount
 * → run effect → run cleanup → run effect again) left `loading` stuck
 * `true` with `liveProjects` stuck `null` forever in local dev (production
 * unaffected, no double-invoke there), because the first pass's cleanup
 * cancelled its fetch without resetting the flag the second pass's guard
 * checked. A plain module promise sidesteps both: it's shared across every
 * mount point without touching render-triggering state, and StrictMode's
 * two invocations just attach two `.then`s to the one real request.
 */
let fetchPromise: Promise<Project[]> | null = null;

/**
 * Triggers the one-time fetch of `GET /api/projects` into the shared
 * `liveProjects` store slice. Safe to call from multiple mount points
 * (`/search`, `/new-projects`, `/buyer/dashboard`, ...) — the module-level
 * cache above means a visitor who lands directly on a page other than
 * `/search` still gets real data without a second, redundant request once
 * one is already in flight or done. Mirrors `useLiveListings` exactly.
 */
export function useLiveProjects() {
  const liveProjects = useAppStore((s) => s.liveProjects);
  const setLiveProjects = useAppStore((s) => s.setLiveProjects);
  const setLiveProjectsLoading = useAppStore((s) => s.setLiveProjectsLoading);

  useEffect(() => {
    if (liveProjects !== null) return;
    if (!fetchPromise) {
      setLiveProjectsLoading(true);
      fetchPromise = fetch("/api/projects")
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []);
    }
    let cancelled = false;
    fetchPromise.then((rows) => {
      if (cancelled) return;
      setLiveProjects(rows);
      setLiveProjectsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [liveProjects, setLiveProjects, setLiveProjectsLoading]);
}
