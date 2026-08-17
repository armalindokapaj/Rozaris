"use client";

import { useMemo, useState } from "react";
import { useAdminSessionRepair } from "./useAdminSessionRepair";
import type { DetailVersionRow, NodeOverrideRow, UnitLinkRow } from "./useDetailModelSlots";
import type { NodeOverride } from "@/lib/types";
import { autoMatchUnitNodes } from "@/lib/glbUnitNodes";

export interface ModelTransform {
  scale: number;
  positionX: number;
  altitudeOffset: number; // Y position
  positionZ: number;
  rotationXDeg: number;
  rotationDeg: number; // Y rotation
  rotationZDeg: number;
}

export interface ModelSwitches {
  modelEnabled: boolean;
  modelVisible: boolean;
  castShadow: boolean;
  receiveShadow: boolean;
  selectable: boolean;
  transformLocked: boolean;
}

function transformFrom(v: DetailVersionRow | null): ModelTransform {
  return {
    scale: v?.scale ?? 1,
    positionX: v?.positionX ?? 0,
    altitudeOffset: v?.altitudeOffset ?? 0,
    positionZ: v?.positionZ ?? 0,
    rotationXDeg: v?.rotationXDeg ?? 0,
    rotationDeg: v?.rotationDeg ?? 0,
    rotationZDeg: v?.rotationZDeg ?? 0,
  };
}

function switchesFrom(v: DetailVersionRow | null): ModelSwitches {
  return {
    modelEnabled: v?.modelEnabled ?? true,
    modelVisible: v?.modelVisible ?? true,
    castShadow: v?.castShadow ?? true,
    receiveShadow: v?.receiveShadow ?? true,
    selectable: v?.selectable ?? true,
    transformLocked: v?.transformLocked ?? false,
  };
}

/**
 * Scene tab's Model transform/switches (PRD §5) + Materials tab's node
 * overrides (PRD §6) — editing state for whichever version is currently
 * active in the Scene tab's slot picker (useDetailModelSlots). Kept as a
 * separate hook from useDetailModelSlots since that one owns slot/version
 * CRUD (upload/replace/delete/rollback — the "keep exactly as before"
 * section) while this one owns the PRD's new per-version editing surface.
 *
 * Local draft state re-syncs from the server row whenever the ACTIVE
 * VERSION ID changes (slot switch, upload, rollback) — not on every
 * render, so mid-edit state survives unrelated re-renders.
 */
