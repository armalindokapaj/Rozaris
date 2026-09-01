"use client";

import { GroupCard, SectionHeading, SliderRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

export function VolumetricLightingSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const on = draft.volumetricLightingEnabled;

  return (
    <div className="space-y-3">
      <SectionHeading>Volumetric Lighting</SectionHeading>
      <GroupCard>
        <ToggleRow label="Volumetric Lighting" checked={on} onChange={(v) => update({ volumetricLightingEnabled: v })} />
        <ToggleRow label="Sun Shafts" checked={draft.sunShaftsEnabled} disabled={!on} onChange={(v) => update({ sunShaftsEnabled: v })} />
        <ToggleRow
          label="Artificial Light Volumes"
          checked={draft.lightVolumesEnabled}
          disabled={!on}
          onChange={(v) => update({ lightVolumesEnabled: v })}
          hint="Per-light — enable Volumetric on individual lights in the Artificial Lights tab"
        />
      </GroupCard>

      <SectionHeading>Controls</SectionHeading>
      <GroupCard>
        <SliderRow label="Density" value={draft.volumetricDensity} min={0} max={2} step={0.02} disabled={!on} onChange={(v) => update({ volumetricDensity: v })} />
        <SliderRow label="Maximum Density" value={draft.volumetricMaxDensity} min={0} max={2} step={0.02} disabled={!on} onChange={(v) => update({ volumetricMaxDensity: v })} />
        <SliderRow label="Distance Attenuation" value={draft.volumetricDistanceAtten} min={0} max={10} step={0.1} disabled={!on} onChange={(v) => update({ volumetricDistanceAtten: v })} />
        <SliderRow label="Raymarch Steps" value={draft.volumetricRaymarchSteps} min={8} max={120} step={1} disabled={!on} onChange={(v) => update({ volumetricRaymarchSteps: v })} />
      </GroupCard>
    </div>
  );
}
