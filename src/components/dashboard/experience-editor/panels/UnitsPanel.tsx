"use client";

import { useEffect, useState, type RefObject } from "react";
import { ScanSearch, Plus, Wand2 } from "lucide-react";
import { extractUnitNodeNames } from "@/lib/glbUnitNodes";
import { cn } from "@/lib/utils";
import { ColorRow, GroupCard, SectionHeading, SliderRow, ToggleRow } from "../fields";
import type { UseModelEditorReturn } from "@/hooks/useModelEditor";
import type { UseDetailModelSlotsReturn } from "@/hooks/useDetailModelSlots";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { ThreeProjectViewerHandle } from "@/components/project/viewerTypes";
import type { Project, Unit } from "@/lib/types";

const COMPASS_DIRECTIONS: { label: string; deg: number }[] = [
  { label: "N", deg: 0 },
  { label: "E", deg: 90 },
  { label: "S", deg: 180 },
  { label: "W", deg: 270 },
];

/**
 * Units tab (Units Blocks & POI Layer PRD §23-25) — replaces the old
 * Scene-tab-embedded Unit Mapping panel (moved here per §23, not
 * duplicated). Four real sections: Asset (which slot is the Units layer +
 * its Building-anchor alignment), Mapping (the pre-existing Auto Match/
 * Manual Mapping UI, unchanged logic, new home), Appearance (the real
 * X-ray/opacity/status-color config this PRD's RenderEngine wiring
 * consumes), POI Camera (the master camera config), and a per-unit list
 * with the one real per-unit knob (poiYawDeg) plus a "Test Camera" button
 * that calls the exact same `focusUnit()` the public viewer uses — no
 * separate preview implementation, per §25.
 */
