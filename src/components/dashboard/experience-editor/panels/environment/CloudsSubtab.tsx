"use client";

import { GroupCard, SectionHeading, SliderRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

/**
 * Environment → Clouds (PRD §11) — the ONE user-facing Clouds feature: a
 * real per-fragment raymarched cloud layer (src/lib/render-engine/
 * clouds.ts) on medium/high quality tiers, falling back to SkyMesh's own
 * cheap built-in cloud uniforms on Low/Mobile tiers (never both — PRD's
 * own "do not implement another public cloud system" rule) — the tier
 * check itself lives in RenderEngine.ts, invisible from this panel.
 */
export function CloudsSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;
  const on = draft.cloudsEnabled;

  return (
    <div className="space-y-3">
      <SectionHeading>Clouds</SectionHeading>
      <GroupCard>
        <ToggleRow label="Clouds" checked={on} onChange={(v) => update({ cloudsEnabled: v })} />
        <ToggleRow label="Cloud Movement" checked={draft.cloudMovementEnabled} disabled={!on} onChange={(v) => update({ cloudMovementEnabled: v })} />
        <ToggleRow label="Sun Lighting" checked={draft.cloudSunLightingEnabled} disabled={!on} onChange={(v) => update({ cloudSunLightingEnabled: v })} />
        <ToggleRow
          label="Cloud Shadows"
          checked={draft.cloudShadowsEnabled}
          disabled={!on}
          onChange={(v) => update({ cloudShadowsEnabled: v })}
          hint="Real, simplified — a soft coverage-driven darkening on the Ground mesh, not a per-pixel shadow map"
        />
      </GroupCard>

      <SectionHeading>Shape</SectionHeading>
      <GroupCard>
        <SliderRow label="Coverage" value={draft.cloudCoverage} min={0} max={1} step={0.01} disabled={!on} onChange={(v) => update({ cloudCoverage: v })} />
        <SliderRow label="Density" value={draft.cloudDensity} min={0} max={1} step={0.01} disabled={!on} onChange={(v) => update({ cloudDensity: v })} />
        <SliderRow label="Height" value={draft.cloudHeight} min={20} max={1500} step={5} suffix="m" disabled={!on} onChange={(v) => update({ cloudHeight: v })} />
        <SliderRow label="Thickness" value={draft.cloudThickness} min={5} max={400} step={5} suffix="m" disabled={!on} onChange={(v) => update({ cloudThickness: v })} />
        <SliderRow label="Threshold" value={draft.cloudThreshold} min={0} max={1} step={0.01} disabled={!on} onChange={(v) => update({ cloudThreshold: v })} />
        <SliderRow label="Opacity" value={draft.cloudOpacity} min={0} max={1} step={0.01} disabled={!on} onChange={(v) => update({ cloudOpacity: v })} />
        <SliderRow label="Softness" value={draft.cloudSoftness} min={0.01} max={1} step={0.01} disabled={!on} onChange={(v) => update({ cloudSoftness: v })} />
        <SliderRow label="Scale" value={draft.cloudScale} min={0.0005} max={0.05} step={0.0005} disabled={!on} onChange={(v) => update({ cloudScale: v })} />
      </GroupCard>

      <SectionHeading>Wind &amp; Quality</SectionHeading>
      <GroupCard>
        <SliderRow label="Wind Speed" value={draft.cloudWindSpeed} min={0} max={0.5} step={0.005} disabled={!on} onChange={(v) => update({ cloudWindSpeed: v })} />
        <SliderRow label="Wind Direction" value={draft.cloudWindDirectionDeg} min={0} max={360} step={1} suffix="°" disabled={!on} onChange={(v) => update({ cloudWindDirectionDeg: v })} />
        <SliderRow label="Raymarch Steps" value={draft.cloudRaymarchSteps} min={1} max={24} step={1} disabled={!on} onChange={(v) => update({ cloudRaymarchSteps: v })} />
        <SliderRow label="Elevation" value={draft.cloudElevation} min={0} max={1} step={0.01} disabled={!on} onChange={(v) => update({ cloudElevation: v })} />
      </GroupCard>
    </div>
  );
}
