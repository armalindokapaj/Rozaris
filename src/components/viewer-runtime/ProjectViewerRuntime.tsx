"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SquareStack } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useIdleFade } from "@/hooks/useIdleFade";
import { useViewerPreferences } from "@/hooks/useViewerPreferences";
import { use3DAssetCache } from "@/hooks/use3DAssetCache";
import { useT } from "@/lib/i18n/useT";
import { ThreeProjectViewer, type ThreeProjectViewerHandle } from "@/components/project/ThreeProjectViewer";
import { ViewerDiagnostics } from "@/components/project/ViewerDiagnostics";
import type { RendererFacts } from "@/lib/render-engine/RenderEngine";
import { ViewerHUD } from "@/components/project/viewer-hud/ViewerHUD";
import { getViewerLayoutState } from "@/components/project/viewer-hud/layoutState";
import type { ActiveModule } from "@/components/project/viewer-hud/types";
import { UnitsWorkspace } from "@/components/project/units-workspace/UnitsWorkspace";
import { MobileUnitsSheet } from "@/components/project/units-workspace/MobileUnitsSheet";
import {
  activeFilterCount,
  DEFAULT_UNIT_FILTERS,
  filterUnits,
  type UnitFilterState,
} from "@/components/project/units-workspace/unitFilters";
import { computeSunTimeline, geographicSunPosition, snapSunTimeHours, snapSunTimePresets, sunPositionForAnchors, sunTimelinePresets, type SunTimePreset, type SunTimeWindow } from "@/lib/sunPosition";
import { parseSectionFloorNumber, resolveFloorSection } from "@/lib/floorSections";
import { buildFloorRail, type FloorRailEntry } from "@/lib/floorRail";
import { makeFloorId } from "@/lib/units";
import { FloorRail } from "@/components/project/viewer-hud/FloorRail";
import type { CameraPreset, Section } from "@/lib/types";
import { ConstructionTimelineStrip } from "@/components/project/ConstructionTimelineStrip";
import { UnitDiscoveryPanel } from "@/components/project/UnitDiscoveryPanel";
import { UnitPreviewCard } from "@/components/project/UnitPreviewCard";
import type { ProjectViewerRuntimeBootstrap, ViewerChannel } from "@/lib/viewer/runtimeTypes";
import { applyViewerQuality, applyViewerQualityToLighting, applyViewerQualityToRendering } from "@/lib/viewerQuality";

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

/** Narrowest scrub window the time slider is still draggable in. Only
 * reached if an admin sets Start Time and End Time to the same hour. */
