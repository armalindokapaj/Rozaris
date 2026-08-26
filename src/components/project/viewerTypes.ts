import type { CameraConfig, DetailModelEntry, QualityConfig, RenderEngineCallbacks } from "@/lib/render-engine/RenderEngine";
import type {
  CameraPreset,
  EnvironmentConfig,
  LightingConfig,
  RenderingConfig,
  Section,
  SiteRuntimeConfig,
  UnitsConfig,
} from "@/lib/types";

/**
 * ThreeProjectViewer's imperative handle + props contract — ground-up
 * rebuild (2026-08-15, Experience Editor v2). Deliberately a smaller
 * surface than the pre-rebuild version: Sections gizmo entry points, saved
 * camera-preset reads, and the shadow-map debug HUD all come back in later
 * phases (Sections/Camera/Lighting tabs) once those features exist again.
 * Kept in its own module, same reasoning as before — avoids a circular
 * import between ThreeProjectViewer.tsx and its call sites.
 */
export interface ThreeProjectViewerHandle {
  /** Reframes the camera on the currently loaded content. */
  resetView: () => void;
  /** Captures the current frame as a PNG data URL — null if the renderer
   * isn't ready (e.g. WebGPU/WebGL2 init failed) or the capture itself
   * failed. Async — see RenderEngine.captureScreenshot's own doc comment
   * for why (WebGPU's canvas presentation isn't synchronous with
   * `render()` returning). */
  captureScreenshot: () => Promise<string | null>;
  /** Scene tab's "Ground Align" (PRD §5) — the Y offset that would put
   * the given slot's lowest point at world Y=0, at its current transform.
   * Null if that slot isn't loaded (or the renderer isn't ready). */
  computeGroundAlignOffset: (slotId: string) => number | null;
  /** Shots (PRD §38) — the live camera's current position/target/fov. */
  getCameraState: () => { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number }; fov: number } | null;
  /** Shots (PRD §38) — smoothly transitions to a saved viewpoint. */
  flyToPreset: (preset: CameraPreset) => void;
  /** Shots (PRD §38) — wireframe frustum preview for a saved Shot; null
   * clears it. */
  showCameraHelperFor: (preset: CameraPreset | null) => void;
  /** Sections (PRD §34-36) — real clip + cap, or null to clear.
   * `showIndicator: false` (the public viewer) drops the translucent
   * editing-aid rectangle a `fillGapsEnabled: false` section otherwise
   * draws — see RenderEngine.activateSection's own doc comment. */
  activateSection: (section: Section | null, options?: { showIndicator?: boolean }) => void;
  /** Real world-space bounds of the currently loaded content — used to
   * place a new Section sensibly instead of defaulting to world origin. */
  getContentBounds: () => { centerX: number; centerZ: number; minY: number; maxY: number; sizeX: number; sizeZ: number } | null;
  /** Performance tab (PRD §40) — real current renderScale post any
   * adaptive/interaction reduction. */
  getEffectiveRenderScale: () => number;
  /** Units Search Mode PRD, Phase 3 / Units Blocks & POI Layer PRD §18-20
   * — highlights the given unit's block (status-color fill + purple
   * outline) if this project's published model has a real mesh link for
   * it; null clears the highlight. No-op (safely) on a project with no
   * unit mesh links authored yet. */
  setSelectedUnit: (unitId: string | null) => void;
  /** §18 — master Units-mode toggle; unit blocks are only visible AND
   * clickable/hoverable while this is on. */
  setUnitsMode: (enabled: boolean) => void;
  /** §18/§13 — per-status show/hide within Units mode. */
  setUnitStatusFilters: (filters: { available: boolean; reserved: boolean; sold: boolean }) => void;
  /** The non-status half of the Units workspace's filter state (Surface/
   * Rooms/Price/Floor/Building/search), as the ids that currently match;
   * `null` when none of those fields is narrowing anything. See
   * `RenderEngine.setUnitIdFilter`'s own doc comment. */
  setUnitIdFilter: (unitIds: string[] | null) => void;
  /** §18 — hides every unit block except the given one; null clears it. */
  isolateUnit: (unitId: string | null) => void;
  /** §18 — hover highlight, independent of selection. */
  hoverUnit: (unitId: string | null) => void;
  /** §16-17 — flies the camera to the given unit's POI framing. Returns
   * false (no-op) if the unit isn't loaded/mapped or has its own POI
   * camera disabled. */
  focusUnit: (unitId: string) => boolean;
  /** Where a unit currently sits in the camera's frame — used to decide
   * whether a list selection needs to move the camera at all. Null when
   * the unit has no block in the loaded model. See
   * RenderEngine.getUnitViewportState. */
  getUnitViewportState: (unitId: string) => { onScreen: boolean; coverage: number; poiAuthored: boolean } | null;
  /** Centres and dollies onto a unit along the CURRENT viewing direction,
   * without using its authored POI camera — the safe framing for a unit
   * nobody has aimed. See RenderEngine.revealUnit. */
  revealUnit: (unitId: string, screenBiasY?: number) => boolean;
  /** The same framing aimed at a whole floor's worth of units at once —
   * the floor rail's camera move. False when none of the ids have a block
   * in the loaded model. See RenderEngine.revealUnits. */
  revealUnits: (unitIds: string[], screenBiasY?: number, frameFraction?: number) => boolean;
  /** Frames a bare world-space region — the floor rail's fallback when a
   * floor's units are unmapped and the admin's section footprint is the
   * only thing that knows where that floor is. See RenderEngine.revealArea. */
  revealArea: (
    area: { centerX: number; centerZ: number; y: number; radius: number },
    screenBiasY?: number,
    frameFraction?: number
  ) => boolean;
  /** §18 — clears selection/isolation and reframes on the whole scene. */
  resetUnitCamera: () => void;
  /** Read-only — every unit currently resolved in the live registry
   * (loaded GLB + confirmed mapping), for a caller that wants to show
   * "N mapped / loaded" without duplicating the engine's own resolution
   * logic. */
  getUnitRegistrySnapshot: () => { unitId: string; unitCode: string; poiYawDeg: number }[];
  /** Idle Drone Camera PRD §16-17 — any outside-canvas UI trigger (Views/
   * Shot select, Sun&Time scrub, a unit picked from a list, returning to
   * Explore) calls this so the next idle window starts fresh instead of
   * firing off a stale timestamp. */
  resetIdleTimer: () => void;
  isIdleDroneActive: () => boolean;
  /** §45-47 — Units/Views/Sun&Time modes suspend the drone for as long as
   * the visitor stays there. */
  setIdleDroneSuspended: (suspended: boolean) => void;
  /** §36-37 — Editor "Preview Drone Camera": ignores the idle delay,
   * activates immediately with the live (unsaved) draft settings. */
  previewIdleDrone: () => void;
  stopIdleDronePreview: () => void;
  /** §38-39 — editor-only orbit-path helper; a no-op scene-wise for the
   * public viewer, which never calls this. */
  setShowDronePath: (enabled: boolean) => void;
}

