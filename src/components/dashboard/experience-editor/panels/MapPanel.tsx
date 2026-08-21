"use client";

import { Trash2 } from "lucide-react";
import { GroupCard, SectionHeading, SliderRow, ToggleRow } from "../fields";
import type { UseProjectConfigEditorReturn } from "@/hooks/useProjectConfigEditor";
import type { UseDetailModelSlotsReturn } from "@/hooks/useDetailModelSlots";

/** Every field this tab owns, reset to Project3DConfig's own defaults (see
 * that model's doc comment / src/lib/store.ts) — the "Remove from Map"
 * action below writes exactly this in one shot, same parity the standalone
 * "3D Map Control" page's "Remove Model" has for its own (unrelated,
 * MapModelVersion-backed) object, scoped to just this project's Viewer map
 * — never the Search page's map, a different feature entirely. */
const MAP_VIEW_DEFAULTS = {
  mapViewEnabled: false,
  mapViewLatitude: null,
  mapViewLongitude: null,
  mapViewAltitude: 0,
  mapViewHeadingDeg: 0,
  mapViewScale: 1,
  mapViewZoom: 17.5,
  mapViewPitchDeg: 60,
  mapViewBearingDeg: -20,
} as const;

/** "Map" tab (see Project3DConfig's own doc comment in prisma/schema.prisma)
 * — places this project's "building"-role detailed model onto a real
 * Mapbox map, as an alternate view to Studio. The map itself renders in
 * `MapEditorViewport` (swapped in for the usual 3D viewport while this tab
 * is active, see ExperienceEditor.tsx); this panel is just its placement/
 * on-off controls, same `configEditor.draft`/`.update()` pattern every
 * other Environment/Lighting/Camera tab already uses — no separate save
 * path, no draft/publish workflow of its own (unlike the model upload
 * itself, which stays gated by the Scene tab's existing Detail Model
 * draft/publish flow). */
export function MapPanel({
  detail,
  configEditor,
}: {
  detail: UseDetailModelSlotsReturn;
  configEditor: UseProjectConfigEditorReturn;
}) {
  const { draft, update } = configEditor;
  const buildingSlot = detail.slots.find((s) => s.role === "building");
  const buildingVersion = buildingSlot ? (detail.versionsBySlot[buildingSlot.id]?.[0] ?? null) : null;
  const hasBuildingModel = !!buildingVersion;
  const disabled = !draft.mapViewEnabled;
  const usingDefaultLocation = draft.mapViewLatitude == null || draft.mapViewLongitude == null;

  return (
    <div className="space-y-3">
      <SectionHeading>Map View</SectionHeading>
      <GroupCard>
        <ToggleRow
          label="Show on Mapbox"
          checked={draft.mapViewEnabled}
          hint="Real-world Mapbox view of this project's own detail model, alongside the Studio view — visitors switch between the two on the public page."
          onChange={(v) => update({ mapViewEnabled: v })}
        />
        {!hasBuildingModel && (
          <p className="mt-1 text-[11px] text-amber-400">
            No &ldquo;building&rdquo; detail model uploaded yet (Scene tab) — the map has nothing to show until one exists.
          </p>
        )}
      </GroupCard>

      <SectionHeading>Placement</SectionHeading>
      <GroupCard>
        <p className="mb-1 text-[11px] text-neutral-500">
          {usingDefaultLocation ? "Using the project's default location — drag the marker on the map to move it." : "Custom location set."}
        </p>
        {!usingDefaultLocation && (
          <button
            onClick={() => update({ mapViewLatitude: null, mapViewLongitude: null })}
            disabled={disabled}
            className="mb-2 text-[11px] font-semibold text-red-400 hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            Reset to project location
          </button>
        )}
        <SliderRow
          label="Altitude"
          value={draft.mapViewAltitude}
          min={-50}
          max={200}
          step={0.5}
          suffix="m"
          disabled={disabled}
          onChange={(v) => update({ mapViewAltitude: v })}
        />
        <SliderRow
          label="Heading"
          value={draft.mapViewHeadingDeg}
          min={-180}
          max={180}
          step={1}
          suffix="°"
          disabled={disabled}
          onChange={(v) => update({ mapViewHeadingDeg: v })}
        />
        <SliderRow
          label="Scale"
          value={draft.mapViewScale}
          min={0.1}
          max={5}
          step={0.05}
          suffix="×"
          disabled={disabled}
          onChange={(v) => update({ mapViewScale: v })}
        />
      </GroupCard>

      <SectionHeading>Map Camera</SectionHeading>
      <GroupCard>
        <p className="mb-1 text-[11px] text-neutral-500">
          How the map itself is zoomed, tilted, and rotated when it opens — separate from the sliders above, which
          place the model on it. Free-navigate the preview and hit its &ldquo;Use current view&rdquo; button to
          snapshot these three instead of dialing them in by hand.
        </p>
        <SliderRow
          label="Zoom"
          value={draft.mapViewZoom}
          min={0}
          max={22}
          step={0.1}
          disabled={disabled}
          onChange={(v) => update({ mapViewZoom: v })}
        />
        <SliderRow
          label="Pitch"
          value={draft.mapViewPitchDeg}
          min={0}
          max={85}
          step={1}
          suffix="°"
          disabled={disabled}
          onChange={(v) => update({ mapViewPitchDeg: v })}
        />
        <SliderRow
          label="Bearing"
          value={draft.mapViewBearingDeg}
          min={-180}
          max={180}
          step={1}
          suffix="°"
          disabled={disabled}
          onChange={(v) => update({ mapViewBearingDeg: v })}
        />
      </GroupCard>

      <button
        onClick={() => update(MAP_VIEW_DEFAULTS)}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-red-900/40 bg-red-950/20 px-2.5 py-1.5 text-[11px] font-semibold text-red-400 hover:bg-red-950/40"
      >
        <Trash2 className="h-3.5 w-3.5" /> Remove from Map
      </button>
      <p className="px-1 text-[11px] text-neutral-600">
        Turns &ldquo;Show on Mapbox&rdquo; off and clears every field above back to its default — this project&apos;s
        own detail model (Scene tab) and its Studio view are untouched, and the platform-wide Search page map is a
        separate feature this never affects.
      </p>

      <p className="px-1 text-[11px] text-neutral-600">
        Lighting on the map follows this project&apos;s own Sun &amp; Sky settings (Environment/Lighting tabs) automatically.
      </p>
    </div>
  );
}
