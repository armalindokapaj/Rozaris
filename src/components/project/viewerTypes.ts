import type { CameraConfig, QualityConfig } from "@/lib/render-engine/RenderEngine";
import type { CameraPreset, EnvironmentConfig, LightingConfig, ProjectDetailModel, RenderingConfig, Section, Unit } from "@/lib/types";

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
   * isn't ready (e.g. WebGPU/WebGL2 init failed). */
  captureScreenshot: () => string | null;
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
  /** Sections (PRD §34-36) — real clip + cap, or null to clear. */
  activateSection: (section: Section | null) => void;
  /** Real world-space bounds of the currently loaded content — used to
   * place a new Section sensibly instead of defaulting to world origin. */
  getContentBounds: () => { centerX: number; centerZ: number; minY: number; maxY: number; sizeX: number; sizeZ: number } | null;
  /** Performance tab (PRD §40) — real current renderScale post any
   * adaptive/interaction reduction. */
  getEffectiveRenderScale: () => number;
  /** Units Search Mode PRD, Phase 3 — highlights the given unit's mesh
   * (SELECTED_COLOR override) if this project's published model has a
   * real mesh link for it; null clears the highlight. No-op (safely) on a
   * project with no unit mesh links authored yet. */
  setSelectedUnit: (unitId: string | null) => void;
}

export interface ThreeProjectViewerProps {
  /** Every published detail GLB slot ("Building", "Surroundings", ...) —
   * caller-supplied, not fetched internally (public page uses
   * useProjectDetailModel; the admin editor supplies its own
   * draft-aware array). Empty is a valid "nothing published yet" state. */
  detailModels: { slotId: string; model: ProjectDetailModel; units?: Unit[]; statusPreviewEnabled?: boolean }[];
  className?: string;
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
