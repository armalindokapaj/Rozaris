"use client";

import { useCallback, useEffect, useState } from "react";

export type PublishTargetType = "marketplace" | "embed" | "custom_domain" | "kiosk";
export type PublishTargetStatus = "draft" | "active" | "suspended" | "expired";

export interface PublishTarget {
  id: string;
  publicKey: string;
  projectId: string;
  publisherId: string;
  type: PublishTargetType;
  status: PublishTargetStatus;
  name: string;
  activeReleaseId: string | null;
  customDomain: string | null;
  allowedOrigins: string[];
  branding: Record<string, unknown> | null;
  viewerOverrides: Record<string, unknown> | null;
  licenseStartsAt: string | null;
  licenseEndsAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePublishTargetInput {
  type: PublishTargetType;
  name: string;
  customDomain?: string;
  allowedOrigins?: string[];
}

/**
 * Multi-Channel Publishing PRD Phase 7 — CRUD + deploy for one project's
 * `ProjectPublishTarget` rows, backing the new `/admin/distribution`
 * page. Mirrors `useProjectUnits.ts`'s shape (`targets: null` while the
 * initial GET is in flight, mutations patch local state from each
 * request's own response rather than a full refetch).
 */
export function usePublishTargets(projectId: string) {
  const [targets, setTargets] = useState<PublishTarget[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    fetch(`/api/admin/publish-targets?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: PublishTarget[] | null) => setTargets(rows))
      .catch(() => setTargets(null));
  }, [projectId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const createTarget = useCallback(
    async (input: CreatePublishTargetInput) => {
      try {
        const res = await fetch("/api/admin/publish-targets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, ...input }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Create failed");
        const created = (await res.json()) as PublishTarget;
        setTargets((prev) => [created, ...(prev ?? [])]);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Create failed");
        return false;
      }
    },
    [projectId]
  );

  const updateTarget = useCallback(
    async (targetId: string, patch: Partial<Pick<PublishTarget, "name" | "status" | "customDomain" | "allowedOrigins">> & { reason?: string }) => {
      try {
        const res = await fetch(`/api/admin/publish-targets/${targetId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Update failed");
        const updated = (await res.json()) as PublishTarget;
        setTargets((prev) => (prev ?? []).map((t) => (t.id === targetId ? updated : t)));
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
        return false;
      }
    },
    []
  );

  const deleteTarget = useCallback(async (targetId: string) => {
    try {
      const res = await fetch(`/api/admin/publish-targets/${targetId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Delete failed");
      setTargets((prev) => (prev ?? []).filter((t) => t.id !== targetId));
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      return false;
    }
  }, []);

  const deployRelease = useCallback(async (targetId: string, releaseId: string) => {
    try {
      const res = await fetch(`/api/admin/publish-targets/${targetId}/deploy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ releaseId }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Deploy failed");
      const updated = (await res.json()) as PublishTarget;
      setTargets((prev) => (prev ?? []).map((t) => (t.id === targetId ? updated : t)));
      setError(null);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
      return false;
    }
  }, []);

  return { targets, error, createTarget, updateTarget, deleteTarget, deployRelease };
}
