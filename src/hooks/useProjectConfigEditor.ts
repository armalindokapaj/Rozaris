"use client";

import { useState } from "react";
import { useProject3DConfig } from "./useProject3DConfig";
import { useAdminSessionRepair } from "./useAdminSessionRepair";
import { defaultProject3DConfig } from "@/lib/store";
import { DEFAULT_FILL_COLOR } from "@/lib/render-engine/sections";
import type { CameraPreset, Project3DConfig, Section } from "@/lib/types";

/**
 * Live-editable draft of a project's Project3DConfig row — the shared
 * backing store for Camera/Shots (this pass) and, once built, Sections/
 * Interaction/Performance/Environment/Lighting/Rendering (this table
 * already has real schema + a real validated PATCH route for most of
 * those — see the route's own doc comment; this rebuild is extracting UI
 * for fields that were already real, not inventing new ones for most of
 * it).
 *
 * Same "adjust state during render, not in an effect" sync pattern as
 * useModelEditor.ts, but keyed differently: useProject3DConfig has no
 * stable per-fetch identity to compare against (it fetches once per
 * projectId and never again), so this tracks "have I synced the real
 * fetched row yet" via reference-equality against the shared
 * defaultProject3DConfig placeholder instead.
 */
export function useProjectConfigEditor(projectId: string, canEdit: boolean) {
  const { establishAdminSession } = useAdminSessionRepair();
  const config = useProject3DConfig(projectId);
  const [draft, setDraft] = useState<Project3DConfig>(config);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncedRealConfig, setSyncedRealConfig] = useState(false);
  const [syncedProjectId, setSyncedProjectId] = useState(projectId);

  if (syncedProjectId !== projectId) {
    setSyncedProjectId(projectId);
    setSyncedRealConfig(false);
  } else if (!syncedRealConfig && config !== defaultProject3DConfig) {
    setSyncedRealConfig(true);
    setDraft(config);
    setDirty(false);
  }

  function update(patch: Partial<Project3DConfig>) {
    setDraft((d) => ({ ...d, ...patch }));
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    if (!canEdit) return false;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/project-3d-config/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (res.status === 401) establishAdminSession();
      if (!res.ok) throw new Error(await res.text());
      setDirty(false);
      return true;
    } catch (err) {
      console.error("Experience Editor: project config save failed", err);
      setSaveError(err instanceof Error ? err.message : "Save failed.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  // --- Shots (PRD §38) — thin wrapper over draft.cameraPresets. First
  // item in the array is the "Opening Shot" by convention (matches
  // Reorder already being a required function, no extra field needed). ---
  function addShot(preset: CameraPreset) {
    update({ cameraPresets: [...draft.cameraPresets, preset] });
  }
  function renameShot(id: string, label: string) {
    update({ cameraPresets: draft.cameraPresets.map((p) => (p.id === id ? { ...p, label } : p)) });
  }
  function duplicateShot(id: string) {
    const source = draft.cameraPresets.find((p) => p.id === id);
    if (!source) return;
    const copy: CameraPreset = { ...source, id: `shot-${Date.now()}`, label: `${source.label} copy` };
    const idx = draft.cameraPresets.findIndex((p) => p.id === id);
    const next = [...draft.cameraPresets];
    next.splice(idx + 1, 0, copy);
    update({ cameraPresets: next });
  }
  function deleteShot(id: string) {
    update({ cameraPresets: draft.cameraPresets.filter((p) => p.id !== id) });
  }
  function reorderShot(id: string, direction: "up" | "down") {
    const idx = draft.cameraPresets.findIndex((p) => p.id === id);
    if (idx === -1) return;
    const swapWith = direction === "up" ? idx - 1 : idx + 1;
    if (swapWith < 0 || swapWith >= draft.cameraPresets.length) return;
    const next = [...draft.cameraPresets];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    update({ cameraPresets: next });
  }
  function setOpeningShot(id: string) {
    const idx = draft.cameraPresets.findIndex((p) => p.id === id);
    if (idx <= 0) return;
    const next = [...draft.cameraPresets];
    const [shot] = next.splice(idx, 1);
    next.unshift(shot);
    update({ cameraPresets: next });
  }

  // --- Sections (PRD §34-36) — thin wrapper over draft.sections, same
  // pattern as Shots above. Only one section is "active" (real clip+cap)
  // at a time in the editor's own live preview — session-only state, not
  // persisted (matches the old editor's identical behavior). ---
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  function addSection(opts: {
    name: string;
    scope: Section["scope"];
    buildingName?: string;
    heightM: number;
    centerX?: number;
    centerZ?: number;
    widthM?: number;
    depthM?: number;
    heightOnly?: boolean;
    /** The `${buildingName}::${floor}` composite identity from
     * src/lib/units.ts's `makeFloorId`, when this section is being
     * created AS a specific floor's cut (UnitsPanel's Floor Sections
     * group). Left unset for a plain hand-authored section. */
    floorId?: string;
  }) {
    const section: Section = {
      id: `section-${Date.now()}`,
      name: opts.name,
      scope: opts.scope,
      buildingName: opts.buildingName,
      // Callers should pass the real loaded content's center (see
      // ThreeProjectViewerHandle.getContentBounds) — world origin is only
      // a sane fallback when nothing is loaded yet, not a real placement
      // (a real bug this exact gap caused: a project whose content sits
      // off-origin got a new section that clipped away nearly the whole
      // building, only grazing a thin edge slice).
      centerX: opts.centerX ?? 0,
      centerZ: opts.centerZ ?? 0,
      widthM: opts.widthM ?? 20,
      depthM: opts.depthM ?? 20,
      heightOnly: opts.heightOnly,
      // Set here, on the record itself, NOT via a follow-up
      // updateSection() call: that call would map over the `draft.sections`
      // captured in THIS closure, i.e. the array from BEFORE the update()
      // two lines below lands, so it would write a `sections` array that
      // doesn't contain the new section at all. That exact sequence
      // already caused a real bug once with `heightOnly` (silently never
      // applied to a new Floor Section) — see SectionsPanel.tsx's
      // `create()` doc comment.
      floorId: opts.floorId,
      rotationDeg: 0,
      heightM: opts.heightM,
      bottomEnabled: false,
      fillGapsEnabled: false,
      fillColor: DEFAULT_FILL_COLOR,
    };
    update({ sections: [...draft.sections, section] });
    setActiveSectionId(section.id);
    return section;
  }
  function updateSection(id: string, patch: Partial<Section>) {
    update({ sections: draft.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }
  function deleteSection(id: string) {
    update({ sections: draft.sections.filter((s) => s.id !== id) });
    if (activeSectionId === id) setActiveSectionId(null);
  }
  function duplicateSection(id: string) {
    const source = draft.sections.find((s) => s.id === id);
    if (!source) return;
    const copy: Section = { ...source, id: `section-${Date.now()}`, name: `${source.name} copy` };
    update({ sections: [...draft.sections, copy] });
  }

  return {
    draft,
    dirty,
    saving,
    saveError,
    update,
    save,
    addShot,
    renameShot,
    duplicateShot,
    deleteShot,
    reorderShot,
    setOpeningShot,
    activeSectionId,
    setActiveSectionId,
    addSection,
    updateSection,
    deleteSection,
    duplicateSection,
  };
}

export type UseProjectConfigEditorReturn = ReturnType<typeof useProjectConfigEditor>;
