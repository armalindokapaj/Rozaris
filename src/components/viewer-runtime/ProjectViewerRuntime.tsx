"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useIdleFade } from "@/hooks/useIdleFade";
import { useViewerPreferences } from "@/hooks/useViewerPreferences";
import { use3DAssetCache } from "@/hooks/use3DAssetCache";
import { useT } from "@/lib/i18n/useT";
import { ThreeProjectViewer, type ThreeProjectViewerHandle } from "@/components/project/ThreeProjectViewer";
import { ViewerHUD } from "@/components/project/viewer-hud/ViewerHUD";
import { MapViewEntryButton, MapModeBar } from "@/components/project/viewer-hud/MapViewToggle";
import { getViewerLayoutState } from "@/components/project/viewer-hud/layoutState";
import { ProjectMapView } from "@/components/map/ProjectMapView";
import type { ActiveModule } from "@/components/project/viewer-hud/types";
import { UnitsWorkspace } from "@/components/project/units-workspace/UnitsWorkspace";
import { MobileUnitsSheet } from "@/components/project/units-workspace/MobileUnitsSheet";
import {
  activeFilterCount,
  DEFAULT_UNIT_FILTERS,
  filterUnits,
  type UnitFilterState,
} from "@/components/project/units-workspace/unitFilters";
import { computeSunTimeline, geographicSunPosition, sunPositionForAnchors, sunTimelinePresets, type SunTimePreset } from "@/lib/sunPosition";
import type { CameraPreset } from "@/lib/types";
import { ConstructionTimelineStrip } from "@/components/project/ConstructionTimelineStrip";
import { UnitDiscoveryPanel } from "@/components/project/UnitDiscoveryPanel";
import { UnitPreviewCard } from "@/components/project/UnitPreviewCard";
import type { ProjectViewerRuntimeBootstrap, ViewerChannel } from "@/lib/viewer/runtimeTypes";

/** Sun & Time PRD — the public viewer's scrub range is a fixed constant
 * (direct instruction, 2026-08-17: "Time will always be from 06:00 to
 * 21:00"), not the admin-configurable `viewerTimeStartHours`/
 * `viewerTimeEndHours` fields — see `sunTimeBounds` below for why. */
/** How much of the frame a unit's block has to already occupy for a list
 * selection to leave the camera where it is — its bounding-sphere angular
 * radius as a fraction of the vertical half-FOV, so 0.1 is a block about a
 * fifth of the frame tall. Below that it is technically on screen and
 * practically unfindable, which is the same as being off screen as far as
 * the visitor is concerned. */
const MIN_ONSCREEN_UNIT_COVERAGE = 0.1;

/** Where a revealed unit should land vertically on mobile, in NDC
 * (+1 top, -1 bottom). The units sheet drops to its `peek` snap on the
 * same tap and from there owns roughly the bottom 45% of the screen, so
 * dead centre is behind it — this puts the unit in the middle of the strip
 * that is actually still visible. Desktop passes 0: there the list panel
 * narrows the viewport rather than covering it, so centre really is
 * centre. */
const MOBILE_REVEAL_SCREEN_BIAS = 0.45;

const PUBLIC_VIEWER_TIME_START_HOURS = 6;
const PUBLIC_VIEWER_TIME_END_HOURS = 21;

/**
 * Multi-Channel Publishing PRD Phase 4 — this is `ArchVizClient`, moved
 * and generalized: identical rendering logic, but reading a
 * `ProjectViewerRuntimeBootstrap` prop instead of calling
 * `useProjectConstruction`/`useProjectDetailModel`/`useProject3DConfig`/
 * `useProjectUnits` itself. Those 4 hooks (all tied to today's live
 * project APIs) now live in `MarketplaceViewer`, the thin wrapper that
 * replaces `ArchVizClient` at `/project/[slug]`; a future
 * `WhiteLabelViewer` (Phase 5) assembles the same bootstrap shape from a
 * `ViewerRelease` manifest instead. This component itself has zero
 * awareness of which one produced its data — "one rendering engine...
 * one bugfix fixes everyone," per the PRD.
 *
 * UI-only global state (compare tray, viewer preferences, idle-fade,
 * desktop/mobile breakpoint, i18n) stays read directly via hooks here
 * rather than threaded through `bootstrap` — it's genuinely
 * channel-agnostic app chrome, not project data, and both an embedded
 * white-label viewer and the marketplace site should behave the same way
 * for it.
 *
 * Everything below this point is unchanged from `ArchVizClient` — see
 * git history on that file (removed by this same change) for prior
 * inline doc comments this component inherits verbatim where the logic
 * itself didn't move.
 */
