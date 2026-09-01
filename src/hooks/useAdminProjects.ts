"use client";

import { useEffect, useState } from "react";
import type { Project } from "@/lib/types";

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
