"use client";

import { useMemo, useState } from "react";
import { defaultProject3DConfig } from "@/lib/store";
import type { NodeOverride, Project3DConfig, ProjectDetailModel, SceneManifestNode, UnitMeshLink } from "@/lib/types";
import type { DetailVersionRow } from "@/components/dashboard/project3d/types";
import { useUndoRedo } from "./useUndoRedo";

interface SetOpts {
  commit?: boolean;
}

/** The subset of editable state that's undo/redo-tracked (Milestone C) —
 * everything a user can actually "edit," excluding navigation/derived
 * state (`selectedNodeRzId`, `sceneManifest`), which stay outside this
 * snapshot and outside undo/redo entirely (see useUndoRedo.ts's own doc
 * comment for why). */
interface EditableSnapshot {
  draft: Project3DConfig;
  scale: number;
  rotationDeg: number;
  altitudeOffset: number;
  linkSelections: Record<string, string>;
  nodeOverrides: Record<string, NodeOverride>;
}

const INITIAL_SNAPSHOT: EditableSnapshot = {
  draft: defaultProject3DConfig,
  scale: 1,
  rotationDeg: 0,
  altitudeOffset: 0,
  linkSelections: {},
  nodeOverrides: {},
};

/**
 * Phase 2 — Editor UX rebuild.
 * - Milestone B collapsed what used to be 8 separate `useState` calls
 *   directly inside Project3DConfigEditor.tsx into this one hook.
 * - Milestone C wraps the 6 genuinely-editable fields (draft/scale/
 *   rotationDeg/altitudeOffset/linkSelections/nodeOverrides) in
 *   `useUndoRedo` as one combined snapshot, so a multi-field change (e.g.
 *   `autoMatchUnitNodes` touching several `linkSelections` keys at once)
 *   is one atomic undo step. `selectedNodeRzId`/`sceneManifest` stay
 *   separate, untracked `useState` — navigation/derived, not edits.
 *
 * Every setter below defaults to the *continuous* (`commit: false`,
 * debounce-coalesced) path, matching a slider drag — callers driven by a
 * discrete control (`<select>`, a toggle, a button) should pass
 * `{ commit: true }` so their change becomes its own undo step
 * immediately rather than possibly merging into a nearby drag.
 *
 * `hydrate()` is the escape hatch for state that's syncing FROM the
 * server (initial load, the row echoed back after a save, or a version
 * switch via `refresh()`) — never a user edit, so it must never itself
 * become an undo step (see useUndoRedo.ts's `setSilent`).
 */
export function useProject3DEditorState(activeVersion: DetailVersionRow | null) {
  const { state: snap, set, setSilent, undo, redo, canUndo, canRedo } = useUndoRedo<EditableSnapshot>(INITIAL_SNAPSHOT);
  const [selectedNodeRzId, setSelectedNodeRzId] = useState<string | null>(null);
  const [sceneManifest, setSceneManifest] = useState<SceneManifestNode[]>([]);

  function update(partial: Partial<Project3DConfig>, opts?: SetOpts) {
    set((prev) => ({ ...prev, draft: { ...prev.draft, ...partial } }), opts);
  }
  function setScale(v: number, opts?: SetOpts) {
    set((prev) => ({ ...prev, scale: v }), opts);
  }
  function setRotationDeg(v: number, opts?: SetOpts) {
    set((prev) => ({ ...prev, rotationDeg: v }), opts);
  }
  function setAltitudeOffset(v: number, opts?: SetOpts) {
    set((prev) => ({ ...prev, altitudeOffset: v }), opts);
  }
  function setLinkSelections(
    updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>),
    opts?: SetOpts
  ) {
    set(
      (prev) => ({
        ...prev,
        linkSelections: typeof updater === "function" ? updater(prev.linkSelections) : updater,
      }),
      opts
    );
  }
  function setNodeOverrides(
    updater: Record<string, NodeOverride> | ((prev: Record<string, NodeOverride>) => Record<string, NodeOverride>),
    opts?: SetOpts
  ) {
    set(
      (prev) => ({
        ...prev,
        nodeOverrides: typeof updater === "function" ? updater(prev.nodeOverrides) : updater,
      }),
      opts
    );
  }
  /** Silent, non-undoable sync of any subset of the snapshot — server
   * hydration only (config-load effect, `refresh()`, post-save echo). */
  function hydrate(partial: Partial<EditableSnapshot>) {
    setSilent((prev) => ({ ...prev, ...partial }));
  }

  // Live-preview staleness fix (carried over unchanged from before
  // Milestone B): the shared viewer builds its own detailModel from the
  // active draft-or-published version plus every in-progress edit, so the
  // preview reflects unsaved changes instead of only ever the last
  // published version.
  const previewUnitLinks = useMemo<UnitMeshLink[]>(
    () =>
      Object.entries(snap.linkSelections)
        .filter(([, unitId]) => unitId)
        .map(([meshName, unitId]) => ({ meshName, unitId })),
    [snap.linkSelections]
  );
  const previewDetailModel = useMemo<ProjectDetailModel | null>(
    () =>
      activeVersion
        ? {
            glbUrl: activeVersion.publicAssetUrl,
            fileName: activeVersion.fileName,
            fileSize: activeVersion.fileSize,
            scale: snap.scale,
            rotationDeg: snap.rotationDeg,
            altitudeOffset: snap.altitudeOffset,
            enabled: true,
            updatedAt: activeVersion.createdAt,
            unitLinks: previewUnitLinks,
            sceneManifest,
            nodeOverrides: Object.values(snap.nodeOverrides),
            triangleCount: activeVersion.triangleCount,
            meshCount: activeVersion.meshCount,
            materialCount: activeVersion.materialCount,
            textureCount: activeVersion.textureCount,
          }
        : null,
    [activeVersion, snap.scale, snap.rotationDeg, snap.altitudeOffset, previewUnitLinks, sceneManifest, snap.nodeOverrides]
  );

  return {
    draft: snap.draft,
    update,
    scale: snap.scale,
    setScale,
    rotationDeg: snap.rotationDeg,
    setRotationDeg,
    altitudeOffset: snap.altitudeOffset,
    setAltitudeOffset,
    linkSelections: snap.linkSelections,
    setLinkSelections,
    nodeOverrides: snap.nodeOverrides,
    setNodeOverrides,
    hydrate,
    undo,
    redo,
    canUndo,
    canRedo,
    selectedNodeRzId,
    setSelectedNodeRzId,
    sceneManifest,
    setSceneManifest,
    previewDetailModel,
  };
}
