"use client";

import { Sun } from "lucide-react";
import type { Project3DConfig } from "@/lib/types";
import type { SetOpts, Translate } from "./editorTypes";

function formatUTCHour(h: number): string {
  const hour = Math.floor(h) % 24;
  const minutes = Math.round((h - Math.floor(h)) * 60);
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * Live Sun & Time scrubber, overlaid on the 3D viewport itself — Sun & Time
 * restructure (2026-08-13). Only mounted while the Lighting tab is active
 * (see EditorShell.tsx), as a sibling of `<ThreeProjectViewer>` inside its
 * existing `relative` wrapper — no new prop on the viewer, `showChrome`
 * chrome, or `ProceduralProjectViewer.tsx` needed, matching the existing
 * absolutely-positioned overlay convention that component already uses for
 * its own (buyer-facing) chrome.
 *
 * Both controls below write the exact same `Project3DConfig` fields
 * `LightingPanel.tsx`'s "Sun & Time" sub-tab already reads/writes
 * (`defaultTimeOfDay`, `simulationDate`) via the same `update()` — this is
 * a second view onto one shared piece of state, not a duplicate. Follows
 * the same `SetOpts` convention every other panel does: the time slider
 * passes no `commit` (continuous drag, coalesced into one undo step after
 * it settles), the date input passes `{ commit: true }` (discrete).
 */
export function SunTimeOverlay({
  draft,
  update,
  sunTimes,
  t,
}: {
  draft: Project3DConfig;
  update: (partial: Partial<Project3DConfig>, opts?: SetOpts) => void;
  sunTimes: { sunriseHourUTC: number; sunsetHourUTC: number } | null;
  t: Translate;
}) {
  return (
    <div className="glass-panel-dark pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex flex-wrap items-center gap-3 rounded-pill px-4 py-2.5 text-white sm:inset-x-4">
      <Sun className="h-4 w-4 shrink-0 text-amber-300" />

      <div className="flex min-w-0 flex-1 items-center gap-2">
        {sunTimes && (
          <span className="hidden shrink-0 text-[11px] text-white/60 sm:inline">
            {formatUTCHour(sunTimes.sunriseHourUTC)}
          </span>
        )}
        <input
          type="range"
          min={0}
          max={24}
          step={0.5}
          value={draft.defaultTimeOfDay}
          onChange={(e) => update({ defaultTimeOfDay: Number(e.target.value) })}
          aria-label={t("admin.sceneDefaultTime")}
          className="w-full min-w-[80px] accent-amber-300"
        />
        {sunTimes && (
          <span className="hidden shrink-0 text-[11px] text-white/60 sm:inline">
            {formatUTCHour(sunTimes.sunsetHourUTC)}
          </span>
        )}
        <span className="shrink-0 font-mono text-xs font-semibold tabular-nums">
          {formatUTCHour(draft.defaultTimeOfDay)}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <input
          type="date"
          value={draft.simulationDate ?? ""}
          onChange={(e) => update({ simulationDate: e.target.value || null }, { commit: true })}
          aria-label={t("admin.sunSimulationDate")}
          className="rounded-control border border-white/20 bg-white/10 px-1.5 py-1 text-[11px] text-white [color-scheme:dark] focus:border-white/40 focus:outline-none"
        />
        {draft.simulationDate !== null && (
          <button
            type="button"
            onClick={() => update({ simulationDate: null }, { commit: true })}
            className="rounded-pill bg-white/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/70 hover:bg-white/20 hover:text-white"
          >
            {t("admin.sunSimulationDateReset")}
          </button>
        )}
      </div>
    </div>
  );
}
