"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Mirrors `UnitBlock` / `UnitBlockTarget` in src/lib/unitBlockMapping.ts. */
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
  /** Per-unit in-flight marker, so one row's spinner doesn't freeze the grid. */
  savingUnitIds: Set<string>;
  error: string | null;
  clearError: () => void;
  meshFor: (unitId: string) => string | null;
  assign: (unitId: string, meshName: string | null) => Promise<boolean>;
  refresh: () => void;
}

/**
 * The Sheet Sync grid's 3D BLOCK column, in one hook.
 *
 * Kept entirely separate from `ProjectUnitGrid`'s own draft/debounce/
 * reconcile machinery rather than folded into it as an eighth `Field`.
 * That machinery is built around one `PATCH /units/[unitId]` carrying a
 * `unitPatchSchema` body: `parseCell`, `buildPatch`, the paste matrix and
 * the settle/prune reconcile all assume a cell's value IS a column of the
 * Unit row. A block binding is none of those things — it lives on
 * `UnitMeshLinkV2`, it is 1:1 across rows so writing one row can rewrite
 * another, and it must not ride along in a unit PATCH. Threading it
 * through would have meant special-casing every one of those functions,
 * i.e. exactly the "simplify away an invariant" the grid's own header
 * comment warns against.
 *
 * No debounce here on purpose: this is a <select> with a handful of
 * options, every change is deliberate, and the swap means the response is
 * the only thing that can tell the grid what the OTHER rows now say. It
 * writes on change and re-seeds from the response.
 */
export function useUnitBlocks(projectId: string): UseUnitBlocksReturn {
  const [target, setTarget] = useState<UnitBlockTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingUnitIds, setSavingUnitIds] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  /** Superseded-response guard: a slow first write must not overwrite the
   * target a later one already installed. */
  const seq = useRef(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [refreshKey, setRefreshKey] = useState(0);

  // Load lives INSIDE the effect and runs as a `.then` chain rather than an
  // `async` callback called from the body — same shape as
  // `useProjectUnits`, and what `react-hooks/set-state-in-effect` requires.
  useEffect(() => {
    let cancelled = false;
    // Sampled BEFORE the request: a write that starts and finishes while
    // this GET is in flight bumps `seq`, and this response is then stale by
    // definition — applying it would visibly revert the row the admin just
    // changed, and the swap's second row with it.
    const generation = seq.current;
    fetch(`/api/admin/projects/${projectId}/unit-blocks`)
      .then((r) => (r.ok ? (r.json() as Promise<UnitBlockTarget | null>) : null))
      .then((data) => {
        if (cancelled || generation !== seq.current) return;
        setTarget(data);
        setLoading(false);
      })
      .catch(() => {
        // Silent: the column simply doesn't render. An inventory grid must
        // stay fully usable when the 3D side is unreachable — the seven
        // sheet columns have nothing to do with the model.
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
        // Re-seed from the SERVER's whole picture, not from a local patch:
        // a swap moved a second row too, and the response is the only thing
        // that knows which one.
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