export function UnitsPanel({
  project,
  detail,
  modelEditor,
  configEditor,
  units,
  createUnit,
  canEdit,
  statusPreviewEnabled,
  onStatusPreviewChange,
  viewerRef,
}: {
  project: Project;
  detail: UseDetailModelSlotsReturn;
  modelEditor: UseModelEditorReturn;
  configEditor: UseProjectConfigEditorReturn;
  units: Unit[] | null;
  createUnit: (unit: Unit) => Promise<boolean>;
  canEdit: boolean;
  statusPreviewEnabled: boolean;
  onStatusPreviewChange: (v: boolean) => void;
  viewerRef: RefObject<ThreeProjectViewerHandle | null>;
}) {
  const activeVersion = detail.activeVersion;
  const activeSlot = detail.slots.find((s) => s.id === detail.activeSlotId) ?? null;
  const unitsSlots = detail.slots.filter((s) => s.role === "units");
  const buildingSlot = detail.slots.find((s) => s.role === "building") ?? null;
  const draft = configEditor.draft;

  const [autoDetect, setAutoDetect] = useState(true);
  const [manualMapping, setManualMapping] = useState(true);
  const [detectedNodes, setDetectedNodes] = useState<string[] | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [creatingUnits, setCreatingUnits] = useState(false);

  const [syncedGlbUrl, setSyncedGlbUrl] = useState(activeVersion?.publicAssetUrl ?? null);
  if ((activeVersion?.publicAssetUrl ?? null) !== syncedGlbUrl) {
    setSyncedGlbUrl(activeVersion?.publicAssetUrl ?? null);
    setDetectedNodes(null);
  }

  async function detect() {
    if (!activeVersion?.publicAssetUrl) return;
    setDetecting(true);
    try {
      const names = await extractUnitNodeNames(activeVersion.publicAssetUrl);
      setDetectedNodes(names);
      if (units) modelEditor.autoDetectLinks(names, units);
    } catch {
      setDetectedNodes(null);
    } finally {
      setDetecting(false);
    }
  }

  useEffect(() => {
    if (!autoDetect || activeSlot?.role !== "units") return;
    const timer = setTimeout(() => void detect(), 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVersion?.publicAssetUrl, autoDetect, activeSlot?.role]);

  // The step that kept getting missed (real support case, not
  // hypothetical): Auto Detect correctly finds `Unit_<code>` meshes, but
  // if no `Unit` row with a matching code exists yet, there's nothing to
  // auto-match against and every mesh just silently sits at "needs
  // review" forever — indistinguishable in the UI from a genuine naming
  // mismatch. This closes that gap directly: stub-creates a real `Unit`
  // (placeholder price/area — `code` taken from the mesh name so
  // `autoMatchUnitNodes` links it immediately after) for every detected
  // mesh that isn't linked yet, then re-runs the exact same auto-match
  // the mount-time effect above uses, using the freshly-created units
  // rather than waiting on this hook's own next poll.
  async function createUnitsFromDetectedMeshes() {
    if (!detectedNodes) return;
    const missing = detectedNodes.filter((n) => !modelEditor.linkFor(n));
    if (missing.length === 0) return;
    setCreatingUnits(true);
    try {
      const created: Unit[] = [];
      for (let i = 0; i < missing.length; i++) {
        const meshName = missing[i];
        const code = meshName.replace(/^unit_?/i, "") || meshName;
        const unit: Unit = {
          id: `${project.id}-unit-${code}-${Date.now()}-${i}`,
          code,
          type: "residential",
          buildingName: project.buildings[0] ?? "A",
          floor: 1,
          area: 60,
          bedrooms: 1,
          bathrooms: 1,
          price: 1,
          currency: "EUR",
          transaction: "sale",
          status: "available",
          images: [],
          floorPlanImage: "",
        };
        const ok = await createUnit(unit);
        if (ok) created.push(unit);
      }
      if (created.length > 0) {
        modelEditor.autoDetectLinks(detectedNodes, [...(units ?? []), ...created]);
      }
    } finally {
      setCreatingUnits(false);
    }
  }

  const needsReview = (detectedNodes ?? []).filter((n) => !modelEditor.linkFor(n)).length;
  const matched = (detectedNodes ?? []).length - needsReview;
  const mappedUnitIds = new Set(modelEditor.links.map((l) => l.unitId));

  return (
    <div className="space-y-4">
      <div>
        <SectionHeading>Asset</SectionHeading>
        <GroupCard>
          <ToggleRow
            label="Unit Blocks"
            checked={draft.unitBlocksEnabled}
            onChange={(v) => configEditor.update({ unitBlocksEnabled: v })}
          />
          {unitsSlots.length === 0 ? (
            // Real bug caught live (headed-browser verification): this was
            // wrongly gated on `canEdit`, which reflects whether the
            // CURRENTLY ACTIVE slot's version is a draft — creating a brand
            // NEW slot is an independent action unrelated to that (the
            // Scene tab's own "+Add slot" pill, SlotTabStrip.tsx, has no
            // such gate either). Left the disabled state gone entirely.
            <button
              onClick={() => void detail.handleAddSlot("Units", "units")}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-neutral-700 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
            >
              <Plus className="h-3.5 w-3.5" />
              Create Units slot
            </button>
          ) : (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {unitsSlots.map((slot) => (
                <button
                  key={slot.id}
                  onClick={() => detail.handleSelectSlot(slot.id)}
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    slot.id === detail.activeSlotId
                      ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                      : "border-neutral-700 text-neutral-400 hover:text-neutral-200"
                  )}
                >
                  {slot.name}
                </button>
              ))}
            </div>
          )}
        </GroupCard>
        {activeSlot?.role === "units" && (
          <p className="mt-1.5 px-0.5 text-[11px] text-neutral-500">
            {/* Reads the live draft (modelEditor.links), not the
                last-saved activeVersion.unitLinks — otherwise this line
                reads "0 blocks mapped" right after Auto Detect/Auto Match
                runs, disagreeing with the Mapping section just below it
                until the admin hits Save. Caught live: a fresh upload's
                auto-match landed correctly but this summary line still
                showed the stale pre-save count. */}
            {activeVersion ? `${modelEditor.links.length} block${modelEditor.links.length === 1 ? "" : "s"} mapped` : "No GLB uploaded yet — use the Scene tab to upload one."}
            {" · "}
            Building Anchor: {buildingSlot?.name ?? "none"}
            {" · Alignment: "}
            {activeSlot.transformParentSlotId ? (
              <span className="text-green-400">✓ Inherited from Building</span>
            ) : (
              <span className="text-amber-400">— Not linked (set on the Scene tab)</span>
            )}
          </p>
        )}
      </div>

      {activeSlot?.role === "units" && !activeVersion && (
        <p className="rounded-md border border-neutral-800 bg-neutral-900/60 p-2.5 text-[11px] text-neutral-500">
          Upload a GLB for this slot on the Scene tab, then come back here to map it.
        </p>
      )}

      {activeSlot?.role !== "units" && (
        <p className="rounded-md border border-neutral-800 bg-neutral-900/60 p-2.5 text-[11px] text-neutral-500">
          {unitsSlots.length > 0
            ? "Select a Units slot above to map/preview it — mapping/appearance below apply to whichever slot is currently active."
            : 'No dedicated Units slot yet. Unit_* boxes embedded directly in another slot’s GLB (the legacy pattern) still map/render correctly below.'}
        </p>
      )}

      {activeVersion && (
        <div>
          <SectionHeading>Mapping</SectionHeading>
          <GroupCard>
            <ToggleRow label="Auto Detect" checked={autoDetect} onChange={setAutoDetect} />
            <ToggleRow label="Manual Mapping" checked={manualMapping} onChange={setManualMapping} />
            <ToggleRow label="Status Preview" checked={statusPreviewEnabled} onChange={onStatusPreviewChange} />
          </GroupCard>

          {!autoDetect && (
            <button
              onClick={() => void detect()}
              disabled={detecting}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-800 disabled:opacity-50"
            >
              <ScanSearch className="h-3.5 w-3.5" />
              {detecting ? "Detecting…" : "Detect Nodes"}
            </button>
          )}

          {detectedNodes && (
            <p className="mt-1.5 text-[11px] text-neutral-500">
              {detectedNodes.length} Unit_ node{detectedNodes.length === 1 ? "" : "s"} found ·{" "}
              <span className={cn(needsReview > 0 ? "text-amber-400" : "text-green-400")}>
                {matched} mapped, {needsReview} need review
              </span>
            </p>
          )}

          {needsReview > 0 && canEdit && (
            <button
              onClick={() => void createUnitsFromDetectedMeshes()}
              disabled={creatingUnits}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-indigo-500/50 bg-indigo-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-indigo-300 hover:bg-indigo-500/20 disabled:opacity-50"
            >
              <Wand2 className="h-3.5 w-3.5" />
              {creatingUnits
                ? "Creating…"
                : `Create ${needsReview} unit${needsReview === 1 ? "" : "s"} from detected meshes`}
            </button>
          )}

          {detectedNodes && detectedNodes.length > 0 && (
            <div className="mt-1.5 max-h-56 space-y-1 overflow-y-auto">
              {detectedNodes.map((meshName) => {
                const linkedUnitId = modelEditor.linkFor(meshName);
                const linkedUnit = units?.find((u) => u.id === linkedUnitId) ?? null;
                return (
                  <div key={meshName} className="flex items-center justify-between gap-2 rounded-md border border-neutral-800 px-2 py-1.5 text-[11px]">
                    <span className="min-w-0 flex-1 truncate text-neutral-300">{meshName}</span>
                    {manualMapping ? (
                      <select
                        value={linkedUnitId ?? ""}
                        disabled={!canEdit}
                        onChange={(e) => modelEditor.setLink(meshName, e.target.value || null)}
                        className="max-w-[140px] rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-200 disabled:opacity-50"
                      >
                        <option value="">— unmapped —</option>
                        {(units ?? []).map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.code}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={cn("shrink-0 font-semibold", linkedUnit ? "text-green-400" : "text-amber-400")}>
                        {linkedUnit ? linkedUnit.code : "needs review"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div>
        <SectionHeading>Appearance</SectionHeading>
        <GroupCard>
          <ToggleRow label="Status Colors" checked={draft.unitBlocksStatusColorsEnabled} onChange={(v) => configEditor.update({ unitBlocksStatusColorsEnabled: v })} />
          <ToggleRow label="X-Ray" checked={draft.unitBlocksXrayEnabled} onChange={(v) => configEditor.update({ unitBlocksXrayEnabled: v })} />
          <SliderRow label="Default Opacity" value={draft.unitBlocksDefaultOpacity} min={0} max={1} step={0.01} onChange={(v) => configEditor.update({ unitBlocksDefaultOpacity: v })} />
          <SliderRow label="Hover Opacity" value={draft.unitBlocksHoverOpacity} min={0} max={1} step={0.01} onChange={(v) => configEditor.update({ unitBlocksHoverOpacity: v })} />
          <SliderRow label="Selected Opacity" value={draft.unitBlocksSelectedOpacity} min={0} max={1} step={0.01} onChange={(v) => configEditor.update({ unitBlocksSelectedOpacity: v })} />
          <ToggleRow label="Selected Outline" checked={draft.unitBlocksSelectedOutlineEnabled} onChange={(v) => configEditor.update({ unitBlocksSelectedOutlineEnabled: v })} />
        </GroupCard>
        <GroupCard>
          <ColorRow label="Available" value={draft.unitColorAvailable} onChange={(v) => configEditor.update({ unitColorAvailable: v })} />
          <ColorRow label="Reserved" value={draft.unitColorReserved} onChange={(v) => configEditor.update({ unitColorReserved: v })} />
          <ColorRow label="Sold" value={draft.unitColorSold} onChange={(v) => configEditor.update({ unitColorSold: v })} />
          <ColorRow label="Selected Outline" value={draft.unitColorSelected} onChange={(v) => configEditor.update({ unitColorSelected: v })} />
        </GroupCard>
      </div>

      <div>
        <SectionHeading>POI Camera</SectionHeading>
        <GroupCard>
          <ToggleRow label="Unit Camera" checked={draft.unitPoiCameraEnabled} onChange={(v) => configEditor.update({ unitPoiCameraEnabled: v })} />
          <SliderRow label="FOV" value={draft.unitPoiCameraFov} min={10} max={90} step={1} suffix="°" onChange={(v) => configEditor.update({ unitPoiCameraFov: v })} />
          <SliderRow label="Distance" value={draft.unitPoiCameraDistanceMultiplier} min={0.5} max={10} step={0.1} suffix="×" onChange={(v) => configEditor.update({ unitPoiCameraDistanceMultiplier: v })} />
          <SliderRow label="Height" value={draft.unitPoiCameraHeightOffset} min={-10} max={10} step={0.1} suffix="m" onChange={(v) => configEditor.update({ unitPoiCameraHeightOffset: v })} />
          <SliderRow label="Transition" value={draft.unitPoiTransitionMs} min={0} max={3000} step={50} suffix="ms" onChange={(v) => configEditor.update({ unitPoiTransitionMs: v })} />
        </GroupCard>
      </div>

      {units && units.length > 0 && (
        <div>
          <SectionHeading>Units ({units.length})</SectionHeading>
          <div className="space-y-1.5">
            {units.map((unit) => {
              const link = modelEditor.links.find((l) => l.unitId === unit.id);
              return (
                <GroupCard key={unit.id}>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-neutral-200">{unit.code}</span>
                    <span className={cn("text-[11px]", mappedUnitIds.has(unit.id) ? "text-green-400" : "text-neutral-500")}>
                      {mappedUnitIds.has(unit.id) ? "✓ mapped" : "unmapped"}
                    </span>
                  </div>
                  <p className="text-[10px] capitalize text-neutral-500">{unit.status}</p>
                  {link && (
                    <div className="mt-1.5 flex items-center justify-between gap-2">
                      <div className="flex gap-1">
                        {COMPASS_DIRECTIONS.map((d) => (
                          <button
                            key={d.label}
                            disabled={!canEdit}
                            onClick={() => modelEditor.updateLinkPoi(link.meshName, { poiYawDeg: d.deg })}
                            className={cn(
                              "h-5 w-5 rounded border text-[10px] font-semibold disabled:opacity-50",
                              (link.poiYawDeg ?? 0) === d.deg
                                ? "border-indigo-500 bg-indigo-500/10 text-indigo-300"
                                : "border-neutral-700 text-neutral-400 hover:text-neutral-200"
                            )}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => viewerRef.current?.focusUnit(unit.id)}
                        className="rounded-md border border-neutral-700 px-2 py-0.5 text-[10px] font-semibold text-neutral-300 hover:bg-neutral-800"
                      >
                        Test Camera
                      </button>
                    </div>
                  )}
                </GroupCard>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