export interface ThreeProjectViewerProps {
  /** Every published detail GLB slot ("Building", "Surroundings", ...) —
   * caller-supplied, not fetched internally (public page uses
   * useProjectDetailModel; the admin editor supplies its own
   * draft-aware array). Empty is a valid "nothing published yet" state. */
  detailModels: DetailModelEntry[];
  className?: string;
  /** Units tab — appearance + master POI camera, applied live (no
   * remount), same pattern as environmentConfig/lightingConfig/
   * renderingConfig below. */
  unitsConfig?: UnitsConfig;
  /** "Map" tab — real-world site context as scene geometry. Optional so
   * every caller that predates the feature keeps compiling and simply
   * renders no site. */
  siteConfig?: SiteRuntimeConfig;
  onSiteStatus?: RenderEngineCallbacks["onSiteStatus"];
  /** §19-20 — real 3D-click/hover on a unit block. Optional: the editor's
   * own live-preview viewport doesn't need to wire these (it drives
   * selection from the Units tab's own list instead). */
  onUnitClick?: (unitId: string | null) => void;
  onUnitHover?: (unitId: string | null) => void;
  /** Camera tab (PRD §37) — applied live, no remount when it changes. */
  cameraConfig?: CameraConfig;
  /** Performance tab (PRD §40) — applied live, except renderingMode
   * (triggers a real remount — see RenderEngine.setQualityConfig). */
  qualityConfig?: QualityConfig;
  /** Environment tab (PRD §7-13) — Sun & Sky/Clouds/Fog & Haze/Water/
   * Ground, applied live, no remount (RenderEngine.setEnvironmentConfig). */
  environmentConfig?: EnvironmentConfig;
  /** Lighting tab (PRD §14-21) — Sun Light/Shadows/CSM/Global Illumination/
   * Artificial Lights/Volumetric Lighting, applied live, no remount
   * (RenderEngine.setLightingConfig). */
  lightingConfig?: LightingConfig;
  /** Rendering tab (PRD §22-33) — Reflections/Anti-Aliasing/Camera FX/
   * Color, applied live except `antialiasEnabled` (TRAA, triggers a real
   * remount — see RenderEngine.setRenderingConfig). */
  renderingConfig?: RenderingConfig;
  /** Admin-only debug overlay (fps/frame time/draw calls/triangles/dpr) —
   * real telemetry, sampled a few times a second while on. Off by default. */
  showPerfStats?: boolean;
  onPerfStats?: (
    stats: {
      fps: number;
      frameTimeMs: number;
      drawCalls: number;
      triangles: number;
      textures: number;
      dpr: number;
    } | null
  ) => void;
  /** Front Page PRD §12 (First Load Sequence, Stage 2) — fires once, the
   * first time the initial `syncModels()` call resolves (renderer mounted
   * *and* whatever detail models were passed have loaded onto the scene,
   * including the trivial "zero published slots" case). Never fires again
   * after that, even if `detailModels` changes later and re-triggers
   * `syncModels()`. Pass a stable (e.g. `useCallback`-wrapped) function —
   * it's intentionally left out of the effect's dependency array, same
   * convention as the mount effect above. */
  onReady?: () => void;
}