export function useModelEditor(projectId: string, activeVersion: DetailVersionRow | null, canEdit: boolean) {
  const { establishAdminSession } = useAdminSessionRepair();
  const [transform, setTransform] = useState<ModelTransform>(() => transformFrom(activeVersion));
  const [switches, setSwitches] = useState<ModelSwitches>(() => switchesFrom(activeVersion));
  const [overrides, setOverrides] = useState<NodeOverride[]>(() => (activeVersion?.nodeOverrides as NodeOverride[]) ?? []);
  const [links, setLinks] = useState<UnitLinkRow[]>(() => activeVersion?.unitLinks ?? []);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // React's documented "adjusting state when a prop changes" pattern
  // (calling setState during render, not in an effect) — re-syncs the
  // whole draft only when the underlying version IDENTITY changes (slot
  // switch, upload, rollback), not on every field inside it (a save()
  // round-trip echoes the row back with the same id — that shouldn't
  // stomp on unrelated mid-edit fields). An effect would work too but
  // costs an extra render; this adjusts within the same one.
  const [syncedVersionId, setSyncedVersionId] = useState<string | null>(activeVersion?.id ?? null);
  if ((activeVersion?.id ?? null) !== syncedVersionId) {
    setSyncedVersionId(activeVersion?.id ?? null);
    setTransform(transformFrom(activeVersion));
    setSwitches(switchesFrom(activeVersion));
    setOverrides((activeVersion?.nodeOverrides as NodeOverride[]) ?? []);
    setLinks(activeVersion?.unitLinks ?? []);
    setDirty(false);
    setSaveError(null);
  }

  function updateTransform(patch: Partial<ModelTransform>) {
    setTransform((t) => ({ ...t, ...patch }));
    setDirty(true);
  }
  function updateSwitches(patch: Partial<ModelSwitches>) {
    setSwitches((s) => ({ ...s, ...patch }));
    setDirty(true);
  }
  function resetTransform() {
    updateTransform({ scale: 1, positionX: 0, altitudeOffset: 0, positionZ: 0, rotationXDeg: 0, rotationDeg: 0, rotationZDeg: 0 });
  }
  function groundAlign(newAltitudeOffset: number) {
    updateTransform({ altitudeOffset: newAltitudeOffset });
  }

  function updateOverride(rzNodeId: string, patch: Partial<NodeOverride>) {
    setOverrides((prev) => {
      const idx = prev.findIndex((o) => o.rzNodeId === rzNodeId);
      if (idx === -1) return [...prev, { rzNodeId, materialOverrideEnabled: true, ...patch }];
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
    setDirty(true);
  }
  function restoreOriginal(rzNodeId: string) {
    setOverrides((prev) => prev.filter((o) => o.rzNodeId !== rzNodeId));
    setDirty(true);
  }
  function overrideFor(rzNodeId: string): NodeOverride | null {
    return overrides.find((o) => o.rzNodeId === rzNodeId) ?? null;
  }

  function setLink(meshName: string, unitId: string | null) {
    setLinks((prev) => {
      const withoutMesh = prev.filter((l) => l.meshName !== meshName);
      return unitId ? [...withoutMesh, { meshName, unitId, mappingStatus: "mapped" }] : withoutMesh;
    });
    setDirty(true);
  }
  function linkFor(meshName: string): string | null {
    return links.find((l) => l.meshName === meshName)?.unitId ?? null;
  }
  function linkRowFor(meshName: string): UnitLinkRow | null {
    return links.find((l) => l.meshName === meshName) ?? null;
  }
  /** Units tab (PRD §15/§25) — the per-unit POI-camera fields. Only
   * meaningful on an already-linked mesh; a no-op if `setLink` hasn't
   * created the row yet. */
  function updateLinkPoi(meshName: string, patch: Partial<Pick<UnitLinkRow, "poiYawDeg" | "poiEnabled" | "poiDistanceOverride" | "poiHeightOverride">>) {
    setLinks((prev) => prev.map((l) => (l.meshName === meshName ? { ...l, ...patch } : l)));
    setDirty(true);
  }
  function autoDetectLinks(detectedMeshNames: string[], units: { id: string; code: string }[]) {
    // "Auto Detect" — matches Unit_<code> mesh names to a real Unit via
    // the shared `normalizeUnitMatchKey`/`autoMatchUnitNodes` (glbUnitNodes.ts),
    // the same normalizer `Unit Mapping`'s own code-comparison-by-code
    // path already used correctly. Units Blocks & POI Layer PRD §6: this
    // used to compare bare trailing digits instead ("Unit_A-101" vs. code
    // "A-101" both reduced to "101") — a real collision risk across
    // buildings sharing room numbers ("A-101" and "B-101" would both match
    // the first Unit found with a "101" in its code, mis-mapping whichever
    // lost the race). Never overwrites an existing manual selection.
    setLinks((prev) => {
      const currentSelections: Record<string, string> = {};
      for (const l of prev) currentSelections[l.meshName] = l.unitId;
      const nextSelections = autoMatchUnitNodes(detectedMeshNames, units, currentSelections);
      return Object.entries(nextSelections).map(
        ([meshName, unitId]) => prev.find((l) => l.meshName === meshName) ?? { meshName, unitId, mappingStatus: "mapped" }
      );
    });
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    if (!activeVersion || !canEdit) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const res1 = await fetch(`/api/detail-models/${projectId}/versions/${activeVersion.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...transform, ...switches }),
      });
      if (res1.status === 401) establishAdminSession();
      if (!res1.ok) throw new Error(await res1.text());

      const res2 = await fetch(`/api/detail-models/${projectId}/versions/${activeVersion.id}/scene`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(overrides),
      });
      if (res2.status === 401) establishAdminSession();
      if (!res2.ok) throw new Error(await res2.text());

      const res3 = await fetch(`/api/detail-models/${projectId}/versions/${activeVersion.id}/links`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          links.map((l) => ({
            meshName: l.meshName,
            unitId: l.unitId,
            poiYawDeg: l.poiYawDeg,
            poiEnabled: l.poiEnabled,
            poiDistanceOverride: l.poiDistanceOverride,
            poiHeightOverride: l.poiHeightOverride,
          }))
        ),
      });
      if (res3.status === 401) establishAdminSession();
      if (!res3.ok) throw new Error(await res3.text());

      setDirty(false);
      return true;
    } catch (err) {
      console.error("Experience Editor: model save failed", err);
      setSaveError(err instanceof Error ? err.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const nodeOverridesForRender = useMemo(() => overrides as unknown as NodeOverrideRow[], [overrides]);

  return {
    transform,
    switches,
    overrides,
    links,
    nodeOverridesForRender,
    dirty,
    saving,
    saveError,
    updateTransform,
    updateSwitches,
    resetTransform,
    groundAlign,
    updateOverride,
    restoreOriginal,
    overrideFor,
    setLink,
    linkFor,
    linkRowFor,
    updateLinkPoi,
    autoDetectLinks,
    save,
  };
}

export type UseModelEditorReturn = ReturnType<typeof useModelEditor>;
