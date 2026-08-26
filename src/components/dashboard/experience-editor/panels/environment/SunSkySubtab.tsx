"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Plus, Trash2, Upload } from "lucide-react";
import { ColorRow, GroupCard, SectionHeading, SelectRow, SliderRow, ToggleRow } from "../../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { SolarAnchor } from "@/lib/types";

// Keep in sync with /api/blob/upload's own `panoramas/` size cap.
const MAX_BACKDROP_BYTES = 45 * 1024 * 1024;

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
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleBackdropFile(file: File) {
    if (file.type !== "image/png") {
      setUploadError("Must be a PNG (the transparent-sky technique needs a real alpha channel).");
      return;
    }
    if (file.size > MAX_BACKDROP_BYTES) {
      setUploadError(`Too large — ${Math.round(file.size / 1024 / 1024)}MB, max ${MAX_BACKDROP_BYTES / 1024 / 1024}MB.`);
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      const blob = await upload(`panoramas/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/blob/upload",
      });
      update({ backdropImageUrl: blob.url, backdropEnabled: true });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

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
            {/* Bounded against each other, not 0-24 independently: these two
                now drive the public viewer's scrub range directly, and an
                inverted window would leave visitors a dead slider. */}
            <SliderRow label="Start Time" value={draft.viewerTimeStartHours} min={0} max={draft.viewerTimeEndHours} step={0.5} suffix="h" onChange={(v) => update({ viewerTimeStartHours: v })} />
            <SliderRow label="End Time" value={draft.viewerTimeEndHours} min={draft.viewerTimeStartHours} max={24} step={0.5} suffix="h" onChange={(v) => update({ viewerTimeEndHours: v })} />
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

      <SectionHeading>360° Backdrop Photo</SectionHeading>
      <GroupCard>
        <p className="px-0.5 pb-1 text-[10px] leading-snug text-neutral-500">
          An equirectangular (2:1) 360° photo of the real site surroundings, exported as a PNG with the sky area made transparent — the
          physical Sky above keeps showing through the transparent pixels, so the real sun/time-of-day still drive the lighting.
        </p>
        {uploadError && <p className="rounded bg-red-500/10 px-2 py-1 text-[10px] font-medium text-red-400">{uploadError}</p>}
        {draft.backdropImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- admin-uploaded Blob URL, no next/image domain config to trust
          <img src={draft.backdropImageUrl} alt="" className="mb-1.5 h-20 w-full rounded-md border border-neutral-800 object-cover" />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleBackdropFile(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-neutral-700 py-1.5 text-[11px] font-semibold text-neutral-400 hover:border-neutral-500 hover:text-neutral-200 disabled:opacity-50"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "Uploading…" : draft.backdropImageUrl ? "Replace Photo" : "Upload Photo"}
        </button>
        {draft.backdropImageUrl && (
          <>
            <ToggleRow label="360° Backdrop" checked={draft.backdropEnabled} onChange={(v) => update({ backdropEnabled: v })} />
            <SliderRow
              label="Move Left / Right"
              value={draft.backdropRotationDeg}
              min={-180}
              max={180}
              step={1}
              suffix="°"
              disabled={!draft.backdropEnabled}
              onChange={(v) => update({ backdropRotationDeg: v })}
            />
            <SliderRow
              label="Tilt Up / Down"
              value={draft.backdropPitchDeg}
              min={-90}
              max={90}
              step={1}
              suffix="°"
              disabled={!draft.backdropEnabled}
              onChange={(v) => update({ backdropPitchDeg: v })}
            />
            <SliderRow
              label="Elevation"
              value={draft.backdropElevation}
              min={-500}
              max={500}
              step={1}
              disabled={!draft.backdropEnabled}
              onChange={(v) => update({ backdropElevation: v })}
            />
            <p className="px-0.5 text-[10px] leading-snug text-neutral-600">
              Tilt rotates the photo (fixes a level-but-wrong-angle horizon). Elevation raises/lowers it instead — use when the horizon is
              already level but the photo was shot from a different height than the model&apos;s own ground.
            </p>
            {(draft.backdropRotationDeg !== 0 || draft.backdropPitchDeg !== 0 || draft.backdropElevation !== 0) && (
              <button
                type="button"
                onClick={() => update({ backdropRotationDeg: 0, backdropPitchDeg: 0, backdropElevation: 0 })}
                className="w-full py-1 text-center text-[10px] font-semibold text-neutral-500 hover:text-neutral-300"
              >
                Reset position
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                update({ backdropImageUrl: null, backdropEnabled: false, backdropRotationDeg: 0, backdropPitchDeg: 0, backdropElevation: 0 })
              }
              className="mt-0.5 flex w-full items-center justify-center gap-1.5 rounded-md py-1 text-[10px] font-semibold text-red-500 hover:bg-red-500/10"
            >
              <Trash2 className="h-3 w-3" /> Remove Photo
            </button>
          </>
        )}
      </GroupCard>
    </div>
  );
}
