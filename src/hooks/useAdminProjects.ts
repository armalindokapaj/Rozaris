"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";

/**
 * Every non-hard-deleted Postgres project (`GET /api/admin/projects`) —
 * pending/active/archived all included, unlike the public catalog. Used
 * by the admin console's `Project3DGrid`/`ContentTab`/`TimelineTab`
 * (`src/app/admin/page.tsx`), which each need the same full list (replacing
 * the old static mockData.ts `projects` import — see the "Rozaris Platform
 * Audit" memory's Projects/Units migration). Deliberately its own hook
 * rather than reusing `useLiveProjects` (that one's `liveProjects` store
 * slice is the *public* catalog and would hide a pending/archived project
 * from Admin, defeating the point of this list).
 */
export function useAdminProjects(): Project[] {
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/projects")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: Project[]) => {
        if (!cancelled) setProjects(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return projects;
}
