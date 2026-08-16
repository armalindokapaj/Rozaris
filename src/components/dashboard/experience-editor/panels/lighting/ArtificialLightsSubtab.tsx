"use client";

import { useState } from "react";
import { upload } from "@vercel/blob/client";
import { Lightbulb, Plus, Trash2, UploadCloud } from "lucide-react";
import { cn } from "@/lib/utils";
import { ColorRow, GroupCard, SectionHeading, SliderRow, ToggleRow } from "../../fields";
import { kelvinToHex } from "@/lib/colorTemperature";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { ArtificialLight } from "@/lib/types";

const TYPE_LABEL: Record<ArtificialLight["type"], string> = {
  point: "Point",
  spot: "Spot",
  ies: "IES Spot",
  rect: "Rect Area",
};

function defaultLight(type: ArtificialLight["type"]): ArtificialLight {
  return {
    id: `light-${Date.now()}`,
    name: `${TYPE_LABEL[type]} ${Date.now() % 1000}`,
    type,
    enabled: true,
    shadowsEnabled: false,
    volumetricEnabled: false,
    helperEnabled: true,
    position: { x: 0, y: 5, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    colorHex: "#ffffff",
    temperatureK: null,
    intensity: 10,
    distance: 20,
    decay: 2,
    angleDeg: 45,
    penumbra: 0.3,
    width: 2,
    height: 2,
    iesProfileUrl: null,
  };
}

/**
 * Lighting → Artificial Lights (PRD §20, `webgpu_lights_ies_spotlight.html`
 * parity for the IES type) — real Point/Spot/IES-Spot/Rect-Area light
 * CRUD, rendered by RenderEngine's real ArtificialLightSystem
 * (render-engine/artificialLights.ts). IES profiles upload through the
 * same real Vercel Blob pipeline every other GLB upload in this editor
 * uses (`/api/blob/upload`).
 */
export function ArtificialLightsSubtab({ configEditor, projectId }: { configEditor: UseProjectConfigEditorReturn; projectId: string }) {
  const { draft, update } = configEditor;
  const lights = draft.artificialLights;
  const [selectedId, setSelectedId] = useState<string | null>(lights[0]?.id ?? null);
  const [uploading, setUploading] = useState(false);
  const selected = lights.find((l) => l.id === selectedId) ?? null;

  function addLight(type: ArtificialLight["type"]) {
    const light = defaultLight(type);
    update({ artificialLights: [...lights, light] });
    setSelectedId(light.id);
  }
  function setLight(id: string, patch: Partial<ArtificialLight>) {
    update({ artificialLights: lights.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  }
  function deleteLight(id: string) {
    update({ artificialLights: lights.filter((l) => l.id !== id) });
    if (selectedId === id) setSelectedId(null);
  }

  async function uploadIES(id: string, file: File) {
    setUploading(true);
    try {
      const blob = await upload(`artificial-lights/${projectId}-${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
        multipart: true,
      });
      setLight(id, { iesProfileUrl: blob.url });
    } catch (err) {
      console.error("Experience Editor: IES upload failed", err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3">
      <SectionHeading>Artificial Lights</SectionHeading>
      <div className="grid grid-cols-2 gap-1.5">
        {(["point", "spot", "ies", "rect"] as const).map((type) => (
          <button
            key={type}
            onClick={() => addLight(type)}
            className="flex items-center justify-center gap-1.5 rounded-md border border-dashed border-neutral-700 py-1.5 text-[11px] font-semibold text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
          >
            <Plus className="h-3 w-3" /> {TYPE_LABEL[type]}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        {lights.map((l) => (
          <button
            key={l.id}
            onClick={() => setSelectedId(l.id)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-[11px]",
              selectedId === l.id ? "border-indigo-500 bg-indigo-500/10" : "border-neutral-800 hover:bg-neutral-900"
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Lightbulb className={cn("h-3 w-3 shrink-0", l.enabled ? "text-amber-400" : "text-neutral-600")} />
              <span className="truncate text-neutral-200">{l.name}</span>
              <span className="shrink-0 rounded bg-neutral-800 px-1 py-0.5 text-[9px] text-neutral-500">{TYPE_LABEL[l.type]}</span>
            </span>
            <Trash2
              className="h-3 w-3 shrink-0 text-neutral-600 hover:text-red-500"
              onClick={(e) => {
                e.stopPropagation();
                deleteLight(l.id);
              }}
            />
          </button>
        ))}
        {lights.length === 0 && <p className="px-1 text-[10px] text-neutral-600">No artificial lights yet — add one above.</p>}
      </div>

      {selected && (
        <>
          <SectionHeading>{selected.name}</SectionHeading>
          <GroupCard>
            <ToggleRow label="Light" checked={selected.enabled} onChange={(v) => setLight(selected.id, { enabled: v })} />
            {(selected.type === "point" || selected.type === "spot" || selected.type === "ies") && (
              <ToggleRow label="Shadows" checked={selected.shadowsEnabled} onChange={(v) => setLight(selected.id, { shadowsEnabled: v })} />
            )}
            <ToggleRow label="Volumetric Contribution" checked={selected.volumetricEnabled} onChange={(v) => setLight(selected.id, { volumetricEnabled: v })} />
            <ToggleRow label="Helper" checked={selected.helperEnabled} onChange={(v) => setLight(selected.id, { helperEnabled: v })} />
          </GroupCard>

          <SectionHeading>Placement</SectionHeading>
          <GroupCard>
            <SliderRow label="Position X" value={selected.position.x} min={-200} max={200} step={0.5} onChange={(v) => setLight(selected.id, { position: { ...selected.position, x: v } })} />
            <SliderRow label="Position Y" value={selected.position.y} min={-50} max={200} step={0.5} onChange={(v) => setLight(selected.id, { position: { ...selected.position, y: v } })} />
            <SliderRow label="Position Z" value={selected.position.z} min={-200} max={200} step={0.5} onChange={(v) => setLight(selected.id, { position: { ...selected.position, z: v } })} />
            {(selected.type === "spot" || selected.type === "ies" || selected.type === "rect") && (
              <>
                <SliderRow label="Target X" value={selected.target.x} min={-200} max={200} step={0.5} onChange={(v) => setLight(selected.id, { target: { ...selected.target, x: v } })} />
                <SliderRow label="Target Y" value={selected.target.y} min={-50} max={200} step={0.5} onChange={(v) => setLight(selected.id, { target: { ...selected.target, y: v } })} />
                <SliderRow label="Target Z" value={selected.target.z} min={-200} max={200} step={0.5} onChange={(v) => setLight(selected.id, { target: { ...selected.target, z: v } })} />
              </>
            )}
          </GroupCard>

          <SectionHeading>Light</SectionHeading>
          <GroupCard>
            <ColorRow label="Color" value={selected.colorHex} onChange={(v) => setLight(selected.id, { colorHex: v, temperatureK: null })} />
            <SliderRow
              label="Temperature"
              value={selected.temperatureK ?? 5500}
              min={1000}
              max={12000}
              step={100}
              suffix="K"
              onChange={(v) => setLight(selected.id, { temperatureK: v, colorHex: kelvinToHex(v) })}
            />
            <SliderRow label="Intensity" value={selected.intensity} min={0} max={1000} step={1} onChange={(v) => setLight(selected.id, { intensity: v })} />
            {selected.type !== "rect" && (
              <>
                <SliderRow label="Distance" value={selected.distance} min={0} max={2000} step={1} suffix="m" onChange={(v) => setLight(selected.id, { distance: v })} />
                <SliderRow label="Decay" value={selected.decay} min={0} max={4} step={0.1} onChange={(v) => setLight(selected.id, { decay: v })} />
              </>
            )}
            {(selected.type === "spot" || selected.type === "ies") && (
              <>
                <SliderRow label="Angle" value={selected.angleDeg} min={0.1} max={89} step={1} suffix="°" onChange={(v) => setLight(selected.id, { angleDeg: v })} />
                <SliderRow label="Penumbra" value={selected.penumbra} min={0} max={1} step={0.01} onChange={(v) => setLight(selected.id, { penumbra: v })} />
              </>
            )}
            {selected.type === "rect" && (
              <>
                <SliderRow label="Width" value={selected.width} min={0.01} max={500} step={0.1} onChange={(v) => setLight(selected.id, { width: v })} />
                <SliderRow label="Height" value={selected.height} min={0.01} max={500} step={0.1} onChange={(v) => setLight(selected.id, { height: v })} />
              </>
            )}
          </GroupCard>

          {selected.type === "ies" && (
            <>
              <SectionHeading>IES Profile</SectionHeading>
              <GroupCard>
                <label className="flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-neutral-800 bg-neutral-900 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-300 hover:bg-neutral-800">
                  <UploadCloud className="h-3.5 w-3.5" /> {uploading ? "Uploading…" : selected.iesProfileUrl ? "Replace .ies profile" : "Upload .ies profile"}
                  <input
                    type="file"
                    accept=".ies"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadIES(selected.id, file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {selected.iesProfileUrl && <p className="mt-1 truncate px-1 text-[10px] text-neutral-600">{selected.iesProfileUrl}</p>}
              </GroupCard>
            </>
          )}
        </>
      )}
    </div>
  );
}
