"use client";

import { Plus, Trash2 } from "lucide-react";
import { ColorRow, GroupCard, SectionHeading, SelectRow, SliderRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { SolarAnchor } from "@/lib/types";

/**
 * Environment → Sun & Sky (PRD §8-10) — the "ROZARIS Manual Time + Sun
 * System" / "ONE Global Sun". `solarControllerEnabled` off (default) keeps
 * every project's old direct elevation/azimuth sliders exactly as they
 * were; on, elevation/azimuth are DERIVED from Viewer Time + a Solar Path
 * instead (Manual anchors, edited below, or a real Geographic lat/lon/
 * date calculation — src/lib/sunPosition.ts). Sky's own turbidity/
 * rayleigh/mie/exposure knobs are unchanged from before this pass.
 */
export function SunSkySubtab({ configEditor }: { configEditor: UseProjectConfigEditorReturn }) {
  const { draft, update } = configEditor;

  function addAnchor() {
    const anchor: SolarAnchor = {
      id: `anchor-${Date.now()}`,
      timeHours: 12,
      elevationDeg: 45,
      azimuthDeg: 180,
    };
    update({ solarAnchors: [...draft.solarAnchors, anchor].sort((a, b) => a.timeHours - b.timeHours) });
  }
  function setAnchor(id: string, patch: Partial<SolarAnchor>) {
    update({ solarAnchors: draft.solarAnchors.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  }
  function removeAnchor(id: string) {
    update({ solarAnchors: draft.solarAnchors.filter((a) => a.id !== id) });
  }

  return (
    <div className="space-y-3">
      <SectionHeading>Solar Controller</SectionHeading>
      <GroupCard>
        <ToggleRow
          label="Solar Controller"
          checked={draft.solarControllerEnabled}
          onChange={(v) => update({ solarControllerEnabled: v })}
          hint="Off: direct Elevation/Azimuth below. On: derived from Viewer Time + a Solar Path."
        />
      </GroupCard>

      {!draft.solarControllerEnabled ? (
        <GroupCard>
          <SliderRow label="Elevation" value={draft.sunElevationDeg} min={-90} max={90} step={1} suffix="°" onChange={(v) => update({ sunElevationDeg: v })} />
          <SliderRow label="Azimuth" value={draft.sunAzimuthDeg} min={0} max={360} step={1} suffix="°" onChange={(v) => update({ sunAzimuthDeg: v })} />
        </GroupCard>
      ) : (
        <>
          <GroupCard>
            <SelectRow
              label="Solar Path"
              value={draft.solarPathMode}
              options={[
                { value: "manual", label: "Manual" },
                { value: "geographic", label: "Geographic" },
              ]}
              onChange={(v) => update({ solarPathMode: v })}
            />
            <ToggleRow label="Viewer Time Control" checked={draft.viewerTimeControlEnabled} onChange={(v) => update({ viewerTimeControlEnabled: v })} hint="Whether visitors get a live time slider (vs. a fixed Default Time)" />
            <SliderRow label="Viewer Time" value={draft.viewerTimeHours} min={0} max={24} step={0.25} suffix="h" onChange={(v) => update({ viewerTimeHours: v })} />
            <SliderRow label="Start Time" value={draft.viewerTimeStartHours} min={0} max={24} step={0.5} suffix="h" onChange={(v) => update({ viewerTimeStartHours: v })} />
            <SliderRow label="End Time" value={draft.viewerTimeEndHours} min={0} max={24} step={0.5} suffix="h" onChange={(v) => update({ viewerTimeEndHours: v })} />
            <SliderRow label="Time Step" value={draft.viewerTimeStepMinutes} min={1} max={120} step={1} suffix="min" onChange={(v) => update({ viewerTimeStepMinutes: v })} />
            <SliderRow label="North Offset" value={draft.northOffsetDeg} min={-180} max={180} step={1} suffix="°" onChange={(v) => update({ northOffsetDeg: v })} />
          </GroupCard>

          {draft.solarPathMode === "manual" ? (
            <>
              <SectionHeading>Solar Anchors</SectionHeading>
              <div className="space-y-1.5">
                {draft.solarAnchors.map((a) => (
                  <GroupCard key={a.id}>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-neutral-300">{a.timeHours.toFixed(1)}h</span>
                      <button onClick={() => removeAnchor(a.id)} className="rounded p-1 text-red-500 hover:bg-red-500/10" title="Remove anchor">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    <SliderRow label="Time" value={a.timeHours} min={0} max={24} step={0.25} suffix="h" onChange={(v) => setAnchor(a.id, { timeHours: v })} />
                    <SliderRow label="Elevation" value={a.elevationDeg} min={-90} max={90} step={1} suffix="°" onChange={(v) => setAnchor(a.id, { elevationDeg: v })} />
                    <SliderRow label="Azimuth" value={a.azimuthDeg} min={0} max={360} step={1} suffix="°" onChange={(v) => setAnchor(a.id, { azimuthDeg: v })} />
                  </GroupCard>
                ))}
                <button
                  onClick={addAnchor}
                  className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-neutral-700 py-1.5 text-[11px] font-semibold text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Solar Anchor
                </button>
                {draft.solarAnchors.length === 0 && (
                  <p className="px-1 text-[10px] text-neutral-600">No anchors yet — the sun holds a flat default (45°/180°) until at least one is added.</p>
                )}
              </div>
            </>
          ) : (
            <GroupCard>
              <SliderRow label="Latitude" value={draft.geoLatitude} min={-90} max={90} step={0.01} suffix="°" onChange={(v) => update({ geoLatitude: v })} />
              <SliderRow label="Longitude" value={draft.geoLongitude} min={-180} max={180} step={0.01} suffix="°" onChange={(v) => update({ geoLongitude: v })} />
              <label className="flex items-center justify-between py-1">
                <span className="text-[11px] text-neutral-300">Simulation Date</span>
                <input
                  type="date"
                  value={draft.simulationDate.slice(0, 10)}
                  onChange={(e) => update({ simulationDate: new Date(e.target.value).toISOString() })}
                  className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[11px] text-neutral-200"
                />
              </label>
            </GroupCard>
          )}
        </>
      )}

      <SectionHeading>Sun</SectionHeading>
      <GroupCard>
        <ToggleRow label="Sun Disc" checked={draft.sunDiscEnabled} onChange={(v) => update({ sunDiscEnabled: v })} />
        <ToggleRow label="Automatic Sun Intensity" checked={draft.autoSunIntensityEnabled} onChange={(v) => update({ autoSunIntensityEnabled: v })} />
        {!draft.autoSunIntensityEnabled && (
          <SliderRow label="Manual Intensity" value={draft.manualSunIntensity} min={0} max={5} step={0.05} onChange={(v) => update({ manualSunIntensity: v })} />
        )}
        <ToggleRow label="Automatic Sun Color" checked={draft.autoSunColorEnabled} onChange={(v) => update({ autoSunColorEnabled: v })} />
        {!draft.autoSunColorEnabled && <ColorRow label="Manual Color" value={draft.manualSunColorHex} onChange={(v) => update({ manualSunColorHex: v })} />}
        <ToggleRow label="Environment Refresh" checked={draft.environmentRefreshEnabled} onChange={(v) => update({ environmentRefreshEnabled: v })} hint="Off: the shaded sky/reflections freeze after the first load, a real perf lever" />
      </GroupCard>

      <SectionHeading>Sky</SectionHeading>
      <GroupCard>
        <ToggleRow label="Sky" checked={draft.skyEnabled} onChange={(v) => update({ skyEnabled: v })} />
        <SliderRow label="Turbidity" value={draft.skyTurbidity} min={0} max={20} step={0.1} disabled={!draft.skyEnabled} onChange={(v) => update({ skyTurbidity: v })} />
        <SliderRow label="Rayleigh" value={draft.skyRayleigh} min={0} max={4} step={0.05} disabled={!draft.skyEnabled} onChange={(v) => update({ skyRayleigh: v })} />
        <SliderRow label="Mie Coefficient" value={draft.skyMieCoefficient} min={0} max={0.1} step={0.001} disabled={!draft.skyEnabled} onChange={(v) => update({ skyMieCoefficient: v })} />
        <SliderRow label="Mie Directional G" value={draft.skyMieDirectionalG} min={0} max={1} step={0.01} disabled={!draft.skyEnabled} onChange={(v) => update({ skyMieDirectionalG: v })} />
        <SliderRow label="Environment Intensity" value={draft.environmentIntensity} min={0} max={4} step={0.05} onChange={(v) => update({ environmentIntensity: v })} />
      </GroupCard>
    </div>
  );
}
