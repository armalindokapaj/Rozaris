"use client";

import { Compass, Loader2, MapPin, TriangleAlert } from "lucide-react";
import { GroupCard, SectionHeading, SliderRow, ToggleRow } from "../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { Project } from "@/lib/types";

export type SiteStatus =
  | null
  | { state: "loading" }
  | { state: "failed" }
  | { state: "ready"; centreElevationM: number; reliefM: { min: number; max: number } };

const SITE_DEFAULTS = {
  siteEnabled: false,
  siteRadiusM: 600,
  siteTerrainEnabled: true,
  siteImageryEnabled: true,
  siteImageryBrightness: 0.85,
  siteOffsetX: 0,
  siteOffsetZ: 0,
  siteElevationOffset: 0,
  siteRotationDeg: 0,
  siteScale: 1,
} as const;

export function MapPanel({
  project,
  configEditor,
  siteStatus,
}: {
  project: Project;
  configEditor: UseProjectConfigEditorReturn;
  siteStatus: SiteStatus;
}) {
  const { draft, update } = configEditor;
  const disabled = !draft.siteEnabled;
  const hasLocation = project.coords?.lat != null && project.coords?.lng != null;

  return (
    <div className="space-y-3">
      <SectionHeading>Site Context</SectionHeading>
      <GroupCard>
        <ToggleRow
          label="Show real-world site"
          checked={draft.siteEnabled}
          hint="Builds the real terrain and aerial imagery around this project as scene geometry — lit by this project's own sun, fog and shadows. It appears directly in the Project Viewer; there is no separate map view."
          onChange={(v) => update({ siteEnabled: v })}
        />
        {!hasLocation && (
          <p className="mt-1 flex items-start gap-1.5 text-[11px] text-amber-400">
            <MapPin className="mt-px h-3 w-3 shrink-0" />
            This project has no location set. Set it in the Project Manager — the site is built from the project&apos;s
            own coordinates, never from a separate pin.
          </p>
        )}
        {draft.siteEnabled && hasLocation && <SiteStatusRow status={siteStatus} />}
        {draft.siteEnabled && (
          <p className="mt-1.5 text-[11px] text-neutral-500">
            The Ground platform (Environment → Ground) is hidden automatically while this is on — both sit at ground
            level and would otherwise flicker against each other.
          </p>
        )}
      </GroupCard>

      <SectionHeading>Extent &amp; Layers</SectionHeading>
      <GroupCard>
        <SliderRow
          label="Radius"
          value={draft.siteRadiusM}
          min={100}
          max={2000}
          step={25}
          suffix="m"
          editable
          disabled={disabled}
          onChange={(v) => update({ siteRadiusM: v })}
        />
        <p className="mb-2 text-[11px] text-neutral-600">
          How far the real world extends around the project. Larger sites automatically fetch sharper imagery
          rather than stretching one texture thinner, so a 2 km site downloads more and costs more GPU memory —
          600&ndash;800 m reads well for most projects.
        </p>
        <ToggleRow
          label="Terrain"
          checked={draft.siteTerrainEnabled}
          hint="Real elevation from Mapbox terrain data. Off renders the same extent perfectly flat — the right answer for a genuinely flat site, and it skips the elevation download entirely."
          disabled={disabled}
          onChange={(v) => update({ siteTerrainEnabled: v })}
        />
        <ToggleRow
          label="Aerial imagery"
          checked={draft.siteImageryEnabled}
          hint="Satellite photography as the ground surface."
          disabled={disabled}
          onChange={(v) => update({ siteImageryEnabled: v })}
        />
        <SliderRow
          label="Imagery brightness"
          value={draft.siteImageryBrightness}
          min={0}
          max={2}
          step={0.05}
          editable
          disabled={disabled || !draft.siteImageryEnabled}
          onChange={(v) => update({ siteImageryBrightness: v })}
        />
        <p className="text-[11px] text-neutral-600">
          Aerial photos already have the sun of the day they were shot baked into them, which fights this project&apos;s
          own movable sun. Pulling this down is the honest fix — it will never match perfectly at every time of day.
        </p>
      </GroupCard>

      <SectionHeading>Alignment</SectionHeading>
      <GroupCard>
        <p className="mb-2 text-[11px] text-neutral-500">
          The <span className="text-neutral-300">site</span> moves — the building never does. Line the real world up
          with your model; every uploaded GLB stays exactly where it was authored.
        </p>
        <SliderRow
          label="Rotate"
          value={draft.siteRotationDeg}
          min={-180}
          max={180}
          step={0.5}
          suffix="°"
          editable
          disabled={disabled}
          onChange={(v) => update({ siteRotationDeg: v })}
        />
        <p className="mb-2 flex items-start gap-1.5 text-[11px] text-sky-400/90">
          <Compass className="mt-px h-3 w-3 shrink-0" />
          Rotating the site tells the engine where north really is, so the sun rotates with it. Shadows stay correct
          for the real location as you align.
        </p>
        <SliderRow
          label="Move east/west"
          value={draft.siteOffsetX}
          min={-300}
          max={300}
          step={0.5}
          suffix="m"
          editable
          disabled={disabled}
          onChange={(v) => update({ siteOffsetX: v })}
        />
        <SliderRow
          label="Move north/south"
          value={draft.siteOffsetZ}
          min={-300}
          max={300}
          step={0.5}
          suffix="m"
          editable
          disabled={disabled}
          onChange={(v) => update({ siteOffsetZ: v })}
        />
        <SliderRow
          label="Height"
          value={draft.siteElevationOffset}
          min={-100}
          max={100}
          step={0.25}
          suffix="m"
          editable
          disabled={disabled}
          onChange={(v) => update({ siteElevationOffset: v })}
        />
        <SliderRow
          label="Scale"
          value={draft.siteScale}
          min={0.5}
          max={2}
          step={0.01}
          suffix="×"
          editable
          disabled={disabled}
          onChange={(v) => update({ siteScale: v })}
        />
        <p className="text-[11px] text-neutral-600">
          Scale should stay at 1× — both the site and your models are in real metres. It exists only for a model that
          was authored at the wrong scale and cannot be re-exported.
        </p>
      </GroupCard>

      <SectionHeading>Sun &amp; North</SectionHeading>
      <GroupCard>
        <p className="mb-2 text-[11px] text-neutral-500">
          North offset is currently{" "}
          <span className="text-neutral-300">
            {(((draft.northOffsetDeg + draft.siteRotationDeg) % 360) + 360) % 360}°
          </span>{" "}
          — your Sun &amp; Sky north ({draft.northOffsetDeg}°) plus this site&apos;s rotation ({draft.siteRotationDeg}
          °). They are the same quantity and simply add.
        </p>
        <button
          onClick={() => update({ northOffsetDeg: normalizeDeg(draft.northOffsetDeg + 180) })}
          disabled={disabled}
          className="w-full rounded-md border border-neutral-700 bg-neutral-800/60 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-200 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Flip sun 180°
        </button>
        <p className="mt-1.5 text-[11px] text-neutral-600">
          The site is laid out with true north away from the camera&apos;s default forward, which is half a turn from
          the engine&apos;s own sun-azimuth reference. If shadows fall on the wrong side of the building at midday,
          this is the fix. It is not applied automatically because it would move the sun on every existing project.
        </p>
      </GroupCard>

      <button
        onClick={() => update(SITE_DEFAULTS)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-900/40 bg-red-950/20 px-2.5 py-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-950/40"
      >
        Reset site
      </button>
      <p className="px-1 text-[11px] text-neutral-600">
        Turns the site off and clears every field above. Your uploaded models, the Studio view and the platform-wide
        Search page map are all untouched.
      </p>
    </div>
  );
}

function normalizeDeg(deg: number): number {
  return (((deg % 360) + 360) % 360);
}

function SiteStatusRow({ status }: { status: SiteStatus }) {
  if (!status) return null;
  if (status.state === "loading") {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-neutral-400">
        <Loader2 className="h-3 w-3 animate-spin" /> Building site from Mapbox terrain and imagery…
      </p>
    );
  }
  if (status.state === "failed") {
    return (
      <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-red-400">
        <TriangleAlert className="mt-px h-3 w-3 shrink-0" />
        Could not build the site. Check the Mapbox token and this project&apos;s coordinates.
      </p>
    );
  }
  const relief = status.reliefM.max - status.reliefM.min;
  return (
    <p className="mt-1.5 text-[11px] text-emerald-400/90">
      Site ready — ground sits {Math.round(status.centreElevationM)} m above sea level, with {relief.toFixed(1)} m of
      relief across it. The building&apos;s own ground plane stays at zero.
    </p>
  );
}
