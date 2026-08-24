"use client";

import { useCallback, useEffect, useState } from "react";
import type { Unit, UnitOrientation } from "@/lib/types";
import { normalizeUnit, type RawUnitRow } from "@/lib/units";

/** A unit PATCH body. `Partial<Unit>` on its own can't express "clear
 * this unit's orientation": the route reads an absent key as "leave it
 * alone", so the only way to unset one is to send an explicit `null`,
 * which `Unit["orientation"]` (optional, never null) has no room for. */
export type UnitPatch = Partial<Omit<Unit, "orientation">> & {
  orientation?: UnitOrientation | null;
};

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
  /** Force a re-read — the poll below covers ambient drift, but a bulk
   * write (the Project Manager's inventory table patches up to 500 units
   * in ONE request) lands outside this hook entirely and needs the list
   * refreshed the moment it returns, not up to 30s later. */
  refresh: () => void;
  createUnit: (unit: Unit) => Promise<boolean>;
  updateUnit: (unitId: string, patch: UnitPatch) => Promise<boolean>;
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
/** Units Blocks & POI Layer PRD §21-22 — "Make status refresh
 * automatically." Ms between background polls while the tab is visible;
 * a real admin changing A-405 from available to sold on one browser
 * should show up as RED on every other open viewer within this window,
 * not just on that admin's own next full page load. */
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

    load(); // on load

    // §22 — "on viewer load, on window focus, on visibilitychange ->
    // visible, every ~30 seconds while the viewer is open." Zero GLB
    // reload/remapping on the RenderEngine side either way (see
    // RenderEngine.refreshUnitStatuses's own doc comment) — this hook's
    // job is only to keep `units` itself fresh; every consumer (the admin
    // editor's live preview, the public viewer) already re-applies box
    // appearance whenever this array's reference changes.
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
