"use client";

import { forwardRef, type Dispatch, type SetStateAction } from "react";
import type { SunTimePreset } from "@/lib/sunPosition";
import type { CameraPreset, Unit } from "@/lib/types";
import type { UnitFilterState } from "../../units-workspace/unitFilters";
import type { ActiveModule } from "../types";
import { NavigationContent } from "./NavigationContent";
import { TimeContent } from "./TimeContent";
import { UnitsContent } from "./UnitsContent";
import { ViewsContent } from "./ViewsContent";

type NavId = Exclude<ActiveModule, "none">;
export type DockMode = "nav" | "sunTime" | "units" | "views";

/** Morphing Bottom Dock Phase 2 (2026-08-18) — the dock now owns more than
 * one secondary popover (Time's presets, Units' Surface/Rooms — Bedrooms
 * and Bathrooms share one popover, see `UnitsContent.tsx`'s own doc
 * comment for why), so the single `popoverOpen` boolean Phase 1 threaded through
 * here became a shared *identity*: at most one of these is ever open at
 * once (opening a second closes whichever was already open — see
 * `ProjectViewerDock.tsx`'s own `handleTogglePopover`), which is what a
 * plain `DockPopoverId | null` expresses directly. `TimeContent` itself is
 * unchanged from Phase 1 — it still only knows its own boolean `popoverOpen`
 * prop, so this component translates for it (`openPopover === "timePresets"`)
 * rather than churning a file that already works. `UnitsContent` is new
 * this phase and just takes the shared id/toggle/close directly — no
 * translation layer needed since it has 3 popovers of its own, not 1. */
export type DockPopoverId = "timePresets" | "unitsSurface" | "unitsRooms";

/**
 * Morphing Bottom Dock — switches on `mode` to render `NavigationContent`,
 * `TimeContent`, `UnitsContent`, or `ViewsContent`, forwarding `ref`
 * straight to whichever one is mounted's own root div (no extra wrapper
 * div of this component's own — `ProjectViewerDock`'s content-reveal
 * animation needs `ref.current.children` to be the real content pieces,
 * not a single wrapper with one child). The actual GSAP timeline driving
 * that reveal lives in `ProjectViewerDock` (not here) — centralizing one
 * animation's timing in the orchestrator rather than splitting it across
 * files was a deliberate simplification made while implementing the
 * approved plan; this component stays a thin, easy-to-reason-about
 * presentational switch.
 */
export const DockContent = forwardRef<
  HTMLDivElement,
  {
    mode: DockMode;
    activeModule: ActiveModule;
    onSelectNav: (id: NavId) => void;
    isDesktop: boolean;
    // Sun & Time
    interactive: boolean;
    timeHours: number;
    bounds: { startHours: number; endHours: number; stepMinutes: number };
    presets: SunTimePreset[];
    activePresetId: SunTimePreset["id"] | null;
    canReset: boolean;
    onTimeChange: (hours: number) => void;
    onPresetSelect: (preset: SunTimePreset) => void;
    onReset: () => void;
    // Units
    units: Unit[];
    unitFilters: UnitFilterState;
    onUnitFiltersChange: Dispatch<SetStateAction<UnitFilterState>>;
    unitsListOpen: boolean;
    onToggleUnitsList: () => void;
    /** Mobile-only collapse state for Units' filter stack — see
     * `UnitsContent.tsx`'s own `filtersToggleMobile` doc comment. */
    unitFiltersExpanded: boolean;
    onToggleUnitFilters: () => void;
    // Views
    cameraPresets: CameraPreset[];
    activeViewPresetId: string | null;
    onSelectViewPreset: (preset: CameraPreset) => void;
    // Shared
    onBack: () => void;
    onClose: () => void;
    openPopover: DockPopoverId | null;
    onTogglePopover: (id: DockPopoverId) => void;
    onClosePopover: () => void;
  }
>(function DockContent(
  {
    mode,
    activeModule,
    onSelectNav,
    isDesktop,
    interactive,
    timeHours,
    bounds,
    presets,
    activePresetId,
    canReset,
    onTimeChange,
    onPresetSelect,
    onReset,
    units,
    unitFilters,
    onUnitFiltersChange,
    unitsListOpen,
    onToggleUnitsList,
    unitFiltersExpanded,
    onToggleUnitFilters,
    cameraPresets,
    activeViewPresetId,
    onSelectViewPreset,
    onBack,
    onClose,
    openPopover,
    onTogglePopover,
    onClosePopover,
  },
  ref
) {
  if (mode === "sunTime") {
    return (
      <TimeContent
        ref={ref}
        isDesktop={isDesktop}
        interactive={interactive}
        timeHours={timeHours}
        bounds={bounds}
        presets={presets}
        activePresetId={activePresetId}
        canReset={canReset}
        onTimeChange={onTimeChange}
        onPresetSelect={onPresetSelect}
        onReset={onReset}
        onBack={onBack}
        onClose={onClose}
        popoverOpen={openPopover === "timePresets"}
        onTogglePopover={() => onTogglePopover("timePresets")}
        onClosePopover={onClosePopover}
      />
    );
  }
  if (mode === "units") {
    return (
      <UnitsContent
        ref={ref}
        isDesktop={isDesktop}
        units={units}
        filters={unitFilters}
        onFiltersChange={onUnitFiltersChange}
        listOpen={unitsListOpen}
        onToggleList={onToggleUnitsList}
        filtersExpanded={unitFiltersExpanded}
        onToggleFilters={onToggleUnitFilters}
        onBack={onBack}
        onClose={onClose}
        openPopover={openPopover}
        onTogglePopover={onTogglePopover}
        onClosePopover={onClosePopover}
      />
    );
  }
  if (mode === "views") {
    return (
      <ViewsContent
        ref={ref}
        isDesktop={isDesktop}
        presets={cameraPresets}
        activePresetId={activeViewPresetId}
        onSelectPreset={onSelectViewPreset}
        onBack={onBack}
        onClose={onClose}
      />
    );
  }
  return <NavigationContent ref={ref} activeModule={activeModule} onSelect={onSelectNav} />;
});
