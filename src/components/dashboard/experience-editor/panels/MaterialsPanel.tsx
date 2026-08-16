"use client";

import { useMemo, useState } from "react";
import { RotateCcw, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColorRow, GroupCard, SectionHeading, SliderRow, ToggleRow } from "../fields";
import type { UseModelEditorReturn } from "@/hooks/useModelEditor";
import type { DetailVersionRow } from "@/hooks/useDetailModelSlots";

const DEFAULT_COLOR = "#cccccc";

/**
 * Materials tab (PRD §6) — non-destructive per-node overrides. Original
 * GLB material is never modified (see RenderEngine.ts's applyNodeOverrides
 * doc comment — every reapplication clones fresh from a cached original).
 * No 3D-viewport click-to-select exists yet (Interaction phase), so nodes
 * are picked from the real sceneManifest list computed server-side at
 * upload time — a real substitute, not a placeholder, just a different
 * interaction than clicking in the viewport.
 */
export function MaterialsPanel({ activeVersion, modelEditor, canEdit }: { activeVersion: DetailVersionRow | null; modelEditor: UseModelEditorReturn; canEdit: boolean }) {
  const [search, setSearch] = useState("");
  const [selectedRzNodeId, setSelectedRzNodeId] = useState<string | null>(null);

  const meshNodes = useMemo(() => {
    const manifest = (activeVersion?.sceneManifest ?? []) as { rzNodeId: string; name: string; isMesh: boolean }[];
    return manifest.filter((n) => n.isMesh);
  }, [activeVersion]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? meshNodes.filter((n) => n.name.toLowerCase().includes(q)) : meshNodes;
  }, [meshNodes, search]);

  const selected = selectedRzNodeId ? meshNodes.find((n) => n.rzNodeId === selectedRzNodeId) ?? null : null;
  const override = selected ? modelEditor.overrideFor(selected.rzNodeId) : null;
  const overriddenIds = new Set(modelEditor.overrides.map((o) => o.rzNodeId));

  if (!activeVersion) {
    return <p className="p-3 text-xs text-neutral-500">Upload a model on the Scene tab first.</p>;
  }
  if (meshNodes.length === 0) {
    return <p className="p-3 text-xs text-neutral-500">No mesh nodes found in this GLB&apos;s scene manifest.</p>;
  }

  function set(patch: Parameters<UseModelEditorReturn["updateOverride"]>[1]) {
    if (selected) modelEditor.updateOverride(selected.rzNodeId, patch);
  }

  return (
    <div className="space-y-3">
      <SectionHeading>Nodes</SectionHeading>
      <div className="flex items-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-neutral-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search nodes..."
          className="w-full bg-transparent text-xs text-neutral-200 placeholder:text-neutral-600 focus:outline-none"
        />
      </div>
      <div className="max-h-40 overflow-y-auto rounded-md border border-neutral-800">
        {filtered.map((n) => (
          <button
            key={n.rzNodeId}
            onClick={() => setSelectedRzNodeId(n.rzNodeId)}
            className={cn(
              "flex w-full items-center gap-1.5 border-b border-neutral-900 px-2 py-1.5 text-left text-[11px] last:border-b-0",
              selectedRzNodeId === n.rzNodeId ? "bg-indigo-500/15 text-white" : "text-neutral-400 hover:bg-neutral-900"
            )}
          >
            <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", overriddenIds.has(n.rzNodeId) ? "bg-indigo-400" : "bg-transparent")} />
            <span className="truncate">{n.name}</span>
          </button>
        ))}
      </div>

      {!selected ? (
        <p className="p-3 text-center text-xs text-neutral-600">Select a node above to edit its material.</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="truncate text-xs font-semibold text-neutral-300">{selected.name}</p>
            <button
              onClick={() => modelEditor.restoreOriginal(selected.rzNodeId)}
              disabled={!canEdit || !override}
              className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-neutral-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3 w-3" /> Restore Original
            </button>
          </div>

          <GroupCard>
            <ToggleRow
              label="Material Override"
              checked={override?.materialOverrideEnabled !== false}
              disabled={!canEdit}
              onChange={(v) => set({ materialOverrideEnabled: v })}
            />
          </GroupCard>

          <fieldset disabled={!canEdit || override?.materialOverrideEnabled === false} className="space-y-3 disabled:opacity-40">
            <SectionHeading>PBR</SectionHeading>
            <GroupCard>
              <ColorRow label="Base Color" value={override?.colorHex ?? DEFAULT_COLOR} onChange={(v) => set({ colorHex: v })} />
              <ToggleRow label="Base Texture" checked={override?.baseTextureEnabled !== false} onChange={(v) => set({ baseTextureEnabled: v })} />
              <SliderRow label="Roughness" value={override?.roughness ?? 0.5} min={0} max={1} step={0.01} onChange={(v) => set({ roughness: v })} />
              <ToggleRow label="Roughness Map" checked={override?.roughnessMapEnabled !== false} onChange={(v) => set({ roughnessMapEnabled: v })} />
              <SliderRow label="Metalness" value={override?.metalness ?? 0} min={0} max={1} step={0.01} onChange={(v) => set({ metalness: v })} />
              <ToggleRow label="Metalness Map" checked={override?.metalnessMapEnabled !== false} onChange={(v) => set({ metalnessMapEnabled: v })} />
              <ToggleRow label="Normal Map" checked={override?.normalMapEnabled !== false} onChange={(v) => set({ normalMapEnabled: v })} />
              <SliderRow label="Normal Strength" value={override?.normalStrength ?? 1} min={0} max={4} step={0.05} onChange={(v) => set({ normalStrength: v })} />
              <ToggleRow label="AO Map" checked={override?.aoMapEnabled !== false} onChange={(v) => set({ aoMapEnabled: v })} />
              <SliderRow label="Opacity" value={override?.opacity ?? 1} min={0} max={1} step={0.01} onChange={(v) => set({ opacity: v })} />
            </GroupCard>

            <SectionHeading>Emissive</SectionHeading>
            <GroupCard>
              <ToggleRow label="Emissive" checked={!!override?.emissiveEnabled} onChange={(v) => set({ emissiveEnabled: v })} />
              <ToggleRow label="Emissive Map" checked={override?.emissiveMapEnabled !== false} disabled={!override?.emissiveEnabled} onChange={(v) => set({ emissiveMapEnabled: v })} />
              <ColorRow label="Color" value={override?.emissiveColorHex ?? "#ffffff"} disabled={!override?.emissiveEnabled} onChange={(v) => set({ emissiveColorHex: v })} />
              <SliderRow label="Intensity" value={override?.emissiveIntensity ?? 1} min={0} max={20} step={0.1} disabled={!override?.emissiveEnabled} onChange={(v) => set({ emissiveIntensity: v })} />
            </GroupCard>

            <SectionHeading>Glass</SectionHeading>
            <GroupCard>
              <ToggleRow label="Transmission" checked={!!override?.transmissionEnabled} onChange={(v) => set({ transmissionEnabled: v })} />
              <SliderRow label="Transmission" value={override?.transmission ?? 1} min={0} max={1} step={0.01} disabled={!override?.transmissionEnabled} onChange={(v) => set({ transmission: v })} />
              <SliderRow label="IOR" value={override?.ior ?? 1.5} min={1} max={2.333} step={0.01} disabled={!override?.transmissionEnabled} onChange={(v) => set({ ior: v })} />
              <SliderRow label="Thickness" value={override?.thickness ?? 1} min={0} max={100} step={0.5} disabled={!override?.transmissionEnabled} onChange={(v) => set({ thickness: v })} />
              <ToggleRow label="Attenuation" checked={!!override?.attenuationEnabled} disabled={!override?.transmissionEnabled} onChange={(v) => set({ attenuationEnabled: v })} />
              <ColorRow label="Attenuation Color" value={override?.attenuationColorHex ?? "#ffffff"} disabled={!override?.attenuationEnabled} onChange={(v) => set({ attenuationColorHex: v })} />
              <SliderRow label="Attenuation Distance" value={override?.attenuationDistance ?? 1} min={0} max={50} step={0.5} disabled={!override?.attenuationEnabled} onChange={(v) => set({ attenuationDistance: v })} />
            </GroupCard>

            <SectionHeading>Physical</SectionHeading>
            <GroupCard>
              <SliderRow label="Clearcoat" value={override?.clearcoat ?? 0} min={0} max={1} step={0.01} onChange={(v) => set({ clearcoat: v })} />
              <SliderRow label="Clearcoat Roughness" value={override?.clearcoatRoughness ?? 0} min={0} max={1} step={0.01} onChange={(v) => set({ clearcoatRoughness: v })} />
              <SliderRow label="Anisotropy" value={override?.anisotropy ?? 0} min={0} max={1} step={0.01} onChange={(v) => set({ anisotropy: v })} />
              <SliderRow label="Anisotropy Rotation" value={override?.anisotropyRotation ?? 0} min={0} max={360} step={1} suffix="°" onChange={(v) => set({ anisotropyRotation: v })} />
              <SliderRow label="Sheen" value={override?.sheen ?? 0} min={0} max={1} step={0.01} onChange={(v) => set({ sheen: v })} />
              <ColorRow label="Sheen Color" value={override?.sheenColorHex ?? "#ffffff"} onChange={(v) => set({ sheenColorHex: v })} />
              <SliderRow label="Sheen Roughness" value={override?.sheenRoughness ?? 0} min={0} max={1} step={0.01} onChange={(v) => set({ sheenRoughness: v })} />
              <SliderRow label="Iridescence" value={override?.iridescence ?? 0} min={0} max={1} step={0.01} onChange={(v) => set({ iridescence: v })} />
              <SliderRow label="Iridescence IOR" value={override?.iridescenceIOR ?? 1.3} min={1} max={2.333} step={0.01} onChange={(v) => set({ iridescenceIOR: v })} />
              <SliderRow label="Dispersion" value={override?.dispersion ?? 0} min={0} max={1} step={0.01} onChange={(v) => set({ dispersion: v })} />
            </GroupCard>

            <SectionHeading>Texture Transform</SectionHeading>
            <GroupCard>
              <ToggleRow label="Texture Transform" checked={!!override?.textureTransformEnabled} onChange={(v) => set({ textureTransformEnabled: v })} />
              <fieldset disabled={!override?.textureTransformEnabled} className="space-y-0.5 disabled:opacity-40">
                <SliderRow label="Scale X" value={override?.mapScaleX ?? 1} min={0.1} max={10} step={0.1} onChange={(v) => set({ mapScaleX: v })} />
                <SliderRow label="Scale Y" value={override?.mapScaleY ?? 1} min={0.1} max={10} step={0.1} onChange={(v) => set({ mapScaleY: v })} />
                <SliderRow label="Offset X" value={override?.mapOffsetX ?? 0} min={-1} max={1} step={0.01} onChange={(v) => set({ mapOffsetX: v })} />
                <SliderRow label="Offset Y" value={override?.mapOffsetY ?? 0} min={-1} max={1} step={0.01} onChange={(v) => set({ mapOffsetY: v })} />
                <SliderRow label="Rotation" value={override?.mapRotation ?? 0} min={0} max={360} step={1} suffix="°" onChange={(v) => set({ mapRotation: v })} />
              </fieldset>
            </GroupCard>
          </fieldset>
        </div>
      )}
    </div>
  );
}