export function ProjectViewerRuntime({
  bootstrap,
  channel,
}: {
  bootstrap: ProjectViewerRuntimeBootstrap;
  channel: ViewerChannel;
}) {
  const { project, construction, detailModels, viewerConfig, units } = bootstrap;

  // Persistent revisit cache (see use3DAssetCache.ts) — scoped per
  // channel so a marketplace visit never registers a Service Worker
  // under /embed/ or vice versa.
  use3DAssetCache(channel === "marketplace" ? "/project/" : "/embed/");

  const mainRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<ThreeProjectViewerHandle>(null);
  const [unitPanelOpen, setUnitPanelOpen] = useState(false);
  // Units Blocks & POI Layer PRD §20 — "one selectedUnitId state, not two
  // independently-set pieces." Real Unit object is derived below once
  // `units` (the live Postgres list) is in scope, rather than storing the
  // object itself — a status change from the poll in useProjectUnits
  // would otherwise leave a stale Unit object here (wrong status/price)
  // until something else happened to re-select it.
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  // Set only when a *list* selection asked the camera to frame a unit and
  // the engine answered "I can't" (no resolvable mesh link in the loaded
  // GLB, or POI disabled for it). Drives a single honest line on the list
  // surface — see `handleSelectUnit` below. Never set from a 3D click,
  // which by construction can only ever hit a mapped block.
  const [unmappedUnitId, setUnmappedUnitId] = useState<string | null>(null);
  // The 3D click flow always lands on the small UnitPreviewCard first;
  // this only flips true when that card's own "View Unit" button asks for
  // the full gallery/publisher-contact panel.
  const [fullDetailOpen, setFullDetailOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [sceneReady, setSceneReady] = useState(false);
  const [screenshotFlash, setScreenshotFlash] = useState<"success" | "error" | null>(null);
  // Real bug found live: `el.requestFullscreen?.()` was fire-and-forget —
  // any environment that refuses Fullscreen (an embedded webview/iframe
  // without `allow="fullscreen"`, a browser with the permission denied,
  // etc.) rejected the promise silently and the button just looked dead,
  // with zero feedback. Same flash-toast pattern as screenshot below.
  const [fullscreenUnsupported, setFullscreenUnsupported] = useState(false);
  // Units Search Mode PRD §20/§26 "global layout state" — lifted up here
  // (rather than living inside ViewerHUD) because UnitsWorkspace is a
  // sibling of ViewerHUD (PRD §36's own component tree), not a child of
  // it, and both need to react to the same active menu.
  const [activeModule, setActiveModule] = useState<ActiveModule>("explore");
  // Units Bar redesign (2026-08-17) — the real UnitsWorkspace side panel no
  // longer opens the instant Units becomes the active module; it now waits
  // for an explicit click on UnitsBar's own "List Units" trigger. Reset
  // whenever the visitor leaves Units (a different nav item, Explore,
  // Escape/click-outside, the bar's own × — all of these already funnel
  // through `handleActiveModuleChange` below) rather than via a
  // setState-in-effect, which this codebase's react-hooks/set-state-in-
  // effect lint rule rejects (see useViewerPreferences.ts's own doc
  // comment for the same constraint).
  const [unitsListOpen, setUnitsListOpen] = useState(false);
  // Mobile-only (2026-08-24, direct instruction: "i dont want to let the
  // 'filtering tab' to be visible while rotating the building. it takes too
  // much space while navigating") — whether the dock's Units filter stack
  // is unfolded. Owned here rather than inside the dock for one concrete
  // reason: the gesture that collapses it is a pointer-down on the 3D
  // canvas (`handleScenePointerDown` below), and that canvas is a sibling
  // of ViewerHUD under this component, not a child of the dock. Desktop's
  // Units row is a single 62px line with nothing to fold, so it simply
  // never reads this (see UnitsContent's own `isDesktop` branch).
  //
  // Always re-opened on a module change below, deliberately: tapping Units
  // in the nav means "show me the filters", so entering the module never
  // lands on a collapsed sheet — only a real 3D interaction (or the
  // toggle) collapses it.
  const [unitFiltersExpanded, setUnitFiltersExpanded] = useState(true);
  const handleActiveModuleChange = useCallback((module: ActiveModule) => {
    setActiveModule(module);
    setUnitsListOpen((prev) => (module === "units" ? prev : false));
    setUnitFiltersExpanded(true);
  }, []);
  const handleToggleUnitFilters = useCallback(() => setUnitFiltersExpanded((prev) => !prev), []);
  // Unfold-only, for the mobile units sheet's own Filters button — that
  // button's job is "show me the filters", so it must not toggle them shut
  // again when they happen to already be open behind the sheet.
  const handleOpenUnitFilters = useCallback(() => setUnitFiltersExpanded(true), []);
  // Idle Drone Camera PRD §44-47 — Units/Views/Sun&Time are active
  // search/browsing states, not idle presentation ones; suspend the drone
  // for as long as the visitor stays in one. Returning to Explore both
  // lifts the suspension AND restarts the idle clock (resetIdleTimer) —
  // without the reset, a visitor who spent 5 minutes in Units would land
  // back in Explore with a stale `lastInteractionAt` and the drone would
  // activate instantly instead of waiting a fresh delay (§46).
  useEffect(() => {
    viewerRef.current?.setIdleDroneSuspended(activeModule !== "explore");
    if (activeModule === "explore") viewerRef.current?.resetIdleTimer();
  }, [activeModule]);

  // Studio ⇄ Map (Experience Editor "Map" tab) — independent of
  // `activeModule` above, which is "which Studio HUD dock panel is open,"
  // a different concern from "which render engine is mounted." Only one of
  // Studio/Map is ever mounted at a time (see the render below) — never
  // both ("do not overlay"). Reset to Studio's own default nav state on
  // entering Map mode so returning later doesn't land on a stale dock
  // panel that has nothing to act on there.
  const [viewMode, setViewMode] = useState<"studio" | "map">("studio");
  const enterMapView = useCallback(() => {
    setViewMode("map");
    setActiveModule("explore");
    setUnitsListOpen(false);
  }, []);
  const handleToggleUnitsList = useCallback(() => {
    setUnitsListOpen((prev) => {
      // Opening the mobile sheet folds the dock's own filter stack away in
      // the same gesture. The two stack vertically in the same bottom half
      // of a phone, and an expanded Units dock is the tallest thing on the
      // screen — leaving it open would hand the sheet a strip barely deep
      // enough for two rows. Filters stay one tap away (the dock's own
      // toggle, and the sheet header's Filters button, which reopens this
      // exact stack). Set from an event handler, never an effect: this
      // codebase's react-hooks/set-state-in-effect rule rejects that shape.
      if (!prev) setUnitFiltersExpanded(false);
      return !prev;
    });
  }, []);
  // Panel's own × (2026-08-18 direct instruction: "after the dock is
  // restored, the dock is where it was before at 'units'") — used to call
  // `handleActiveModuleChange("explore")`, which also reset `activeModule`,
  // so the dock unfolded back into Nav/Explore instead of Units. This only
  // closes the *list panel* (`unitsListOpen`), leaving `activeModule` at
  // "units" so the fold/unfold handoff (ViewerHUD.tsx's own `navRef`
  // effect) restores the dock to the same Units controls it showed before
  // "Filter List" was clicked, not a different mode.
  const handleCloseUnitsList = useCallback(() => setUnitsListOpen(false), []);
  // Shared with UnitsBar (via ViewerHUD) and UnitsWorkspace/UnitSearchView
  // — one real `UnitFilterState`, not two independently-maintained copies,
  // so Surface/Bedrooms/Bathrooms/Availability set from the new floating
  // bar genuinely narrow the same left-panel list.
  const [unitFilters, setUnitFilters] = useState<UnitFilterState>(DEFAULT_UNIT_FILTERS);
  const isDesktop = useIsDesktop();
  // Any pointer-down that actually reaches the 3D canvas folds the mobile
  // Units filter sheet away (see `unitFiltersExpanded` above). "Reaches"
  // is the whole mechanism: the dock and every other HUD surface sits
  // above the canvas with `pointer-events: auto`, so touching a filter
  // control never gets here — only a gesture aimed at the building does,
  // which is exactly the one the sheet was in the way of.
  //
  // Not the outside-click handler this HUD tried and removed once (see
  // ViewerHUD.tsx's own note): that one *closed the module* on a drag's
  // own mousedown, losing the visitor's place mid-orbit. This keeps Units
  // active, the filters applied and the unit blocks live — it only folds
  // the controls' footprint, and one tap on the dock's own toggle brings
  // them straight back.
  const handleScenePointerDown = useCallback(() => {
    if (isDesktop) return;
    setUnitFiltersExpanded((prev) => (prev ? false : prev));
  }, [isDesktop]);
  const { leftPanelOpen, unitsSheetOpen } = getViewerLayoutState(activeModule, isDesktop, unitsListOpen);
  // More / Settings Menu PRD §14 "Interface Auto-Hide" — lifted here from
  // ViewerHUD (2026-08-17) because the camera's own idle auto-rotate (see
  // `cameraConfig` below) needs the exact same signal, and two independent
  // `useIdleFade` timers would be wasteful/could drift. 60s (was 3.5s) —
  // direct design feedback: "works only if the user hasn't clicked the UI
  // for 60 seconds". Still gated to Explore-only + the real preference,
  // same as before this move.
  const idle = useIdleFade(60000);
  const { interfaceAutoHide } = useViewerPreferences();
  const chromeDimmed = interfaceAutoHide && idle && activeModule === "explore";
  const compareCount = useAppStore((s) => s.compare.length);
  const setCompareOverlayOpen = useAppStore((s) => s.setCompareOverlayOpen);
  const selectedUnit = useMemo(() => units.find((u) => u.id === selectedUnitId) ?? null, [units, selectedUnitId]);
  // The unit card now anchors to the top-right corner directly under the
  // header (2026-08-24 design feedback — see UnitPreviewCard's own doc
  // comment), which is the same corner the compare/construction cluster and
  // the Map View entry button stack in. It used to start a third of the way
  // down the screen specifically to clear them; now they yield to it instead.
  // Nothing is lost by hiding them while it's open — the card is `z-30` over
  // their `z-20`, so both were already sitting *underneath* it rather than
  // being readable — and closing the card (its ×, or Escape out of the detail
  // state and then ×) brings them straight back.
  // One detail surface at a time. Whichever unit list is open — the
  // desktop panel or the mobile sheet — already describes the selected
  // unit (the panel swaps to `UnitDetailView`, the sheet pins a summary
  // bar), so the card would be a second, redundant description of the same
  // unit on the same screen. That redundancy is new, and it is a direct
  // consequence of unifying selection: before, a list row click never
  // opened the card because it never wrote `selectedUnitId` at all.
  //
  // The visible trade is on desktop, where clicking a 3D block while the
  // panel is open now marks and scrolls to that row instead of popping the
  // card. That row carries the same headline facts the card's compact
  // state does — code, price, floor, layout, area, status — and adds the
  // one thing the card cannot: where the unit sits among its neighbours.
  // Close the list and the card comes straight back, still on that unit.
  const unitListSurfaceOpen = leftPanelOpen || unitsSheetOpen;
  const unitCardOpen = !!selectedUnit && viewerConfig.viewerUI.showUnitInfo !== false && !unitListSurfaceOpen;
  // Same `units` handed to every slot — `applyUnitBoxes` only actually
  // matches entries against that slot's own `unitLinks` map, so a unit
  // with no link for a given slot's meshes is simply never touched;
  // passing the whole project's inventory to every slot is correct, not
  // just convenient (a project's real units may span multiple slots).
  const detailModelEntries = useMemo(
    () => detailModels.map((entry) => ({ ...entry, units, statusPreviewEnabled: true })),
    [detailModels, units]
  );

  // Map mode — the same "building"-role model Studio renders (v1 scope:
  // only that one slot, see Project3DConfig's own doc comment), sourced
  // from the same published-only `detailModels` Studio already has, so
  // there's no separate fetch and Map mode can never show a draft.
  const mapViewGlbUrl = useMemo(
    () => detailModels.find((m) => m.slotRole === "building")?.model.glbUrl ?? null,
    [detailModels]
  );

  // More / Settings Menu PRD — real project fields for MoreMenu's own
  // Project Information section (and the header identity plate, which
  // this replaces the old projectName/developerName/city trio for).
  const moreMenuProject = useMemo(
    () => ({
      slug: project.slug,
      name: project.name,
      developerName: project.developer.name,
      developerVerified: project.developer.verified,
      city: project.city,
      propertyType: project.propertyType,
      completionLabel: project.completionLabel,
    }),
    [project]
  );
  const { t } = useT();

  // Sun & Time PRD §29 "Persistence" / §40 "State Architecture" — lives
  // here (not inside ViewerHUD/SunTimeWorkspace) for the same reason
  // `activeModule` does: it must survive switching to Units/Views/Explore
  // and back, and it directly feeds `environmentConfig` below, which only
  // this component computes. `null` means "untouched — follow the
  // project's published default" rather than duplicating that default
  // into local state the moment the config loads; Reset is then just
  // "go back to null", not "remember what the default was".
  const [liveSunTimeHours, setLiveSunTimeHours] = useState<number | null>(null);
  const [liveSunDate, setLiveSunDate] = useState<string | null>(null);
  const [activeSunPreset, setActiveSunPreset] = useState<SunTimePreset["id"] | null>(null);
  const effectiveSunTimeHours = liveSunTimeHours ?? viewerConfig.viewerTimeHours;
  const effectiveSunDate = liveSunDate ?? viewerConfig.simulationDate;
  // §9's own gate: an admin has to opt a project into BOTH a time-driven
  // sun ("solarControllerEnabled") AND public scrubbing of it
  // ("viewerTimeControlEnabled", real DB field, previously unread by any
  // public code path — see SunSkySubtab.tsx's own toggle) before a
  // visitor can actually drag this. Every project defaults to both off
  // today, so the common case renders the real panel read-only rather
  // than hiding it — see this session's own scoping decision.
  const sunTimeInteractive = viewerConfig.solarControllerEnabled && viewerConfig.viewerTimeControlEnabled;

  // §10/§21-22 — real sunrise/sunset/solar-noon + the presets derived from
  // them, computed identically whether the admin picked "geographic" (real
  // lat/lng astronomy) or "manual" (an authored anchor curve) — see
  // sunPosition.ts's own doc comment for why one function covers both.
  const sunTimeline = useMemo(() => {
    const elevationAt =
      viewerConfig.solarPathMode === "geographic"
        ? (h: number) => geographicSunPosition(new Date(effectiveSunDate), viewerConfig.geoLatitude, viewerConfig.geoLongitude, h).elevationDeg
        : (h: number) => sunPositionForAnchors(h, viewerConfig.solarAnchors).elevationDeg;
    return computeSunTimeline(elevationAt);
  }, [viewerConfig.solarPathMode, viewerConfig.geoLatitude, viewerConfig.geoLongitude, viewerConfig.solarAnchors, effectiveSunDate]);
  const sunTimePresets = useMemo(() => sunTimelinePresets(sunTimeline), [sunTimeline]);
  // Direct instruction, 2026-08-17: "Time will always be from 06:00 to
  // 21:00 for the users to edit" — the public viewer's scrub range is now
  // a fixed constant, not the admin's per-project `viewerTimeStartHours`/
  // `viewerTimeEndHours` (same "stop reading a DB field, flag it, don't
  // delete it" pattern as `chromeDimmed` replacing `viewerConfig.
  // autoRotate` above: the Experience Editor's Sun & Time start/end
  // fields still exist and still save, an admin's saved value just isn't
  // consulted by this component any more). `stepMinutes` wasn't part of
  // the instruction, so it stays admin-configurable.
  const sunTimeBounds = useMemo(
    () => ({
      startHours: PUBLIC_VIEWER_TIME_START_HOURS,
      endHours: PUBLIC_VIEWER_TIME_END_HOURS,
      stepMinutes: viewerConfig.viewerTimeStepMinutes,
    }),
    [viewerConfig.viewerTimeStepMinutes]
  );

  const handleSunTimeChange = useCallback((hours: number) => {
    setLiveSunTimeHours(hours);
    setActiveSunPreset(null);
    viewerRef.current?.resetIdleTimer(); // Idle Drone Camera PRD §47 — scrubbing Time counts as interaction
  }, []);
  // `handleSunDateChange` (the live-date-override write path, PRD §29) was
  // removed as dead code alongside SunTimeWorkspace's own date picker
  // (direct design feedback, 2026-08-17: "Date to be removed") — no UI
  // anywhere calls it anymore. `liveSunDate`/`setLiveSunDate` themselves
  // stay real (still read below, and `handleSunTimeReset` still clears
  // them) — only the setter's own trigger is gone, so a future date
  // control can call `setLiveSunDate` directly without rebuilding
  // anything here.
  const handleSunPresetSelect = useCallback((preset: SunTimePreset) => {
    setLiveSunTimeHours(preset.hour);
    setActiveSunPreset(preset.id);
    viewerRef.current?.resetIdleTimer();
  }, []);
  const handleSunTimeReset = useCallback(() => {
    setLiveSunTimeHours(null);
    setLiveSunDate(null);
    setActiveSunPreset(null);
    viewerRef.current?.resetIdleTimer();
  }, []);

  // Views Menu PRD — real admin-saved camera Shots (viewerConfig.
  // cameraPresets, Experience Editor v2's own Camera tab), global state
  // for the same reason Sun & Time's is: it should read as "still
  // selected" if the visitor switches to Units/Explore and back to Views.
  const [activeViewPresetId, setActiveViewPresetId] = useState<string | null>(null);
  const handleSelectViewPreset = useCallback((preset: CameraPreset) => {
    // Idle Drone Camera PRD §43 — no explicit resetIdleTimer() needed here:
    // RenderEngine.flyToPreset() already calls idleDrone.notifyInteraction()
    // itself (§18, every explicit transition preempts the drone).
    viewerRef.current?.flyToPreset(preset);
    setActiveViewPresetId(preset.id);
  }, []);

  const cameraConfig = useMemo(
    () => ({
      cameraFovDesktop: viewerConfig.cameraFovDesktop,
      cameraFovMobile: viewerConfig.cameraFovMobile,
      cameraNearClip: viewerConfig.cameraNearClip,
      cameraFarClip: viewerConfig.cameraFarClip,
      cameraStartDistanceMultiplier: viewerConfig.cameraStartDistanceMultiplier,
      cameraMinDistanceMultiplier: viewerConfig.cameraMinDistanceMultiplier,
      cameraMaxDistanceMultiplier: viewerConfig.cameraMaxDistanceMultiplier,
      cameraMinPolarDeg: viewerConfig.cameraMinPolarDeg,
      cameraMaxPolarDeg: viewerConfig.cameraMaxPolarDeg,
      cameraMinAzimuthDeg: viewerConfig.cameraMinAzimuthDeg,
      cameraMaxAzimuthDeg: viewerConfig.cameraMaxAzimuthDeg,
      cameraOrbitEnabled: viewerConfig.cameraOrbitEnabled,
      cameraPanEnabled: viewerConfig.cameraPanEnabled,
      cameraZoomEnabled: viewerConfig.cameraZoomEnabled,
      cameraDampingEnabled: viewerConfig.cameraDampingEnabled,
      // Driven by the same Interface Auto-Hide idle signal now, not the
      // admin's static per-project `viewerConfig.autoRotate` (direct
      // design feedback, 2026-08-17: "Default Camera will be rotation
      // off... only when Interface Auto-Hide is activated then the camera
      // will rotate slowly"). `viewerConfig.autoRotate` itself is
      // deliberately no longer read here — real, still in the DB/admin
      // schema, just not consulted by the public viewer, a flagged scope
      // change rather than a silently dropped field. THREE.OrbitControls'
      // own default `autoRotateSpeed` (2.0 → one revolution per ~30s at
      // 60fps) already reads as "slowly" without a new speed setting.
      autoRotate: chromeDimmed,
      idleDroneEnabled: viewerConfig.idleDroneEnabled,
      idleDroneDelaySec: viewerConfig.idleDroneDelaySec,
      idleDroneOrbitDurationSec: viewerConfig.idleDroneOrbitDurationSec,
      idleDroneClockwise: viewerConfig.idleDroneClockwise,
      idleDroneMotionEnabled: viewerConfig.idleDroneMotionEnabled,
      idleDroneHeightEnabled: viewerConfig.idleDroneHeightEnabled,
      idleDroneHeightAmplitude: viewerConfig.idleDroneHeightAmplitude,
      idleDroneDistanceEnabled: viewerConfig.idleDroneDistanceEnabled,
      idleDroneDistanceAmplitude: viewerConfig.idleDroneDistanceAmplitude,
      idleDroneTargetEnabled: viewerConfig.idleDroneTargetEnabled,
      idleDroneTargetAmplitude: viewerConfig.idleDroneTargetAmplitude,
      idleDroneVerticalCycles: viewerConfig.idleDroneVerticalCycles,
      idleDronePhaseOffsetDeg: viewerConfig.idleDronePhaseOffsetDeg,
      idleDroneSmoothness: viewerConfig.idleDroneSmoothness,
    }),
    [viewerConfig, chromeDimmed]
  );

  const qualityConfig = useMemo(
    () => ({
      renderingMode: viewerConfig.renderingMode,
      qualityPreset: viewerConfig.qualityPreset,
      customRenderScale: viewerConfig.customRenderScale,
      customDprCap: viewerConfig.customDprCap,
      adaptiveQualityEnabled: viewerConfig.adaptiveQualityEnabled,
      runtimeQualityReductionEnabled: viewerConfig.runtimeQualityReductionEnabled,
      interactionQualityReductionEnabled: viewerConfig.interactionQualityReductionEnabled,
    }),
    [viewerConfig]
  );

  const environmentConfig = useMemo(
    () => ({
      solarControllerEnabled: viewerConfig.solarControllerEnabled,
      solarPathMode: viewerConfig.solarPathMode,
      // Live-scrubbed Sun & Time state (effectiveSunTimeHours/Date) rather
      // than the raw published config — RenderEngine.setEnvironmentConfig
      // is already a live (no-remount) update path, so dragging the
      // Sun & Time slider flows straight through to a live sun position
      // via the exact same prop this object already fed on every load.
      viewerTimeHours: effectiveSunTimeHours,
      solarAnchors: viewerConfig.solarAnchors,
      geoLatitude: viewerConfig.geoLatitude,
      geoLongitude: viewerConfig.geoLongitude,
      simulationDate: effectiveSunDate,
      northOffsetDeg: viewerConfig.northOffsetDeg,
      sunDiscEnabled: viewerConfig.sunDiscEnabled,
      autoSunIntensityEnabled: viewerConfig.autoSunIntensityEnabled,
      autoSunColorEnabled: viewerConfig.autoSunColorEnabled,
      manualSunIntensity: viewerConfig.manualSunIntensity,
      manualSunColorHex: viewerConfig.manualSunColorHex,
      environmentRefreshEnabled: viewerConfig.environmentRefreshEnabled,
      sunAzimuthDeg: viewerConfig.sunAzimuthDeg,
      sunElevationDeg: viewerConfig.sunElevationDeg,
      skyEnabled: viewerConfig.skyEnabled,
      skyTurbidity: viewerConfig.skyTurbidity,
      skyRayleigh: viewerConfig.skyRayleigh,
      skyMieCoefficient: viewerConfig.skyMieCoefficient,
      skyMieDirectionalG: viewerConfig.skyMieDirectionalG,
      backdropEnabled: viewerConfig.backdropEnabled,
      backdropImageUrl: viewerConfig.backdropImageUrl,
      backdropRotationDeg: viewerConfig.backdropRotationDeg,
      backdropPitchDeg: viewerConfig.backdropPitchDeg,
      backdropElevation: viewerConfig.backdropElevation,
      environmentIntensity: viewerConfig.environmentIntensity,
      cloudsEnabled: viewerConfig.cloudsEnabled,
      cloudCoverage: viewerConfig.cloudCoverage,
      cloudDensity: viewerConfig.cloudDensity,
      cloudElevation: viewerConfig.cloudElevation,
      cloudMovementEnabled: viewerConfig.cloudMovementEnabled,
      cloudSunLightingEnabled: viewerConfig.cloudSunLightingEnabled,
      cloudShadowsEnabled: viewerConfig.cloudShadowsEnabled,
      cloudHeight: viewerConfig.cloudHeight,
      cloudThickness: viewerConfig.cloudThickness,
      cloudThreshold: viewerConfig.cloudThreshold,
      cloudOpacity: viewerConfig.cloudOpacity,
      cloudSoftness: viewerConfig.cloudSoftness,
      cloudScale: viewerConfig.cloudScale,
      cloudWindSpeed: viewerConfig.cloudWindSpeed,
      cloudWindDirectionDeg: viewerConfig.cloudWindDirectionDeg,
      cloudRaymarchSteps: viewerConfig.cloudRaymarchSteps,
      fogEnabled: viewerConfig.fogEnabled,
      fogColor: viewerConfig.fogColor,
      fogDensity: viewerConfig.fogDensity,
      fogMatchesSky: viewerConfig.fogMatchesSky,
      fogHeightBandEnabled: viewerConfig.fogHeightBandEnabled,
      fogHazeEnabled: viewerConfig.fogHazeEnabled,
      fogNoiseEnabled: viewerConfig.fogNoiseEnabled,
      fogMovementEnabled: viewerConfig.fogMovementEnabled,
      fogSunInteractionEnabled: viewerConfig.fogSunInteractionEnabled,
      fogBaseHeight: viewerConfig.fogBaseHeight,
      fogTopHeight: viewerConfig.fogTopHeight,
      fogHaze: viewerConfig.fogHaze,
      fogNoiseStrength: viewerConfig.fogNoiseStrength,
      fogNoiseScale: viewerConfig.fogNoiseScale,
      fogWindDirectionDeg: viewerConfig.fogWindDirectionDeg,
      fogWindSpeed: viewerConfig.fogWindSpeed,
      fogFalloff: viewerConfig.fogFalloff,
      fogMaxOpacity: viewerConfig.fogMaxOpacity,
      waterEnabled: viewerConfig.waterEnabled,
      waterDistortionScale: viewerConfig.waterDistortionScale,
      waterSize: viewerConfig.waterSize,
      waterType: viewerConfig.waterType,
      waterWavesEnabled: viewerConfig.waterWavesEnabled,
      waterMovementEnabled: viewerConfig.waterMovementEnabled,
      waterSunReflectionEnabled: viewerConfig.waterSunReflectionEnabled,
      waterEnvReflectionEnabled: viewerConfig.waterEnvReflectionEnabled,
      waterNormalMapEnabled: viewerConfig.waterNormalMapEnabled,
      waterHeight: viewerConfig.waterHeight,
      waterColor: viewerConfig.waterColor,
      waterDeepColor: viewerConfig.waterDeepColor,
      groundEnabled: viewerConfig.groundEnabled,
      groundStyle: viewerConfig.groundStyle,
      groundColor: viewerConfig.groundColor,
      groundFogEnabled: viewerConfig.groundFogEnabled,
      groundFogRadius: viewerConfig.groundFogRadius,
    }),
    [viewerConfig, effectiveSunTimeHours, effectiveSunDate]
  );

  const lightingConfig = useMemo(
    () => ({
      sunLightEnabled: viewerConfig.sunLightEnabled,
      sunTemperatureK: viewerConfig.sunTemperatureK,
      autoSunIntensityEnabled: viewerConfig.autoSunIntensityEnabled,
      autoSunColorEnabled: viewerConfig.autoSunColorEnabled,
      manualSunIntensity: viewerConfig.manualSunIntensity,
      manualSunColorHex: viewerConfig.manualSunColorHex,
      csmEnabled: viewerConfig.csmEnabled,
      csmCascades: viewerConfig.csmCascades,
      csmMaxDistance: viewerConfig.csmMaxDistance,
      csmResolution: viewerConfig.csmResolution,
      csmSplitMode: viewerConfig.csmSplitMode,
      csmMargin: viewerConfig.csmMargin,
      softShadowsEnabled: viewerConfig.softShadowsEnabled,
      shadowSoftness: viewerConfig.shadowSoftness,
      shadowsEnabled: viewerConfig.shadowsEnabled,
      contactShadowsEnabled: viewerConfig.contactShadowsEnabled,
      contactShadowBlur: viewerConfig.contactShadowBlur,
      contactShadowDarkness: viewerConfig.contactShadowDarkness,
      contactShadowOpacity: viewerConfig.contactShadowOpacity,
      contactShadowRange: viewerConfig.contactShadowRange,
      transmittedShadowsEnabled: viewerConfig.transmittedShadowsEnabled,
      coloredShadowsEnabled: viewerConfig.coloredShadowsEnabled,
      transmittedShadowStrength: viewerConfig.transmittedShadowStrength,
      giEnabled: viewerConfig.giEnabled,
      giIndirectEnabled: viewerConfig.giIndirectEnabled,
      giAOEnabled: viewerConfig.giAOEnabled,
      giBackfaceLighting: viewerConfig.giBackfaceLighting,
      giTemporalFiltering: viewerConfig.giTemporalFiltering,
      giScreenSpaceSampling: viewerConfig.giScreenSpaceSampling,
      giIntensity: viewerConfig.giIntensity,
      giAOIntensity: viewerConfig.giAOIntensity,
      giRadius: viewerConfig.giRadius,
      giSliceCount: viewerConfig.giSliceCount,
      giStepCount: viewerConfig.giStepCount,
      giExpFactor: viewerConfig.giExpFactor,
      giThickness: viewerConfig.giThickness,
      giLinearThickness: viewerConfig.giLinearThickness,
      artificialLights: viewerConfig.artificialLights,
      volumetricLightingEnabled: viewerConfig.volumetricLightingEnabled,
      sunShaftsEnabled: viewerConfig.sunShaftsEnabled,
      lightVolumesEnabled: viewerConfig.lightVolumesEnabled,
      volumetricRaymarchSteps: viewerConfig.volumetricRaymarchSteps,
      volumetricDensity: viewerConfig.volumetricDensity,
      volumetricMaxDensity: viewerConfig.volumetricMaxDensity,
      volumetricDistanceAtten: viewerConfig.volumetricDistanceAtten,
    }),
    [viewerConfig]
  );

  const renderingConfig = useMemo(
    () => ({
      ssrEnabled: viewerConfig.ssrEnabled,
      ssrIntensity: viewerConfig.ssrIntensity,
      ssrMaxDistance: viewerConfig.ssrMaxDistance,
      ssrThickness: viewerConfig.ssrThickness,
      ssrQuality: viewerConfig.ssrQuality,
      antialiasEnabled: viewerConfig.antialiasEnabled,
      bloomEnabled: viewerConfig.bloomEnabled,
      bloomStrength: viewerConfig.bloomStrength,
      bloomRadius: viewerConfig.bloomRadius,
      lensFlareEnabled: viewerConfig.lensFlareEnabled,
      lensFlareIntensity: viewerConfig.lensFlareIntensity,
      depthOfFieldEnabled: viewerConfig.depthOfFieldEnabled,
      depthOfFieldFocalLength: viewerConfig.depthOfFieldFocalLength,
      depthOfFieldBokehScale: viewerConfig.depthOfFieldBokehScale,
      cameraAutoFocusEnabled: viewerConfig.cameraAutoFocusEnabled,
      motionBlurEnabled: viewerConfig.motionBlurEnabled,
      motionBlurIntensity: viewerConfig.motionBlurIntensity,
      exposure: viewerConfig.exposure,
      toneMapping: viewerConfig.toneMapping,
      lutEnabled: viewerConfig.lutEnabled,
      lutPreset: viewerConfig.lutPreset,
      lutIntensity: viewerConfig.lutIntensity,
    }),
    [viewerConfig]
  );

  // Units Blocks & POI Layer PRD — real appearance + master POI camera
  // config for the public viewer's own unit blocks (same shape/pattern as
  // every other *Config memo here).
  const unitsConfig = useMemo(
    () => ({
      unitColorAvailable: viewerConfig.unitColorAvailable,
      unitColorReserved: viewerConfig.unitColorReserved,
      unitColorSold: viewerConfig.unitColorSold,
      unitColorSelected: viewerConfig.unitColorSelected,
      unitBlocksEnabled: viewerConfig.unitBlocksEnabled,
      unitBlocksStatusColorsEnabled: viewerConfig.unitBlocksStatusColorsEnabled,
      unitBlocksXrayEnabled: viewerConfig.unitBlocksXrayEnabled,
      unitBlocksDefaultOpacity: viewerConfig.unitBlocksDefaultOpacity,
      unitBlocksHoverOpacity: viewerConfig.unitBlocksHoverOpacity,
      unitBlocksSelectedOpacity: viewerConfig.unitBlocksSelectedOpacity,
      unitBlocksSelectedOutlineEnabled: viewerConfig.unitBlocksSelectedOutlineEnabled,
      // Mobile legibility floor — a FLOOR, never a cap: an admin who
      // authored a wider outline or already turned the selected fill on
      // keeps exactly what they authored, on every device.
      //
      // At the shipped defaults, "selected" is +0.14 opacity in the unit's
      // OWN status hue plus a 1px outline. On a 1440px desktop, next to a
      // 380px list, that is a legible nudge. On a 390px phone held at
      // arm's length, against a whole building, it is not a highlight in
      // any useful sense of the word — and "highlight it in the 3D
      // building unit" is the literal request this work exists to answer.
      // A hue change is perceptible at any size; an alpha change of 0.14
      // in the same hue is not. `unitBlocksSelectedFillEnabled` is
      // described in unitRegistry.ts's own comment as the escape hatch
      // "for projects where the outline alone doesn't read" — a phone is
      // that case for every project.
      unitBlocksSelectedOutlineWidth: isDesktop
        ? viewerConfig.unitBlocksSelectedOutlineWidth
        : Math.max(viewerConfig.unitBlocksSelectedOutlineWidth, 3),
      unitBlocksSelectedScaleEnabled: viewerConfig.unitBlocksSelectedScaleEnabled,
      unitBlocksSelectedScale: viewerConfig.unitBlocksSelectedScale,
      unitBlocksSelectedFillEnabled: isDesktop ? viewerConfig.unitBlocksSelectedFillEnabled : true,
      unitColorSelectedFill: viewerConfig.unitColorSelectedFill,
      unitBlocksSelectedXrayEnabled: viewerConfig.unitBlocksSelectedXrayEnabled,
      unitPoiCameraEnabled: viewerConfig.unitPoiCameraEnabled,
      unitPoiCameraFov: viewerConfig.unitPoiCameraFov,
      unitPoiCameraDistanceMultiplier: viewerConfig.unitPoiCameraDistanceMultiplier,
      unitPoiCameraHeightOffset: viewerConfig.unitPoiCameraHeightOffset,
      unitPoiTransitionMs: viewerConfig.unitPoiTransitionMs,
      unitPoiAutoOcclusionCorrection: viewerConfig.unitPoiAutoOcclusionCorrection,
    }),
    [viewerConfig, isDesktop]
  );

  // Fullscreen targets this whole page wrapper — not ThreeProjectViewer's
  // own canvas container — specifically so the header (ROZARIS/project
  // name/Full Screen/Screenshot) and the viewer's own bottom icon menu all
  // stay visible in real browser fullscreen instead of disappearing along
  // with the rest of the page chrome.
  function toggleFullscreen() {
    const el = mainRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      // Real bug found live: neither of these two failure modes ever
      // surfaced anything before — `document.fullscreenEnabled === false`
      // (Permissions-Policy denies it outright, e.g. inside an iframe/
      // webview without `allow="fullscreen"`) resolved as a silent no-op,
      // and `requestFullscreen()`'s own rejection (denied for any other
      // reason) was never caught, so it just vanished as an unhandled
      // promise rejection with the button looking completely dead either
      // way.
      if (!document.fullscreenEnabled || !el.requestFullscreen) {
        setFullscreenUnsupported(true);
        setTimeout(() => setFullscreenUnsupported(false), 2500);
        return;
      }
      el.requestFullscreen().catch(() => {
        setFullscreenUnsupported(true);
        setTimeout(() => setFullscreenUnsupported(false), 2500);
      });
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  }

  useEffect(() => {
    function onChange() {
      setFullscreen(document.fullscreenElement === mainRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Units Blocks & POI Layer PRD §13 — unit blocks are only visible AND
  // clickable/hoverable while the visitor is actually in the Units
  // module — matches ActiveModule's own 4 values exactly (explore/views/
  // sunTime all hide them, same as the admin editor scoping it to just
  // its own Units tab).
  useEffect(() => {
    viewerRef.current?.setUnitsMode(activeModule === "units");
  }, [activeModule]);

  // §13/§18 — the public Units workspace's own single-select status
  // filter (`unitFilters.status`) maps onto the engine's independent
  // available/reserved/sold toggles: "all" shows every status, any other
  // value isolates just that one.
  useEffect(() => {
    const status = unitFilters.status;
    viewerRef.current?.setUnitStatusFilters({
      available: status === "all" || status === "available",
      reserved: status === "all" || status === "reserved",
      sold: status === "all" || status === "sold",
    });
  }, [unitFilters.status]);

  // The *other* half of the same filter state — Surface, Rooms, Price,
  // Floor, Building and the search box — reaching the model too
  // (2026-08-24, direct instruction: "the Surface Filtering its not
  // working"). Status above was the only field ever wired to the 3D
  // scene, so Availability visibly hid unit blocks while dragging Surface
  // changed nothing on screen unless the Filter List side panel happened
  // to be open to show its own count drop. `filterUnits` stays the single
  // definition of "matches" (the same call the list and the dock's count
  // badge already make) — this just projects its result onto the engine.
  //
  // Status is deliberately neutralised out of the state passed here
  // rather than left in: it already has its own real engine path above,
  // and letting it narrow this id set too would mean a unit hidden by
  // status got hidden twice, which reads identically today but would
  // silently fight `setUnitStatusFilters` the moment either side gains
  // its own behaviour (a dimmed-not-hidden treatment, say).
  //
  // `null` (not the full id list) when nothing is narrowing, so a project
  // whose GLB has unit meshes the inventory doesn't name isn't quietly
  // blanked by a filter nobody set — see `setUnitIdFilter`'s own doc
  // comment for why empty and "inactive" must stay distinguishable.
  const unitFiltersWithoutStatus = useMemo(
    () => ({ ...unitFilters, status: "all" as const }),
    [unitFilters]
  );
  useEffect(() => {
    const isNarrowing =
      activeFilterCount(unitFiltersWithoutStatus) > 0 || unitFiltersWithoutStatus.query.trim() !== "";
    viewerRef.current?.setUnitIdFilter(
      isNarrowing ? filterUnits(units, unitFiltersWithoutStatus).map((u) => u.id) : null
    );
  }, [units, unitFiltersWithoutStatus]);

  async function handleScreenshot() {
    const dataUrl = await viewerRef.current?.captureScreenshot();
    if (!dataUrl) {
      setScreenshotFlash("error");
      setTimeout(() => setScreenshotFlash(null), 2500);
      return;
    }
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${project.slug}-rozaris.png`;
    // Some browsers only honor a download click on an anchor that's
    // actually in the DOM at click time — appended/removed synchronously
    // so it's never visible.
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Publish/runtime hardening pass — project.screenshotSaved was
    // already translated in both locales but had zero call sites
    // anywhere in the app; same timeout-flash pattern already used for
    // Project3DConfigEditor.tsx's own savedFlash.
    setScreenshotFlash("success");
    setTimeout(() => setScreenshotFlash(null), 2500);
  }

  // Stable identity required — ThreeProjectViewer deliberately excludes
  // this from its own effect deps (see its onReady doc comment), so a
  // fresh closure every render would just never be the one that's called.
  const handleReady = useCallback(() => setSceneReady(true), []);

  // ONE selection entry point for every list surface — the desktop
  // UnitsWorkspace panel, the mobile units sheet, anything later. Units
  // Blocks & POI Layer PRD §20 already asked for "one selectedUnitId
  // state, not two independently-set pieces"; until now that was only
  // half true, and the seam was visible: picking a row called
  // `setSelectedUnit` on the engine but never `setSelectedUnitId`, so the
  // list and a 3D click produced two different UIs for the same unit (row
  // click highlighted a block and opened the panel's detail view; a 3D
  // click opened the UnitPreviewCard and left the list showing nothing
  // selected). Both now land here.
  //
  // `focusUnit` is what makes the highlight actually *findable*. At the
  // shipped `unitsConfig` defaults, selecting a unit changes its block
  // from 0.18 to 0.32 opacity in the same status hue and adds a 1px
  // outline — on a whole-building shot that is close to imperceptible,
  // and worse, the selected block is very often behind the camera or on
  // the far face. Flying to the unit's authored POI framing is the
  // difference between "nothing happened" and "there it is". The engine
  // already owns the framing math, the transition, and the drone
  // preemption (RenderEngine.focusUnit) — this is the public viewer's
  // first call site for machinery an admin has been authoring all along.
  //
  // The `false` return is real information, not a failure to swallow: it
  // means this unit has no resolvable mesh in the loaded GLB (or an admin
  // turned its POI off), which is a common, legitimate state on projects
  // that are only partly mapped. `unmappedUnitId` below turns that into an
  // honest one-line note on the surface the visitor is looking at, rather
  // than a camera that silently refuses to move.
  const handleSelectUnit = useCallback((unitId: string | null) => {
    setSelectedUnitId(unitId);
    setFullDetailOpen(false);
    const viewer = viewerRef.current;
    viewer?.setSelectedUnit(unitId);
    if (!unitId) {
      setUnmappedUnitId(null);
      return;
    }
    viewer?.resetIdleTimer(); // Idle Drone Camera PRD §17 — a real unit selection
    // `null` here means one specific thing — this unit has no block in the
    // loaded model — and it is the only case that earns the "not shown in
    // the 3D model" note. Reading it from the registry rather than from
    // `focusUnit`'s own boolean matters: `focusUnit` also returns false for
    // a perfectly well-mapped unit whose POI camera an admin switched off,
    // and telling that visitor their unit isn't in the model would be a
    // lie about data that is actually fine.
    const view = viewer?.getUnitViewportState(unitId) ?? null;
    if (!view) {
      setUnmappedUnitId(unitId);
      return;
    }
    setUnmappedUnitId(null);
    // Whether to move the camera splits cleanly by breakpoint, because the
    // two list surfaces occupy the screen in fundamentally different ways.
    //
    // Desktop: `UnitsWorkspace` is a flex sibling that *narrows* the
    // viewport rather than covering it, so whatever the engine says is on
    // screen genuinely is. Framing on every row click would turn browsing
    // into a series of teleports, each re-framing nearly the same picture
    // while destroying the orientation the visitor built up — so fly only
    // when the block is off screen, or on screen but too small to pick out.
    //
    // Mobile: the sheet covers the bottom of the viewport, and the engine's
    // frustum test knows nothing about UI on top of it. Verified on a real
    // iPhone 13 viewport: all three of tower-vlora's units reported
    // `onScreen: true` with coverage ~0.101 — just over the threshold — while
    // sitting squarely behind the open sheet, so the "already visible"
    // branch fired and the visitor saw nothing move. Rather than teach the
    // engine about React's layout, mobile always frames: the sheet drops to
    // `peek` on the same tap specifically to uncover the result, the model
    // is small on a phone to begin with, and a tap on a named unit is an
    // unambiguous request to be shown it.
    if (isDesktop && view.onScreen && view.coverage >= MIN_ONSCREEN_UNIT_COVERAGE) return;
    // Honour a real authored POI framing when an admin has actually set
    // one; fall back to the generic reveal otherwise. `focusUnit` can also
    // decline outright (POI switched off for this unit or project-wide),
    // in which case the reveal still runs — the visitor asked to see a
    // unit, and every path here shows it to them.
    if (!(view.poiAuthored && viewer?.focusUnit(unitId))) {
      viewer?.revealUnit(unitId, isDesktop ? 0 : MOBILE_REVEAL_SCREEN_BIAS);
    }
  }, [isDesktop]);

  // Units Blocks & POI Layer PRD §19-20 — the real "3D → List/Panel" half:
  // a genuine click on a unit block (RenderEngine already distinguishes
  // this from an orbit-drag release and updates its OWN selection
  // instantly for visual feedback) opens the same UnitPreviewCard flow a
  // list row selection would, keyed off one shared `selectedUnitId`.
  // `null` (clicked empty space/architecture) clears it, same as the
  // panel's own close button.
  //
  // Deliberately NOT `handleSelectUnit`: the block the visitor just
  // tapped is by definition already on screen and already mapped, so
  // flying the camera to it would move the view out from under a gesture
  // that had nothing wrong with its framing. The engine has also already
  // written its own `selectedUnitId` synchronously (that is the point of
  // the instant visual feedback), so re-issuing `setSelectedUnit` here
  // would only force a redundant registry rebuild.
  const handleUnitClickIn3D = useCallback((unitId: string | null) => {
    setSelectedUnitId(unitId);
    setFullDetailOpen(false);
    setUnmappedUnitId(null);
  }, []);

  return (
    <div
      id="main-content"
      ref={mainRef}
      data-viewer-channel={channel}
      className="relative flex h-dvh w-full overflow-hidden bg-neutral-900"
    >
      {/* Units Search Mode PRD §3-5 — a real structural viewport column,
          not an overlay/modal: it's a flex sibling of the 3D viewport
          wrapper below, so its own width tween is what actually reflows
          that sibling narrower each frame (see UnitsWorkspace's doc
          comment for why that's deliberate). */}
      <UnitsWorkspace
        open={leftPanelOpen}
        onClose={handleCloseUnitsList}
        units={units}
        selectedUnitId={selectedUnitId}
        onSelectUnit={handleSelectUnit}
        unmappedUnitId={unmappedUnitId}
        filters={unitFilters}
        onFiltersChange={setUnitFilters}
      />

      {/* The 3D viewport + everything positioned relative to it (HUD,
          compare/construction cluster, screenshot flash) — scoped to this
          wrapper rather than the full page so all of it narrows/shifts
          together as UnitsWorkspace opens, instead of staying pinned to
          the full browser width while only the canvas itself moves. */}
      <div className="relative h-full min-w-0 flex-1">
        {viewMode === "map" ? (
          <MapModeBar
            projectName={moreMenuProject.name}
            developerName={moreMenuProject.developerName}
            city={moreMenuProject.city}
            onExit={() => setViewMode("studio")}
          />
        ) : (
          <>
            <ViewerHUD
              viewerRef={viewerRef}
              sceneReady={sceneReady}
              activeModule={activeModule}
              onActiveModuleChange={handleActiveModuleChange}
              chromeDimmed={chromeDimmed}
              project={moreMenuProject}
              fullscreen={fullscreen}
              onToggleFullscreen={toggleFullscreen}
              onScreenshot={handleScreenshot}
              screenshotEnabled={viewerConfig.viewerUI.screenshotEnabled !== false}
              fullscreenEnabled={viewerConfig.viewerUI.fullscreenEnabled !== false}
              northOffsetDeg={viewerConfig.northOffsetDeg}
              viewerTimeHours={effectiveSunTimeHours}
              sunTimeInteractive={sunTimeInteractive}
              sunTimeBounds={sunTimeBounds}
              sunTimeline={sunTimeline}
              sunTimePresets={sunTimePresets}
              activeSunPreset={activeSunPreset}
              sunTimeCanReset={liveSunTimeHours != null || liveSunDate != null}
              onSunTimeChange={handleSunTimeChange}
              onSunPresetSelect={handleSunPresetSelect}
              onSunTimeReset={handleSunTimeReset}
              cameraPresets={viewerConfig.cameraPresets}
              activeViewPresetId={activeViewPresetId}
              onSelectViewPreset={handleSelectViewPreset}
              units={units}
              unitFilters={unitFilters}
              onUnitFiltersChange={setUnitFilters}
              unitsListOpen={unitsListOpen}
              onToggleUnitsList={handleToggleUnitsList}
              unitFiltersExpanded={unitFiltersExpanded}
              onToggleUnitFilters={handleToggleUnitFilters}
            />
            {viewerConfig.mapViewEnabled && !unitCardOpen && (
              // Clears the compare-tray/construction-strip cluster below
              // (`top-[60px]`/`top-[68px]`, conditionally shown) with real
              // margin rather than sharing its row — that cluster's own
              // visibility doesn't depend on `mapViewEnabled`, so the two
              // can be on-screen at once.
              <div className="pointer-events-none absolute right-3 top-[112px] z-20 flex justify-end pr-[env(safe-area-inset-right)] sm:right-4 sm:top-[124px]">
                <MapViewEntryButton onClick={enterMapView} />
              </div>
            )}
          </>
        )}

        {/* Pre-dates the Front Page rebuild and isn't governed by its PRD
            (compare tray + construction progress) — kept exactly where it
            was, just no longer sharing a header row with project identity
            now that ViewerHUD owns the top-left/top-right corners. Studio-
            only, same as ViewerHUD itself: nothing that opens either (the
            Units workflow, ViewerHUD's own construction awareness) is
            reachable while Map mode's own minimal bar is showing. */}
        {viewMode === "studio" && !unitCardOpen && (compareCount > 0 || (!unitPanelOpen && project.status === "under_construction")) && (
          <div className="absolute right-3 top-[60px] z-20 flex shrink-0 items-stretch gap-2 pr-[env(safe-area-inset-right)] sm:right-4 sm:top-[68px]">
            {compareCount > 0 && (
              <button
                onClick={() => setCompareOverlayOpen(true)}
                className="glass-panel-dark flex items-center gap-1.5 rounded-pill px-3.5 text-xs font-semibold text-white"
              >
                <SquareStack className="h-3.5 w-3.5" />
                {compareCount}
              </button>
            )}
            {!unitPanelOpen && project.status === "under_construction" && (
              <div className="flex items-stretch">
                <ConstructionTimelineStrip
                  stages={construction.stages}
                  overallPercent={construction.progressPercent}
                  compact
                />
              </div>
            )}
          </div>
        )}

        {viewMode === "studio" && screenshotFlash && (
          <div className="glass-panel-dark pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-pill px-4 py-2 text-xs font-semibold text-white sm:top-20">
            {t(screenshotFlash === "success" ? "project.screenshotSaved" : "project.screenshotFailed")}
          </div>
        )}

        {viewMode === "studio" && fullscreenUnsupported && (
          <div className="glass-panel-dark pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-pill px-4 py-2 text-xs font-semibold text-white sm:top-20">
            {t("project.fullscreenUnavailable")}
          </div>
        )}

        {viewMode === "map" ? (
          <ProjectMapView
            project={{ id: project.id, coords: project.coords }}
            glbUrl={mapViewGlbUrl}
            editable={false}
            placement={{
              latitude: viewerConfig.mapViewLatitude,
              longitude: viewerConfig.mapViewLongitude,
              altitude: viewerConfig.mapViewAltitude,
              headingDeg: viewerConfig.mapViewHeadingDeg,
              scale: viewerConfig.mapViewScale,
            }}
            sun={{
              azimuthDeg: viewerConfig.sunAzimuthDeg,
              elevationDeg: viewerConfig.sunElevationDeg,
              autoIntensityEnabled: viewerConfig.autoSunIntensityEnabled,
              autoColorEnabled: viewerConfig.autoSunColorEnabled,
              manualIntensity: viewerConfig.manualSunIntensity,
              manualColorHex: viewerConfig.manualSunColorHex,
              enabled: viewerConfig.sunLightEnabled,
            }}
            className="relative h-full w-full"
          />
        ) : (
          // Wrapper exists only to catch pointer-downs aimed at the scene
          // (`handleScenePointerDown` above) — `ThreeProjectViewer` owns
          // its own canvas/renderer lifecycle and has no business growing
          // a UI-state callback prop for one consumer's mobile dock.
          // Capture phase so it still fires regardless of what the
          // viewer's own OrbitControls do with the event afterwards.
          <div className="relative h-full w-full" onPointerDownCapture={handleScenePointerDown}>
            <ThreeProjectViewer
              ref={viewerRef}
              detailModels={detailModelEntries}
              cameraConfig={cameraConfig}
              qualityConfig={qualityConfig}
              environmentConfig={environmentConfig}
              lightingConfig={lightingConfig}
              renderingConfig={renderingConfig}
              unitsConfig={unitsConfig}
              onUnitClick={handleUnitClickIn3D}
              onReady={handleReady}
              className="relative h-full w-full"
            />
          </div>
        )}
        {viewMode === "studio" && (
          <MobileUnitsSheet
            open={unitsSheetOpen}
            onClose={handleCloseUnitsList}
            units={units}
            selectedUnitId={selectedUnitId}
            onSelectUnit={handleSelectUnit}
            unmappedUnitId={unmappedUnitId}
            filters={unitFilters}
            onFiltersChange={setUnitFilters}
            onOpenDockFilters={handleOpenUnitFilters}
          />
        )}
      </div>

      <UnitDiscoveryPanel
        project={project}
        open={unitPanelOpen}
        onClose={() => setUnitPanelOpen(false)}
        onSelectUnit={(u) => handleSelectUnit(u.id)}
      />
      {unitCardOpen && selectedUnit && (
        // One card in two states, not two components — "View Unit" morphs this
        // same shell open in place (see UnitPreviewCard's own doc comment) so
        // it can never unmount mid-animation.
        <UnitPreviewCard
          project={project}
          unit={selectedUnit}
          expanded={fullDetailOpen}
          // `handleSelectUnit(null)`, not a bare `setSelectedUnitId(null)`:
          // the latter cleared React's selection but left the engine's, so
          // dismissing the card left the block outlined and at selected
          // opacity with nothing on screen to explain why.
          onClose={() => handleSelectUnit(null)}
          onExpand={() => setFullDetailOpen(true)}
          onCollapse={() => setFullDetailOpen(false)}
        />
      )}
    </div>
  );
}
