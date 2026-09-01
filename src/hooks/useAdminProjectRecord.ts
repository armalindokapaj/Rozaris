"use client";

import { useCallback, useEffect, useState } from "react";
import type { Project } from "@/lib/types";

export interface ProjectSlotSummary {
  id: string;
  name: string;
  role: string;
  versionCount: number;
  latestVersion: number | null;
  publishedVersion: number | null;
  updatedAt: string | null;
}

export interface AdminProjectRecord {
  project: Project;
  approvalStatus: "pending" | "active" | "archived";
  createdAt: string;
  reviewedAt: string | null;
  idleUntil: string | null;
  idleReason: string | null;
  locationId: string | null;
  counts: { units: number; listings: number; leads: number; members: number; publishTargets: number };
  inventoryRevision: string | null;
  threeD: {
    hasMapModel: boolean;
    mapModelEnabled: boolean;
    mapModelPosition: { lat: number; lng: number } | null;
    hasConfig: boolean;
    slots: ProjectSlotSummary[];
  };
}

export function useAdminProjectRecord(projectId: string | undefined) {
  const [record, setRecord] = useState<AdminProjectRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!projectId) return;
      try {
        const res = await fetch(`/api/admin/projects/${projectId}`, { signal });
        if (res.status === 404) {
          setNotFound(true);
          setLoading(false);
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as AdminProjectRecord;
        setRecord(json);
        setNotFound(false);
        setError(null);
      } catch (err) {
        if (signal?.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        setError(err instanceof Error ? err.message : "Failed to load project.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [projectId]
  );

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  return { record, loading, notFound, error, refresh: () => load() };
}
