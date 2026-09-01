"use client";

import { GroupCard, SectionHeading, SliderRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

export function GlobalIlluminationSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const on = draft.giEnabled;

  return (
    <div className="space-y-3">
      <SectionHeading>Global Illumination</SectionHeading>
      <GroupCard>
        <ToggleRow label="Global Illumination" checked={on} onChange={(v) => update({ giEnabled: v })} />
        <ToggleRow label="Indirect Lighting" checked={draft.giIndirectEnabled} disabled={!on} onChange={(v) => update({ giIndirectEnabled: v })} />
        <ToggleRow label="Ambient Occlusion" checked={draft.giAOEnabled} disabled={!on} onChange={(v) => update({ giAOEnabled: v })} />
        <ToggleRow label="Backface Lighting" checked={draft.giBackfaceLighting} disabled={!on} onChange={(v) => update({ giBackfaceLighting: v })} />
        <ToggleRow label="Temporal Filtering" checked={draft.giTemporalFiltering} disabled={!on} onChange={(v) => update({ giTemporalFiltering: v })} />
        <ToggleRow label="Screen-Space Sampling" checked={draft.giScreenSpaceSampling} disabled={!on} onChange={(v) => update({ giScreenSpaceSampling: v })} />
      </GroupCard>

      <SectionHeading>Main</SectionHeading>
      <GroupCard>
        <SliderRow label="GI Intensity" value={draft.giIntensity} min={0} max={50} step={0.5} disabled={!on} onChange={(v) => update({ giIntensity: v })} />
        <SliderRow label="AO Intensity" value={draft.giAOIntensity} min={0} max={4} step={0.05} disabled={!on} onChange={(v) => update({ giAOIntensity: v })} />
        <SliderRow label="Radius" value={draft.giRadius} min={0.5} max={50} step={0.5} disabled={!on} onChange={(v) => update({ giRadius: v })} />
      </GroupCard>

      <SectionHeading>Advanced</SectionHeading>
      <GroupCard>
        <SliderRow label="Slice Count" value={draft.giSliceCount} min={1} max={4} step={1} disabled={!on} onChange={(v) => update({ giSliceCount: v })} />
        <SliderRow label="Step Count" value={draft.giStepCount} min={1} max={32} step={1} disabled={!on} onChange={(v) => update({ giStepCount: v })} />
        <SliderRow label="Exp Factor" value={draft.giExpFactor} min={0.5} max={6} step={0.1} disabled={!on} onChange={(v) => update({ giExpFactor: v })} />
        <SliderRow label="Thickness" value={draft.giThickness} min={0.05} max={10} step={0.05} disabled={!on} onChange={(v) => update({ giThickness: v })} />
        <ToggleRow label="Linear Thickness" checked={draft.giLinearThickness} disabled={!on} onChange={(v) => update({ giLinearThickness: v })} />
      </GroupCard>
    </div>
  );
}
