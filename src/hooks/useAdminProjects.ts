"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";

/**
 * Every non-hard-deleted Postgres project (`GET /api/admin/projects`) —
 * pending/active/archived all included, unlike the public catalog. Used
 * by the admin console's `Project3DGrid`/`ContentTab`/`TimelineTab`
 * (`src/app/admin/page.tsx`) and `useAdminProject.ts`, which each need the
 * same full list (replacing the old static mockData.ts `projects` import —
 * see the "Rozaris Platform Audit" memory's Projects/Units migration).
 * Deliberately its own hook rather than reusing `useLiveProjects` (that
 * one's `liveProjects` store slice is the *public* catalog and would hide
 * a pending/archived project from Admin, defeating the point of this
 * list).
 *
 * `loaded` (added alongside the "delete everything I create" ghost-
 * cleanup pass) distinguishes "still fetching" from "fetched, genuinely
 * empty" — both look like `projects: []` otherwise, but a caller deciding
 * whether a `customProjects` entry is a stale phantom needs to know which
 * one it's looking at (see Project3DGrid's cleanup effect).
 */
export function useAdminProjects(): { projects: Project[]; loaded: boolean } {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Project[]) => {
        if (cancelled) return;
        setProjects(rows);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { projects, loaded };
}
