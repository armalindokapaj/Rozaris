"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";

/**
 * The Business Publisher dashboard's "my projects" data — real Postgres
 * rows (`GET /api/projects?publisherId=`), replacing the old
 * `mockData.projectsByDeveloper()` (see the "Rozaris Platform Audit"
 * memory's Projects/Units migration). Mirrors `usePublisherListings`
 * exactly.
 */
export function usePublisherProjects(publisherId: string): Project[] | null {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects?publisherId=${encodeURIComponent(publisherId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: Project[] | null) => {
        if (!cancelled) setProjects(rows);
      })
      .catch(() => {
        if (!cancelled) setProjects(null);
      });
    return () => {
      cancelled = true;
    };
  }, [publisherId]);

  return projects;
}
