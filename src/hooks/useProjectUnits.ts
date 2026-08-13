"use client";

import { useCallback, useEffect, useState } from "react";
import type { Unit } from "@/lib/types";
import { normalizeUnit, type RawUnitRow } from "@/lib/units";

export interface UseProjectUnitsResult {
  /** Live Postgres units for this project — `null` while the initial GET
   * is in flight (or on failure), specifically so callers can fall back
   * to their own already-available mockData/Zustand-sourced
   * `project.units` via `liveUnits ?? project.units` during that gap,
   * instead of flashing an empty list (same reasoning
   * `useProject3DConfig.ts` documents for why it falls back to a
   * default rather than an empty/loading state). */
  units: Unit[] | null;
  /** Last mutation's failure, if any — raw/untranslated; callers decide
   * how to surface it. */
  error: string | null;
  createUnit: (unit: Unit) => Promise<boolean>;
  updateUnit: (unitId: string, patch: Partial<Unit>) => Promise<boolean>;
  deleteUnit: (unitId: string) => Promise<boolean>;
}

/**
 * A project's live "Units" inventory — real, shared Postgres rows
 * (`/api/projects/[projectId]/units[...]`), not mockData/Zustand
 * `customProjects`. Two real callers as of the drift-bug fix:
 *
 * - The 3D Experience Configurator's read-only display surfaces
 *   (UnitsPanel, BuildingNavRail, the live preview viewport, via
 *   `Project3DConfigEditor.tsx`'s `effectiveProject` injection) — never
 *   call the mutate functions, since the Configurator has no
 *   unit-editing UI of its own.
 * - `ProjectUnitsEditor.tsx` (the actual CRUD surface, opened from the
 *   main admin dashboard's "3D Viewer" tab) — the only caller of
 *   `createUnit`/`updateUnit`/`deleteUnit`. Before this fix, that editor
 *   dual-wrote to Zustand `customProjects` (which silently no-ops for
 *   any of the 7 seeded mockData projects, since they're never added to
 *   `customProjects`) and fired a non-awaited Postgres write on the
 *   side — so editing a seeded project's units wrote *only* to Postgres,
 *   invisibly, forever out of sync with what every read surface showed.
 *   Postgres is now the only path: mutations patch local state directly
 *   from each request's own response (one round trip, no full refetch,
 *   no optimistic-rollback bookkeeping needed — POST/PATCH already
 *   return the persisted row, DELETE is a real, audited soft-delete).
 * See the "Units: Postgres source of truth in the admin 3D editor" and
 * its drift-bug-fix follow-up memory for the full history.
 */
export function useProjectUnits(projectId: string): UseProjectUnitsResult {
  const [units, setUnits] = useState<Unit[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/units`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows: RawUnitRow[] | null) => {
        if (cancelled) return;
        setUnits(rows ? rows.map(normalizeUnit) : null);
      })
      .catch(() => {
        if (!cancelled) setUnits(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

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
    async (unitId: string, patch: Partial<Unit>) => {
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

  return { units, error, createUnit, updateUnit, deleteUnit };
}
