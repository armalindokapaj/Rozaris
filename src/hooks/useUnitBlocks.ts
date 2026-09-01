"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UnitBlockRow {
  meshName: string;
  unitId: string | null;
}
export interface UnitBlockTarget {
  slot: { id: string; name: string; role: string };
  version: { id: string; version: number; publicationStatus: string; fileName: string };
  blocks: UnitBlockRow[];
  compiledReleaseCount: number;
  newerDraftVersion: number | null;
  orphanLinks: { meshName: string; unitId: string }[];
}

export interface UseUnitBlocksReturn {
  target: UnitBlockTarget | null;
  loading: boolean;
  savingUnitIds: Set<string>;
  error: string | null;
  clearError: () => void;
  meshFor: (unitId: string) => string | null;
  assign: (unitId: string, meshName: string | null) => Promise<boolean>;
  refresh: () => void;
}

export function useUnitBlocks(projectId: string): UseUnitBlocksReturn {
  const [target, setTarget] = useState<UnitBlockTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUnitIds, setSavingUnitIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const generation = seq.current;
    fetch(`/api/admin/projects/${projectId}/unit-blocks`)
      .then((r) => (r.ok ? (r.json() as Promise<UnitBlockTarget | null>) : null))
      .then((data) => {
        if (cancelled || generation !== seq.current) return;
        setTarget(data);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled || generation !== seq.current) return;
        setTarget(null);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, refreshKey]);

  const meshFor = useCallback(
    (unitId: string) => {
      if (!target) return null;
      const block = target.blocks.find((b) => b.unitId === unitId);
      if (block) return block.meshName;
      return target.orphanLinks.find((l) => l.unitId === unitId)?.meshName ?? null;
    },
    [target]
  );

  const assign = useCallback(
    async (unitId: string, meshName: string | null): Promise<boolean> => {
      setError(null);
      setSavingUnitIds((prev) => new Set(prev).add(unitId));
      const generation = ++seq.current;
      try {
        const res = await fetch(`/api/admin/projects/${projectId}/unit-blocks`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ unitId, meshName }),
        });
        const body = (await res.json().catch(() => null)) as
          | { target?: UnitBlockTarget | null; error?: string | { formErrors?: string[] } }
          | null;
        if (!res.ok) {
          const message =
            typeof body?.error === "string"
              ? body.error
              : res.status === 401 || res.status === 403
                ? "Your session expired — sign in again to keep editing."
                : "Could not change the 3D block.";
          if (alive.current) setError(message);
          return false;
        }
        if (alive.current && generation === seq.current && body?.target !== undefined) {
          setTarget(body.target ?? null);
        }
        return true;
      } catch {
        if (alive.current) setError("Could not change the 3D block.");
        return false;
      } finally {
        if (alive.current) {
          setSavingUnitIds((prev) => {
            const next = new Set(prev);
            next.delete(unitId);
            return next;
          });
        }
      }
    },
    [projectId]
  );

  return {
    target,
    loading,
    savingUnitIds,
    error,
    clearError: useCallback(() => setError(null), []),
    meshFor,
    assign,
    refresh: useCallback(() => setRefreshKey((k) => k + 1), []),
  };
}
