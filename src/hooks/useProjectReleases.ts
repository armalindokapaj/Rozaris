"use client";

import { useCallback, useEffect, useState } from "react";

export interface ViewerReleaseSummary {
  id: string;
  version: number;
  status: "draft" | "ready" | "archived";
  manifestHash: string;
  createdBy: string | null;
  createdAt: string;
  validatedAt: string | null;
  archivedAt: string | null;
}

export interface ReleaseReadiness {
  ready: boolean;
  blocking: string[];
  warnings: string[];
}

export function useProjectReleases(projectId: string) {
  const [releases, setReleases] = useState<ViewerReleaseSummary[] | null>(null);
  const [readiness, setReadiness] = useState<ReleaseReadiness | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(() => {
    fetch(`/api/admin/projects/${projectId}/releases`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: ViewerReleaseSummary[] | null) => setReleases(rows))
      .catch(() => setReleases(null));
    fetch(`/api/admin/projects/${projectId}/releases/readiness`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: ReleaseReadiness | null) => setReadiness(data))
      .catch(() => setReadiness(null));
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const createRelease = useCallback(async () => {
    setCreating(true);
    try {
      const res = await fetch(`/api/admin/projects/${projectId}/releases`, { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Release creation failed");
      setReleases((prev) => [body as ViewerReleaseSummary, ...(prev ?? [])]);
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Release creation failed");
      return false;
    } finally {
      setCreating(false);
      fetch(`/api/admin/projects/${projectId}/releases/readiness`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: ReleaseReadiness | null) => setReadiness(data))
        .catch(() => {});
    }
  }, [projectId]);

  return { releases, readiness, error, creating, createRelease };
}
