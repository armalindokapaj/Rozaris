"use client";

import { ColorRow, GroupCard, SectionHeading, SliderRow, ToggleRow } from "../../fields";
import { kelvinToHex } from "@/lib/colorTemperature";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";

/**
 * Lighting → Sun Light (PRD §15) — a real master on/off for the ONE sun
 * light Environment → Sun & Sky's Solar system already positions/directs;
 * Automatic Color/Intensity + their manual fallbacks are the SAME real
 * Project3DConfig fields shown there (not a duplicate system — PRD's
 * "each feature exists once" rule). Temperature is a real Kelvin input
 * that recomputes `manualSunColorHex` on change (src/lib/
 * colorTemperature.ts) — a convenience alternate to the raw hex picker,
 * not a second stored color.
 */
export function SunLightSubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;

  return (
    <div className="space-y-3">
      <SectionHeading>Sun Light</SectionHeading>
      <GroupCard>
        <ToggleRow label="Sun Light" checked={draft.sunLightEnabled} onChange={(v) => update({ sunLightEnabled: v })} />
        <ToggleRow label="Automatic Intensity" checked={draft.autoSunIntensityEnabled} disabled={!draft.sunLightEnabled} onChange={(v) => update({ autoSunIntensityEnabled: v })} />
        {!draft.autoSunIntensityEnabled && (
          <SliderRow label="Intensity" value={draft.manualSunIntensity} min={0} max={5} step={0.05} disabled={!draft.sunLightEnabled} onChange={(v) => update({ manualSunIntensity: v })} />
        )}
        <ToggleRow label="Automatic Color" checked={draft.autoSunColorEnabled} disabled={!draft.sunLightEnabled} onChange={(v) => update({ autoSunColorEnabled: v })} />
        {!draft.autoSunColorEnabled && (
          <>
            <ColorRow label="Color" value={draft.manualSunColorHex} disabled={!draft.sunLightEnabled} onChange={(v) => update({ manualSunColorHex: v })} />
            <SliderRow
              label="Temperature"
              value={draft.sunTemperatureK}
              min={1000}
              max={12000}
              step={100}
              suffix="K"
              disabled={!draft.sunLightEnabled}
              onChange={(v) => update({ sunTemperatureK: v, manualSunColorHex: kelvinToHex(v) })}
            />
          </>
        )}
      </GroupCard>
    </div>
  );
}