const MIN_SUN_TIME_WINDOW_HOURS = 1;

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

  // `?diag=1` — the on-device report (see `ViewerDiagnostics`). Read
  // straight off `window.location` rather than `useSearchParams()`
  // deliberately: this component is shared by `/project/[slug]` and the
  // white-label `/embed/[publicKey]`, and `useSearchParams` opts the whole
  // subtree into a Suspense boundary requirement it does not otherwise
  // have. Read once, in an effect, so the server and the first client
  // render agree and nothing hydrates mismatched.
  // `useSyncExternalStore` rather than an effect: the value is client-only
  // but never changes after load, and this is the one hook that expresses
  // exactly that — a server snapshot of `false` (so the markup matches)
  // and a client snapshot read from the real URL, with no setState-in-an-
  // effect and no hydration mismatch.
  const diagOpen = useSyncExternalStore(
    () => () => {},
    () => new URLSearchParams(window.location.search).get("diag") === "1",
    () => false
  );
  const [rendererFacts, setRendererFacts] = useState<RendererFacts | null>(null);
  const [diagStats, setDiagStats] = useState<Parameters<NonNullable<Parameters<typeof ThreeProjectViewer>[0]["onPerfStats"]>>[0]>(null);
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
  /** Only a real dismissal returns the card to its compact state.
   *
   * Every selection used to reset this, so clicking one unit after another
   * with the detail pane open collapsed the card each time and made the
   * visitor press "View Unit" again for every single unit — the opposite
   * of browsing (2026-08-25 direct instruction: "clicking other units
   * shows the large popup... quick interaction"). Switching units now
   * swaps the open pane's content in place, which is what the card was
   * built for in the first place ("clicking a *different* unit just swaps
   * this card's content in place" — UnitPreviewCard's own doc comment);
   * only the shell's height tweens, since `expanded` itself is unchanged
   * and the morph's `modeChanged` branch never fires.
   *
   * `null` — the card's ×, a click on empty space, the engine reporting no
   * hit — still resets, so the next unit opens small the way a first
   * selection should. */
  const resetDetailOnDismiss = useCallback((unitId: string | null) => {
    if (!unitId) setFullDetailOpen(false);
  }, []);
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
  // `handleActiveModuleChange` itself lives further down, next to the floor
  // rail: leaving the Units module is one of the two transitions that can
  // take away the last control able to undo a floor cut, so the handler
  // needs `applyFloorSection`, which is declared with the rest of the
  // sections state.
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
  const { interfaceAutoHide, quality: viewerQuality } = useViewerPreferences();
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

  // --- Floor sections ("View in Floor") ------------------------------------
  //
  // The Sections module has been authorable in the Experience Editor since
  // the v2 rebuild and, until now, entirely invisible to visitors — the
  // admin's own "Sections" interaction toggle carried the hint "No public
  // Sections activation UI built yet". This is that UI, in the one place a
  // cutaway actually answers a question someone is asking: the card for a
  // unit, with a button that opens up the floor that unit is on.
  //
  // No new stored linkage — an admin names a section after the floor it
  // cuts and every unit on that floor picks it up (2026-08-25 direct
  // instruction; see `src/lib/floorSections.ts` for the parse and the
  // precedence rules). `sectionsEnabled` is the same per-project admin
  // toggle that already exists, and an empty `sections` array means there
  // is nothing to offer.
  const floorSectionsAvailable =
    viewerConfig.viewerUI.sectionsEnabled !== false && viewerConfig.sections.length > 0;
  const floorSectionForSelectedUnit = useMemo(
    () =>
      floorSectionsAvailable && selectedUnit
        ? resolveFloorSection(viewerConfig.sections, selectedUnit)
        : null,
    [floorSectionsAvailable, viewerConfig.sections, selectedUnit]
  );
  /** The same lookup for a unit that is only an id — the one a selection
   * handler has in hand before `selectedUnitId` has been written, which the
   * memo above cannot answer for. */
  const resolveSectionForUnitId = useCallback(
    (unitId: string | null) => {
      if (!unitId || !floorSectionsAvailable) return null;
      const unit = units.find((u) => u.id === unitId) ?? null;
      return unit ? resolveFloorSection(viewerConfig.sections, unit) : null;
    },
    [units, floorSectionsAvailable, viewerConfig.sections]
  );
  const [activeFloorSectionId, setActiveFloorSectionId] = useState<string | null>(null);
  /** The section currently clipping the scene, as a whole record — the exit
   * pill's label comes from it rather than from any unit, which is the point:
   * a cut opened from the floor rail has no selected unit at all (2026-08-26
   * direct instruction: "keep showing 'Exit Floor' tab even when the user is
   * clicking only the Floors tab on the left"). */
  const activeFloorSection = useMemo(
    () => viewerConfig.sections.find((sec) => sec.id === activeFloorSectionId) ?? null,
    [viewerConfig.sections, activeFloorSectionId]
  );
  /**
   * Whether the retracted "Exit Floor" pill is showing.
   *
   * Pure derivation, not state: the pill is simply "there is a cut, and the
   * unit card is not on screen to carry its own toggle". That covers both
   * routes into a cut with one rule — the card dismissed while its cut is
   * still applied (where the shell morphs down into the pill, see
   * UnitPreviewCard's `CardMode`), and the floor rail used on its own, where
   * the pill is the whole card the visitor ever sees.
   *
   * Mutually exclusive with the card ON PURPOSE: both are anchored to the same
   * top-right corner, so showing them together would overlap them. The one
   * state where a cut is applied *and* the card is up *and* the card cannot
   * undo it — a unit whose floor has no section authored — is what
   * `dropFloorCutIfUncontrolled` below still exists to resolve.
   */
  const floorExitOpen = !!activeFloorSectionId && !unitCardOpen;

  /**
   * `frameUnitIds` is what separates the rail's click from the card's
   * button, and the difference is deliberate rather than an oversight:
   * pressing "View in Floor" on a unit card happens with the camera
   * already sitting on that very unit, so moving it again would be a
   * second change nobody asked for; picking a floor off the rail happens
   * from wherever the visitor was, with nothing framed, so the cut alone
   * would very often open a floor that is behind the camera or across the
   * building (2026-08-25 decision: a floor click cuts AND flies).
   */
  const applyFloorSection = useCallback(
    (section: Section | null, options?: { frameUnitIds?: string[] }) => {
      // `showIndicator: false` — a `fillGapsEnabled: false` section's grey
      // rectangle is an authoring aid for the plane an admin is dragging
      // numbers against, and every section saved on this platform so far is
      // one. See RenderEngine.activateSection's own doc comment.
      viewerRef.current?.activateSection(section, { showIndicator: false });
      setActiveFloorSectionId(section?.id ?? null);
      // An admin can save a viewpoint onto a section ("activating this
      // section clips without moving the camera" is the documented default
      // when they haven't). A real authored viewpoint outranks any framing
      // this code could derive, so it is checked first.
      if (section?.cameraPreset) {
        viewerRef.current?.flyToPreset({
          id: section.id,
          label: section.name,
          durationMs: 900,
          ...section.cameraPreset,
        });
      } else if (section && options?.frameUnitIds?.length) {
        // The floor's own units are the best description of where that
        // floor is. When none of them resolve to a block in the loaded GLB
        // (an unmapped floor — common on a partly-mapped project) the
        // section's drawn footprint is the only thing left that knows, so
        // fall back to it rather than leaving the visitor staring at an
        // unchanged view of a building that just silently sliced open.
        const framed = viewerRef.current?.revealUnits(
          options.frameUnitIds,
          isDesktop ? 0 : MOBILE_REVEAL_SCREEN_BIAS
        );
        if (!framed) {
          viewerRef.current?.revealArea(
            {
              centerX: section.centerX,
              centerZ: section.centerZ,
              y: section.heightM,
              radius: Math.max(section.widthM, section.depthM) / 2,
            },
            isDesktop ? 0 : MOBILE_REVEAL_SCREEN_BIAS
          );
        }
      }
      viewerRef.current?.resetIdleTimer();
    },
    [isDesktop]
  );

  const handleToggleFloorSection = useCallback(() => {
    const section = floorSectionForSelectedUnit;
    if (!section) return;
    applyFloorSection(section.id === activeFloorSectionId ? null : section);
  }, [floorSectionForSelectedUnit, activeFloorSectionId, applyFloorSection]);

  const handleExitFloorFromPill = useCallback(() => applyFloorSection(null), [applyFloorSection]);

  /** The unit the card is describing — nobody, once the card has retracted to
   * the pill. One component either way, so the shell keeps its React identity
   * across the retract and the morph has something to morph. */
  const cardUnit = unitCardOpen ? selectedUnit : null;

  // --- The floor rail -------------------------------------------------
  //
  // The floors real inventory stands on, per building, each carrying the
  // section that cuts it open (see src/lib/floorRail.ts). Derived, not
  // stored, and rebuilt only when the units or the project's sections
  // actually change — `units` is polled by useProjectUnits, so a status
  // change upstream must not be able to churn this every few seconds.
  const floorRailBuildings = useMemo(
    () => buildFloorRail(units, viewerConfig.sections),
    [units, viewerConfig.sections]
  );
  const selectedFloorId = useMemo(
    () => (selectedUnit ? makeFloorId(selectedUnit.buildingName, selectedUnit.floor) : null),
    [selectedUnit]
  );

  const handleSelectFloor = useCallback(
    (entry: FloorRailEntry) => {
      // A floor with no section authored for it renders disabled, so this
      // is unreachable from the rail; guarded anyway because "disabled in
      // the UI" is not the same guarantee as "cannot be called".
      if (!entry.sectionId) return;
      if (entry.sectionId === activeFloorSectionId) {
        // Re-clicking the lit floor closes the cut. The camera stays where
        // the visitor last left it: restoring the pre-cut viewpoint would
        // undo orbiting they did *while* the floor was open, which is
        // their work, not the rail's to throw away.
        applyFloorSection(null);
        return;
      }
      const section = viewerConfig.sections.find((s) => s.id === entry.sectionId) ?? null;
      if (!section) return;
      applyFloorSection(section, { frameUnitIds: entry.unitIds });
    },
    [activeFloorSectionId, applyFloorSection, viewerConfig.sections]
  );

  /**
   * While a cut is applied, the cut FOLLOWS the selection: picking a unit on
   * another floor moves the cutaway to that unit's own floor rather than
   * leaving the visitor looking at floor 8 opened up with a floor 6 unit
   * selected inside it (2026-08-26 direct instruction: "clicking 'View in
   * Floor' on a unit in Level 8 gives the section of floor 8, clicking a unit
   * on level 6 then goes to the Floor 6 and the section of the floor 6").
   *
   * Strictly a *follow*, never an entry point — it does nothing unless a cut
   * is already on the building, so an ordinary click on a unit outside
   * "View in Floor" mode still just selects that unit.
   *
   * No `frameUnitIds`: every route into here has already dealt with the
   * camera. A 3D click lands on a block that is by definition on screen, and
   * a list selection flies to the unit a few lines further down its own
   * handler — framing the floor as well would be a second camera move
   * fighting the first. (A section carrying an admin-authored `cameraPreset`
   * still honours it, exactly as the card's own button does.)
   *
   * Returns whether it took ownership of the cut, so the caller knows to skip
   * the drop check below.
   */
  const followFloorCutToUnit = useCallback(
    (unitId: string | null) => {
      if (!activeFloorSectionId || !unitId) return false;
      const section = resolveSectionForUnitId(unitId);
      // No section authored for that unit's floor — the cut cannot follow, so
      // leave it to `dropFloorCutIfUncontrolled` to decide whether it may
      // stay. Same floor is a no-op rather than a re-apply: re-running
      // `applyFloorSection` would re-fire the section's camera preset and jump
      // the view on every click within one open floor.
      if (!section || section.id === activeFloorSectionId) return false;
      applyFloorSection(section);
      return true;
    },
    [activeFloorSectionId, resolveSectionForUnitId, applyFloorSection]
  );

  /**
   * The one hole the exit pill does not plug: a cut is applied, the unit card
   * IS on screen (so the pill is suppressed — they share a corner), and that
   * card cannot undo the cut because no section is authored for its unit's
   * floor. `followFloorCutToUnit` above has already handled every case where
   * the cut CAN move; this is what is left when it cannot.
   *
   * Inside Units the rail is still on screen and owns the cut, so nothing is
   * stranded there either. Enforced at the two transitions that can actually
   * take the last control away — a module change and a change of selected
   * unit — rather than from an effect watching the result: this codebase's
   * react-hooks/set-state-in-effect rule rejects the latter, and both call
   * sites already know the transition is happening.
   */
  const dropFloorCutIfUncontrolled = useCallback(
    (nextModule: ActiveModule, nextUnitId: string | null) => {
      if (!activeFloorSectionId) return;
      // Mirrors `unitCardOpen`'s own condition against the unit this
      // transition is *about to* select, which is exactly what the derived
      // `floorExitOpen` cannot answer yet: no card means the pill, and the
      // pill is a control.
      const cardWillBeOpen =
        !!nextUnitId && viewerConfig.viewerUI.showUnitInfo !== false && !unitListSurfaceOpen;
      if (!cardWillBeOpen) return; // the exit pill is on screen and owns it
      if (nextModule === "units") return; // the rail is on screen and owns it
      const cardSection = resolveSectionForUnitId(nextUnitId);
      if (cardSection?.id === activeFloorSectionId) return; // the card's own button
      applyFloorSection(null);
    },
    [
      activeFloorSectionId,
      unitListSurfaceOpen,
      resolveSectionForUnitId,
      viewerConfig.viewerUI.showUnitInfo,
      applyFloorSection,
    ]
  );

  const handleActiveModuleChange = useCallback(
    (module: ActiveModule) => {
      // The pill is module-agnostic chrome in the top-right corner, so it
      // carries the cut across a module change the way the rail carries it
      // within Units — nothing is ever left cut with no way out.
      dropFloorCutIfUncontrolled(module, selectedUnitId);
      setActiveModule(module);
      setUnitsListOpen((prev) => (module === "units" ? prev : false));
      setUnitFiltersExpanded(true);
    },
    [dropFloorCutIfUncontrolled, selectedUnitId]
  );
  // Same `units` handed to every slot — `applyUnitBoxes` only actually
  // matches entries against that slot's own `unitLinks` map, so a unit
  // with no link for a given slot's meshes is simply never touched;
  // passing the whole project's inventory to every slot is correct, not
  // just convenient (a project's real units may span multiple slots).
  const detailModelEntries = useMemo(
    () => detailModels.map((entry) => ({ ...entry, units, statusPreviewEnabled: true })),
    [detailModels, units]
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

  /** The pill's label, read off the cut itself. `parseSectionFloorNumber` is
   * the same parse that links sections to floors everywhere else; a section
   * whose name declares no floor falls back to the name an admin gave it,
   * which is still the truest description available of what is cut open. */
  const exitFloorNumber = activeFloorSection ? parseSectionFloorNumber(activeFloorSection.name) : null;
  const exitFloorLabel = activeFloorSection
    ? exitFloorNumber == null
      ? activeFloorSection.name
      : t("unit.floorLabel", { n: exitFloorNumber })
    : null;
  const exitFloorTitle = activeFloorSection
    ? exitFloorNumber == null
      ? t("unit.exitFloorView")
      : t("unit.exitFloorViewTitle", { n: exitFloorNumber })
    : null;

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
  const effectiveSunDate = liveSunDate ?? viewerConfig.simulationDate;
  // §9's own gate: an admin has to opt a project into BOTH a time-driven
  // sun ("solarControllerEnabled") AND public scrubbing of it
  // ("viewerTimeControlEnabled", real DB field, previously unread by any
  // public code path — see SunSkySubtab.tsx's own toggle) before a
  // visitor can actually drag this. Every project defaults to both off
  // today, so the common case renders the real panel read-only rather
  // than hiding it — see this session's own scoping decision.
  const sunTimeInteractive = viewerConfig.solarControllerEnabled && viewerConfig.viewerTimeControlEnabled;

  // The scrub range is the admin's own Sun Path → Start Time/End Time
  // again. It spent a while pinned to a hardcoded 06:00-21:00 (direct
  // instruction, 2026-08-17) while those two fields still showed and
  // still saved in the Experience Editor, so the editor was promising a
  // window the viewer ignored — visible even on an untouched project,
  // whose 6→20 default disagreed with the 6→21 constant. Reversed by
  // direct instruction, 2026-08-27: the editor is the source of truth.
  //
  // Reduced to whole hours here, once, so that every later consumer —
  // the slider's own `min`/`max`/`step`, the two end readouts, the live
  // readout, the presets, and the sun the engine actually renders — is
  // reading the same grid (direct instruction, 2026-08-27: "snap the
  // time in hours"). Everything downstream snaps through
  // `snapSunTimeHours`; nothing re-derives a grid of its own.
  const sunTimeWindow = useMemo<SunTimeWindow>(() => {
    // Start/End are two independent fields with no cross-validation in
    // the editor or the PATCH schema, so an inverted (14→5) or collapsed
    // (12→12) window is authorable — and a `<input type="range">` whose
    // max is below its min renders as a dead zero-width slider. Harmless
    // while the range was a constant; load-bearing now that it is not.
    const lo = Math.min(viewerConfig.viewerTimeStartHours, viewerConfig.viewerTimeEndHours);
    const hi = Math.max(viewerConfig.viewerTimeStartHours, viewerConfig.viewerTimeEndHours);
    const startHours = Math.min(Math.max(Math.round(lo), 0), 23);
    // The admin's Time Step is stored in minutes and is free-form (1-120);
    // anything under an hour becomes an hour rather than being ignored,
    // so a coarser authored step (2h, 3h) still means something.
    const stepHours = Math.max(1, Math.round(viewerConfig.viewerTimeStepMinutes / 60));
    // Land End on the grid rather than just rounding it: a max that is not
    // an integral number of steps above min is simply unreachable in a
    // native range input (the thumb stops at the last valid step while the
    // track still runs to the end), which would put the fill and the thumb
    // a whole step apart at the right-hand end. Rounding down keeps the
    // slider inside the authored window; the `MIN_..._WINDOW` floor keeps
    // it draggable when the window is narrower than one step.
    const spanHours = Math.max(stepHours, MIN_SUN_TIME_WINDOW_HOURS, Math.floor((Math.round(hi) - startHours) / stepHours) * stepHours);
    return { startHours, endHours: Math.min(24, startHours + spanHours), stepHours };
  }, [viewerConfig.viewerTimeStartHours, viewerConfig.viewerTimeEndHours, viewerConfig.viewerTimeStepMinutes]);

  // Snapped only where the visitor can actually scrub. A project with the
  // time control switched off renders a fixed, admin-authored sun (Sun &
  // Sky → "Viewer Time", authorable to the quarter-hour) and its scrub
  // window is inert — snapping there would silently re-light published
  // scenes whose default sits off the hour, or outside a window nobody
  // can reach anyway, to fix a bar nobody can drag.
  const effectiveSunTimeHours = sunTimeInteractive
    ? snapSunTimeHours(liveSunTimeHours ?? viewerConfig.viewerTimeHours, sunTimeWindow)
    : liveSunTimeHours ?? viewerConfig.viewerTimeHours;

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
  // Snapped onto the scrub window, not raw — see `snapSunTimePresets`.
  const sunTimePresets = useMemo(() => snapSunTimePresets(sunTimelinePresets(sunTimeline), sunTimeWindow), [sunTimeline, sunTimeWindow]);
  // What the dock's Time module takes: the same window, in the shape its
  // props already speak (`stepMinutes`, straight onto the range input's
  // own `step`).
  const sunTimeBounds = useMemo(
    () => ({ startHours: sunTimeWindow.startHours, endHours: sunTimeWindow.endHours, stepMinutes: sunTimeWindow.stepHours * 60 }),
    [sunTimeWindow]
  );

  // Snapped on the way in, so the hour grid holds for every writer at
  // once — the slider, keyboard arrows on it, and the per-frame values
  // `TimeContent`'s preset tween drives through here. That tween then
  // reads as a stepped hour-by-hour travel to its target rather than a
  // continuous slide, which is the point: one time-state, all of it on
  // the hour.
  const handleSunTimeChange = useCallback(
    (hours: number) => {
      setLiveSunTimeHours(snapSunTimeHours(hours, sunTimeWindow));
      setActiveSunPreset(null);
      viewerRef.current?.resetIdleTimer(); // Idle Drone Camera PRD §47 — scrubbing Time counts as interaction
    },
    [sunTimeWindow]
  );
  // `handleSunDateChange` (the live-date-override write path, PRD §29) was
  // removed as dead code alongside SunTimeWorkspace's own date picker
  // (direct design feedback, 2026-08-17: "Date to be removed") — no UI
  // anywhere calls it anymore. `liveSunDate`/`setLiveSunDate` themselves
  // stay real (still read below, and `handleSunTimeReset` still clears
  // them) — only the setter's own trigger is gone, so a future date
  // control can call `setLiveSunDate` directly without rebuilding
  // anything here.
  const handleSunPresetSelect = useCallback(
    (preset: SunTimePreset) => {
      // `sunTimePresets` hands out already-snapped hours; snapping again
      // costs nothing and means this stays correct for any other caller.
      setLiveSunTimeHours(snapSunTimeHours(preset.hour, sunTimeWindow));
      setActiveSunPreset(preset.id);
      viewerRef.current?.resetIdleTimer();
    },
    [sunTimeWindow]
  );
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

  // Settings → Quality (lib/viewerQuality.ts) — the visitor's own manual
  // override, layered on top of the published config here rather than
  // inside RenderEngine, so the engine keeps taking exactly one already-
  // resolved config per tab and the override stays visible in one place.
  // A no-op while the preference is "auto" (its default), which is why
  // every one of these three memos returns the untouched project config
  // for the visitor who never opens the control.
  const qualityConfig = useMemo(
    () =>
      applyViewerQuality(viewerQuality, {
        renderingMode: viewerConfig.renderingMode,
        qualityPreset: viewerConfig.qualityPreset,
        customRenderScale: viewerConfig.customRenderScale,
        customDprCap: viewerConfig.customDprCap,
        adaptiveQualityEnabled: viewerConfig.adaptiveQualityEnabled,
        runtimeQualityReductionEnabled: viewerConfig.runtimeQualityReductionEnabled,
        interactionQualityReductionEnabled: viewerConfig.interactionQualityReductionEnabled,
      }),
    [viewerConfig, viewerQuality]
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
      siteRotationDeg: viewerConfig.siteRotationDeg,
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
    () =>
      applyViewerQualityToLighting(viewerQuality, {
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
    [viewerConfig, viewerQuality]
  );

  const renderingConfig = useMemo(
    () =>
      applyViewerQualityToRendering(viewerQuality, {
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
        distanceBlurEnabled: viewerConfig.distanceBlurEnabled,
        distanceBlurStartM: viewerConfig.distanceBlurStartM,
        distanceBlurFullM: viewerConfig.distanceBlurFullM,
        distanceBlurAmount: viewerConfig.distanceBlurAmount,
        distanceBlurRadius: viewerConfig.distanceBlurRadius,
        cameraAutoFocusEnabled: viewerConfig.cameraAutoFocusEnabled,
        motionBlurEnabled: viewerConfig.motionBlurEnabled,
        motionBlurIntensity: viewerConfig.motionBlurIntensity,
        exposure: viewerConfig.exposure,
        toneMapping: viewerConfig.toneMapping,
        lutEnabled: viewerConfig.lutEnabled,
        lutPreset: viewerConfig.lutPreset,
        lutIntensity: viewerConfig.lutIntensity,
      }),
    [viewerConfig, viewerQuality]
  );

  // Units Blocks & POI Layer PRD — real appearance + master POI camera
  // config for the public viewer's own unit blocks (same shape/pattern as
  // every other *Config memo here).

  // "Map" tab — real-world site context as geometry inside this same
  // scene. There is no longer a separate map view to switch to: turning
  // the Map toggle on in the Experience Editor integrates the site here
  // directly. Coordinates come from the project record, never from
  // site-owned fields (Project.lat/lng is canonical — see
  // src/lib/projectLocation.ts).
  const siteConfig = useMemo(
    () => ({
      siteEnabled: viewerConfig.siteEnabled,
      siteRadiusM: viewerConfig.siteRadiusM,
      siteTerrainEnabled: viewerConfig.siteTerrainEnabled,
      siteImageryEnabled: viewerConfig.siteImageryEnabled,
      siteImageryBrightness: viewerConfig.siteImageryBrightness,
      siteOffsetX: viewerConfig.siteOffsetX,
      siteOffsetZ: viewerConfig.siteOffsetZ,
      siteElevationOffset: viewerConfig.siteElevationOffset,
      siteRotationDeg: viewerConfig.siteRotationDeg,
      siteScale: viewerConfig.siteScale,
      latitude: project.coords?.lat ?? null,
      longitude: project.coords?.lng ?? null,
    }),
    [viewerConfig, project.coords]
  );
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
      // No mobile-only override here any more. This briefly carried one —
      // forcing the selected fill on and the outline wider below `lg` —
      // because at the then-shipped defaults "selected" was a +0.14 opacity
      // bump in the unit's own status hue plus a 1px outline, which is not
      // a highlight on a phone. That was treating the symptom on one
      // breakpoint: the defaults themselves were wrong, and an override
      // here also meant the admin's own preview could never match what a
      // visitor saw. The defaults now carry it (migration
      // 20260825000000_unit_selection_legibility_defaults), so every device
      // and the editor all render the same thing, and a project that wants
      // something different genuinely gets what it configured.
      unitBlocksSelectedOutlineWidth: viewerConfig.unitBlocksSelectedOutlineWidth,
      unitBlocksSelectedScaleEnabled: viewerConfig.unitBlocksSelectedScaleEnabled,
      unitBlocksSelectedScale: viewerConfig.unitBlocksSelectedScale,
      unitBlocksSelectedFillEnabled: viewerConfig.unitBlocksSelectedFillEnabled,
      unitColorSelectedFill: viewerConfig.unitColorSelectedFill,
      unitBlocksSelectedXrayEnabled: viewerConfig.unitBlocksSelectedXrayEnabled,
      unitPoiCameraEnabled: viewerConfig.unitPoiCameraEnabled,
      unitPoiCameraFov: viewerConfig.unitPoiCameraFov,
      unitPoiCameraDistanceMultiplier: viewerConfig.unitPoiCameraDistanceMultiplier,
      unitPoiCameraHeightOffset: viewerConfig.unitPoiCameraHeightOffset,
      unitPoiTransitionMs: viewerConfig.unitPoiTransitionMs,
      unitPoiAutoOcclusionCorrection: viewerConfig.unitPoiAutoOcclusionCorrection,
    }),
    [viewerConfig]
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
    // Dismissing to `null` never needs to do anything about the cut: with no
    // unit selected the card is off screen, so `floorExitOpen` is true by
    // derivation and the pill is already the control.
    if (!followFloorCutToUnit(unitId)) dropFloorCutIfUncontrolled(activeModule, unitId);
    setSelectedUnitId(unitId);
    resetDetailOnDismiss(unitId);
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
  }, [
    isDesktop,
    activeModule,
    followFloorCutToUnit,
    dropFloorCutIfUncontrolled,
    resetDetailOnDismiss,
  ]);

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
    // Same rule as `handleSelectUnit` — this is the "clicking outside" path
    // (the engine reports a click on empty space as a null hit), and it is the
    // one the retract instruction was written about.
    if (!followFloorCutToUnit(unitId)) dropFloorCutIfUncontrolled(activeModule, unitId);
    setSelectedUnitId(unitId);
    resetDetailOnDismiss(unitId);
    setUnmappedUnitId(null);
  }, [
    activeModule,
    followFloorCutToUnit,
    dropFloorCutIfUncontrolled,
    resetDetailOnDismiss,
  ]);

  return (
    <div
      id="main-content"
      ref={mainRef}
      data-viewer-channel={channel}
      // `shrink-0` matters: <body> is a flex column, and a flex item's
      // default `flex-shrink: 1` + `min-height: auto` means ANY sibling
      // with real height squeezes this root below the `h-viewport` it asks
      // for — which lifts the dock off the bottom of the screen and
      // exposes body's own background beneath it. Nothing does that
      // today (this is body's last child, and the overlays around it in
      // the root layout render null or fixed), but the failure is
      // silent, device-specific and exactly the shape of the iOS report
      // that `html:has([data-viewer-channel])` in globals.css fixes.
      className="relative flex h-viewport w-full shrink-0 overflow-hidden bg-neutral-900"
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
        {(
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
            {/* The floor rail. Anchored to THIS wrapper's left edge, not
                the page's — the wrapper is the flex sibling that
                UnitsWorkspace narrows, so the rail automatically sits just
                right of the units list and slides across with it as that
                panel opens and closes, instead of being covered by it
                (2026-08-25 decision: "rail right of the panel").

                Units-module-only, and only when this project actually has
                sections to cut with: without them every row would be a
                dead number, which is worse than no rail at all. */}
            {activeModule === "units" && floorSectionsAvailable && (
              <div
                // Measured by UnitPreviewCard, which reserves the room to the
                // right of this rail so its expanded state can never grow
                // across the floor numbers on a phone.
                data-viewer-floor-rail
                className="pointer-events-none absolute left-3 top-1/2 z-30 -translate-y-1/2 pl-[env(safe-area-inset-left)] sm:left-4"
              >
                <FloorRail
                  buildings={floorRailBuildings}
                  activeSectionId={activeFloorSectionId}
                  selectedFloorId={selectedFloorId}
                  onSelectFloor={handleSelectFloor}
                  isTouch={!isDesktop}
                />
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
        {!unitCardOpen && (compareCount > 0 || (!unitPanelOpen && project.status === "under_construction")) && (
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

        {screenshotFlash && (
          <div className="glass-panel-dark pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-pill px-4 py-2 text-xs font-semibold text-white sm:top-20">
            {t(screenshotFlash === "success" ? "project.screenshotSaved" : "project.screenshotFailed")}
          </div>
        )}

        {fullscreenUnsupported && (
          <div className="glass-panel-dark pointer-events-none absolute left-1/2 top-16 z-30 -translate-x-1/2 rounded-pill px-4 py-2 text-xs font-semibold text-white sm:top-20">
            {t("project.fullscreenUnavailable")}
          </div>
        )}

        {(
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
              siteConfig={siteConfig}
              onUnitClick={handleUnitClickIn3D}
              onReady={handleReady}
              onRendererFacts={setRendererFacts}
              // `showPerfStats` is the real gate — the engine samples
              // nothing while it is false, so no visitor pays for this.
              // `onPerfStats` is passed unconditionally on purpose:
              // `ThreeProjectViewer` builds the engine's callback object
              // ONCE at mount and closes over whatever this prop was in
              // that render (the same first-render-capture hazard its
              // `onUnitClick`/`onSiteStatus` refs already exist for), so
              // a conditional `undefined` here would be frozen in as
              // undefined and no sample would ever arrive — which is
              // exactly what the first version of this panel showed:
              // every performance row stuck on "—". A `useState` setter
              // has a stable identity, so passing it always is free.
              showPerfStats={diagOpen}
              onPerfStats={setDiagStats}
              className="relative h-full w-full"
            />
            {diagOpen && <ViewerDiagnostics facts={rendererFacts} stats={diagStats} />}
          </div>
        )}
        {(
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
      {(cardUnit || floorExitOpen) && (
        // One card in THREE states, not three components — "View Unit" morphs
        // this same shell open in place and a dismissal that would strand a
        // floor cut morphs it down to a pill (see UnitPreviewCard's own doc
        // comment), so it can never unmount mid-animation. `floorExitOpen`
        // alone mounts it straight into the pill state, which is what a cut
        // opened from the floor rail — with no unit ever selected — needs.
        <UnitPreviewCard
          project={project}
          unit={cardUnit}
          expanded={fullDetailOpen}
          retracted={!unitCardOpen}
          floorSectionName={floorSectionForSelectedUnit?.name ?? null}
          floorSectionActive={
            !!floorSectionForSelectedUnit && floorSectionForSelectedUnit.id === activeFloorSectionId
          }
          onViewInFloor={handleToggleFloorSection}
          onExitFloor={handleExitFloorFromPill}
          exitFloorLabel={exitFloorLabel}
          exitFloorTitle={exitFloorTitle}
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
