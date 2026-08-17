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

/**
 * Multi-Channel Publishing PRD Phase 7 — release readiness + history +
 * "Create Release" for one project, backing `/admin/distribution`. See
 * `src/lib/publishing/{validateRelease,compileRelease}.ts` for what these
 * two endpoints actually do server-side; this hook is a thin client shell
 * around them, same shape as `usePublishTargets.ts`.
 */
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
      // Blocking/warnings can shift after a release is created (e.g. it
      // doesn't, but re-checking is cheap and keeps the checklist honest
      // rather than trusting a snapshot from before the write).
      fetch(`/api/admin/projects/${projectId}/releases/readiness`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data: ReleaseReadiness | null) => setReadiness(data))
        .catch(() => {});
    }
  }, [projectId]);

  return { releases, readiness, error, creating, createRelease };
}
