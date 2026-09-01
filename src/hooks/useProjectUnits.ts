"use client";

import { useCallback, useEffect, useState } from "react";
import type { Unit, UnitOrientation } from "@/lib/types";
import { normalizeUnit, type RawUnitRow } from "@/lib/units";

export type UnitPatch = Partial<Omit<Unit, "orientation">> & {
  orientation?: UnitOrientation | null;
};

export interface UseProjectUnitsResult {
  units: Unit[] | null;
  error: string | null;
  refresh: () => void;
  createUnit: (unit: Unit) => Promise<boolean>;
  updateUnit: (unitId: string, patch: UnitPatch) => Promise<boolean>;
  deleteUnit: (unitId: string) => Promise<boolean>;
}

const UNIT_STATUS_POLL_MS = 30_000;

export function useProjectUnits(projectId: string): UseProjectUnitsResult {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(`/api/projects/${projectId}/units`)
        .then((r) => (r.ok ? r.json() : null))
        .then((rows: RawUnitRow[] | null) => {
          if (cancelled) return;
          setUnits(rows ? rows.map(normalizeUnit) : null);
        })
        .catch(() => {
          if (!cancelled) setUnits(null);
        });
    };

    load();

    const onFocus = () => load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = setInterval(load, UNIT_STATUS_POLL_MS);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(interval);
    };
  }, [projectId, refreshKey]);

  const createUnit = useCallback(
    async (unit: Unit) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/units`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(unit),
        });
        if (!res.ok) throw new Error(await res.text());
        const created = normalizeUnit((await res.json()) as RawUnitRow);
        setUnits((prev) => [...(prev ?? []), created]);
        setError(null);
        return true;
      } catch (err) {
        console.error("useProjectUnits: create failed", err);
        setError(err instanceof Error ? err.message : "create failed");
        return false;
      }
    },
    [projectId]
  );

  const updateUnit = useCallback(
    async (unitId: string, patch: UnitPatch) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/units/${unitId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) throw new Error(await res.text());
        const updated = normalizeUnit((await res.json()) as RawUnitRow);
        setUnits((prev) => (prev ?? []).map((u) => (u.id === unitId ? updated : u)));
        setError(null);
        return true;
      } catch (err) {
        console.error("useProjectUnits: update failed", err);
        setError(err instanceof Error ? err.message : "update failed");
        return false;
      }
    },
    [projectId]
  );

  const deleteUnit = useCallback(
    async (unitId: string) => {
      try {
        const res = await fetch(`/api/projects/${projectId}/units/${unitId}`, { method: "DELETE" });
        if (!res.ok) throw new Error(await res.text());
        setUnits((prev) => (prev ?? []).filter((u) => u.id !== unitId));
        setError(null);
        return true;
      } catch (err) {
        console.error("useProjectUnits: delete failed", err);
        setError(err instanceof Error ? err.message : "delete failed");
        return false;
      }
    },
    [projectId]
  );

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  return { units, error, refresh, createUnit, updateUnit, deleteUnit };
}
