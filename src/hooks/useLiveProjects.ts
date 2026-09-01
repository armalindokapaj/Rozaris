"use client";

import { useEffect } from "react";
import { useAppStore } from "@/lib/store";
import type { Project } from "@/lib/types";

let fetchPromise: Promise<Project[]> | null = null;

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
