"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";

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
