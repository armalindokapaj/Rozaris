"use client";

import { ColorRow, GroupCard, SectionHeading, SliderRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

export function FogSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const on = draft.fogEnabled;

  return (
    <div className="space-y-3">
      <SectionHeading>Fog</SectionHeading>
      <GroupCard>
        <ToggleRow label="Fog" checked={on} onChange={(v) => update({ fogEnabled: v })} />
        <ColorRow label="Color" value={draft.fogColor} disabled={!on || draft.fogMatchesSky} onChange={(v) => update({ fogColor: v })} />
        <ToggleRow label="Match Sky" checked={draft.fogMatchesSky} disabled={!on} onChange={(v) => update({ fogMatchesSky: v })} />
        <SliderRow label="Density" value={draft.fogDensity} min={0} max={0.1} step={0.001} disabled={!on} onChange={(v) => update({ fogDensity: v })} />
      </GroupCard>

      <SectionHeading>Ground Fog</SectionHeading>
      <GroupCard>
        <ToggleRow label="Ground Fog" checked={draft.groundFogEnabled} disabled={!on} onChange={(v) => update({ groundFogEnabled: v })} hint="A radial mist fade around world origin on the ground material — distinct from the height band and haze below" />
        <SliderRow label="Radius" value={draft.groundFogRadius} min={1} max={2000} step={5} suffix="m" disabled={!on || !draft.groundFogEnabled} onChange={(v) => update({ groundFogRadius: v })} />
      </GroupCard>

      <SectionHeading>Height &amp; Haze</SectionHeading>
      <GroupCard>
        <ToggleRow label="Height Band" checked={draft.fogHeightBandEnabled} disabled={!on} onChange={(v) => update({ fogHeightBandEnabled: v })} hint="A base→top height band on the atmospheric fog — distinct from Ground Fog's radial mist above" />
        <SliderRow label="Base Height" value={draft.fogBaseHeight} min={-50} max={500} step={1} suffix="m" disabled={!on} onChange={(v) => update({ fogBaseHeight: v })} />
        <SliderRow label="Top Height" value={draft.fogTopHeight} min={-50} max={500} step={1} suffix="m" disabled={!on} onChange={(v) => update({ fogTopHeight: v })} />
        <ToggleRow label="Distance Haze" checked={draft.fogHazeEnabled} disabled={!on} onChange={(v) => update({ fogHazeEnabled: v })} />
        <SliderRow label="Haze" value={draft.fogHaze} min={0} max={1} step={0.01} disabled={!on} onChange={(v) => update({ fogHaze: v })} />
        <SliderRow label="Falloff" value={draft.fogFalloff} min={0.1} max={6} step={0.1} disabled={!on} onChange={(v) => update({ fogFalloff: v })} />
        <SliderRow label="Maximum Opacity" value={draft.fogMaxOpacity} min={0} max={1} step={0.01} disabled={!on} onChange={(v) => update({ fogMaxOpacity: v })} />
      </GroupCard>

      <SectionHeading>Noise &amp; Wisps</SectionHeading>
      <GroupCard>
        <ToggleRow label="Noise / Wisps" checked={draft.fogNoiseEnabled} disabled={!on} onChange={(v) => update({ fogNoiseEnabled: v })} />
        <SliderRow label="Noise Strength" value={draft.fogNoiseStrength} min={0} max={1} step={0.01} disabled={!on || !draft.fogNoiseEnabled} onChange={(v) => update({ fogNoiseStrength: v })} />
        <SliderRow label="Noise Scale" value={draft.fogNoiseScale} min={0.001} max={0.5} step={0.001} disabled={!on || !draft.fogNoiseEnabled} onChange={(v) => update({ fogNoiseScale: v })} />
        <ToggleRow label="Fog Movement" checked={draft.fogMovementEnabled} disabled={!on || !draft.fogNoiseEnabled} onChange={(v) => update({ fogMovementEnabled: v })} hint="Pauses/resumes the real wind-noise scroll" />
        <SliderRow label="Wind Direction" value={draft.fogWindDirectionDeg} min={0} max={360} step={1} suffix="°" disabled={!on || !draft.fogMovementEnabled} onChange={(v) => update({ fogWindDirectionDeg: v })} />
        <SliderRow label="Wind Speed" value={draft.fogWindSpeed} min={0} max={0.5} step={0.005} disabled={!on || !draft.fogMovementEnabled} onChange={(v) => update({ fogWindSpeed: v })} />
      </GroupCard>

      <SectionHeading>Sun Interaction</SectionHeading>
      <GroupCard>
        <ToggleRow label="Sun Interaction" checked={draft.fogSunInteractionEnabled} disabled={!on} onChange={(v) => update({ fogSunInteractionEnabled: v })} hint="Tints fog toward the sun near its direction (a real, simplified warm-glow effect)" />
      </GroupCard>
    </div>
  );
}
