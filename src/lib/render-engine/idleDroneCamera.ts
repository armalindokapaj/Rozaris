import * as THREE from "three/webgpu";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Project3DConfig } from "@/lib/types";

/**
 * Idle Drone Camera PRD §13-14 — "Create idleDroneCamera.ts. Do not place
 * all calculations directly inside RenderEngine.ts... The controller owns
 * idle detection/activation/deactivation, orbit angle, base radius/
 * altitude/target, the height/distance/target waves, smoothing, safe
 * limits, preview mode, path visualization. It must not own the Three.js
 * renderer itself." A real, deliberate exception to this directory's
 * usual "pure stateless functions, RenderEngine.ts owns all mutable
 * state" convention (see sections.ts/unitRegistry.ts) — the PRD spells
 * out a self-contained stateful controller explicitly, so this one class
 * owns its own runtime state instead of RenderEngine holding another
 * dozen flat private fields for it.
 *
 * Replaces the old `OrbitControls.autoRotate` idle behavior (flat spin,
 * fixed altitude/distance) with a procedural "architectural drone" orbit:
 * rise/fall, breathe distance, a drifting look-target — all scaled off
 * the project's own bounds so one set of admin sliders looks right on a
 * villa and a tower alike (PRD §21).
 */

export type IdleDroneConfig = Pick<
  Project3DConfig,
  | "idleDroneEnabled"
  | "idleDroneDelaySec"
  | "idleDroneOrbitDurationSec"
  | "idleDroneClockwise"
  | "idleDroneMotionEnabled"
  | "idleDroneHeightEnabled"
  | "idleDroneHeightAmplitude"
  | "idleDroneDistanceEnabled"
  | "idleDroneDistanceAmplitude"
  | "idleDroneTargetEnabled"
  | "idleDroneTargetAmplitude"
  | "idleDroneVerticalCycles"
  | "idleDronePhaseOffsetDeg"
  | "idleDroneSmoothness"
>;

export interface IdleDroneBounds {
  center: THREE.Vector3;
  /** World-space Y extent of the loaded content — the "40m building"/
   * "12m building" §21 normalizes height/target amplitude against. */
  buildingHeight: number;
  /** Lowest point of the loaded content — the floor the §32 minimum-
   * height safety margin is measured up from. */
  groundMinY: number;
  boundingRadius: number;
}

export interface IdleDroneStepOptions {
  /** An explicit POI/Shot transition is in flight — PRD §18: those always
   * preempt the drone outright. */
  transitionInFlight: boolean;
  prefersReducedMotion: boolean;
  tabHidden: boolean;
}

const TWO_PI = Math.PI * 2;
/** §33 — "1.25x boundingRadius to 2.5x" working range; the ceiling comes
 * from the live OrbitControls.maxDistance instead (§34, "respect existing
 * camera constraints") rather than a second hardcoded multiplier here. */
const MIN_DISTANCE_RADIUS_MULTIPLIER = 1.25;
/** §32 — "approximately 10-15%" of building height above the content's
 * lowest point. */
const MIN_HEIGHT_SAFETY_RATIO = 0.12;
/** §19 "~1.5-2.5 seconds" blend — not a separate timed state machine here
 * (see this module's own doc comment for why), just the slow end of the
 * smoothness→time-constant mapping below, so the gentlest default
 * (smoothness 0.88) lands inside that recommended window. */
const SMOOTHING_TAU_MIN_SEC = 0.05;
const SMOOTHING_TAU_MAX_SEC = 2.2;

/** §26 "different frequencies/phase offsets/amplitudes" — deliberately
 * distinct per wave so height/distance/target never crest together
 * (which would read as robotic, per the PRD's own warning). Height uses
 * the admin's own `verticalCycles`; distance/target get fixed, mutually
 * irrational-ish ratios against it. */
const DISTANCE_WAVE_FREQUENCY = 0.5;
const DISTANCE_WAVE_PHASE = 1.3;
const TARGET_WAVE_FREQUENCY = 0.75;
const TARGET_WAVE_PHASE = 2.6;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Frame-rate independent exponential smoothing factor for the given
 * dt — see `step()`'s own doc comment for why "smoothness" is mapped to
 * a time constant rather than used as a raw per-frame lerp factor. */
function dampingFactor(smoothness: number, dtSeconds: number): number {
  const tau = SMOOTHING_TAU_MIN_SEC + clamp(smoothness, 0, 1) * (SMOOTHING_TAU_MAX_SEC - SMOOTHING_TAU_MIN_SEC);
  return 1 - Math.exp(-dtSeconds / tau);
}

export class IdleDroneController {
  private config: IdleDroneConfig | null = null;
  private bounds: IdleDroneBounds | null = null;

  private active = false;
  private preview = false;
  private suspended = false;
  private lastInteractionAt = 0;
  private angle = 0;
  private baseDistance = 0;
  private baseHeight = 0;

  setConfig(config: IdleDroneConfig) {
    this.config = config;
  }

  setBounds(bounds: IdleDroneBounds) {
    this.bounds = bounds;
  }

  /** PRD §16-17/§64 — any meaningful interaction (canvas orbit/pan/zoom,
   * a unit click, an explicit camera transition starting, an outside-
   * canvas UI trigger like a Shot/View select) calls this. Deactivates
   * immediately with no animate-back — the camera is already wherever it
   * physically is, so OrbitControls simply resumes owning it from there. */
  notifyInteraction(now: number) {
    this.lastInteractionAt = now;
    this.active = false;
    this.preview = false;
  }

  /** PRD §45-47 — Units/Views/Sun&Time modes suspend the drone entirely
   * (not just reset the timer) for as long as the visitor stays there. */
  setSuspended(suspended: boolean) {
    this.suspended = suspended;
    if (suspended) this.active = false;
  }

  /** PRD §36-37 — Editor "Preview Drone Camera" button; ignores the idle
   * delay and activates immediately using whatever config was last set
   * (the live unsaved draft, since the editor's viewport always receives
   * the current draft's cameraConfig). */
  startPreview() {
    this.preview = true;
    this.active = true;
  }

  stopPreview() {
    this.preview = false;
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  /** §19 steps 1-4 — captures the live camera as the orbit's own entry
   * point: current angle (relative to project center), current distance/
   * altitude become `baseDistance`/`baseHeight` for the rest of this
   * activation (§63 — never reset to a default framing). Both clamped
   * once here into the safe working range (§32-34) rather than every
   * frame, so a visitor who was already outside the "ideal" band doesn't
   * get yanked there abruptly — the continuous damping in `step()` eases
   * toward it smoothly instead. */
  private activate(camera: THREE.PerspectiveCamera, controls: OrbitControls, bounds: IdleDroneBounds) {
    const dx = camera.position.x - bounds.center.x;
    const dz = camera.position.z - bounds.center.z;
    this.angle = Math.atan2(dx, dz);

    const minDistance = Math.max(bounds.boundingRadius * MIN_DISTANCE_RADIUS_MULTIPLIER, controls.minDistance);
    const maxDistance = Number.isFinite(controls.maxDistance) ? controls.maxDistance : minDistance * 2;
    this.baseDistance = clamp(Math.hypot(dx, dz), Math.min(minDistance, maxDistance), Math.max(minDistance, maxDistance));

    const minY = bounds.groundMinY + bounds.buildingHeight * MIN_HEIGHT_SAFETY_RATIO;
    this.baseHeight = Math.max(camera.position.y, minY);

    this.active = true;
  }

  /** The per-frame heart (RenderEngine's animation loop calls this right
   * after stepCameraTransition, PRD §52). Writes `camera.position`/
   * `controls.target` in place when — and only when — the drone is
   * actually driving the camera this frame; a plain no-op otherwise, so
   * OrbitControls (or an explicit transition) stays the sole authority
   * the rest of the time. */
  step(now: number, dtSeconds: number, camera: THREE.PerspectiveCamera, controls: OrbitControls, opts: IdleDroneStepOptions) {
    const { config, bounds } = this;
    if (!config || !bounds) return; // §61 — no bounds yet, skip entirely rather than guess
    if (opts.transitionInFlight) return; // §18 — explicit POI/Shot transition always wins
    if (opts.tabHidden) return; // §50 — pause, don't burn the idle clock or move the camera off-screen
    if (this.suspended) return; // §45-47

    if (!this.preview) {
      if (!config.idleDroneEnabled || opts.prefersReducedMotion) {
        this.active = false; // §49 — reduced-motion disables the automatic system outright
        return;
      }
      if (!this.active) {
        const idleForMs = now - this.lastInteractionAt;
        if (idleForMs < config.idleDroneDelaySec * 1000) return;
        this.activate(camera, controls, bounds);
      }
    } else if (!this.active) {
      this.activate(camera, controls, bounds);
    }

    const orbitDurationSec = Math.max(1, config.idleDroneOrbitDurationSec);
    const angularSpeed = (TWO_PI / orbitDurationSec) * (config.idleDroneClockwise ? 1 : -1);
    this.angle += angularSpeed * dtSeconds;

    const phase = THREE.MathUtils.degToRad(config.idleDronePhaseOffsetDeg);
    const motionOn = config.idleDroneMotionEnabled;

    const heightWave = Math.sin(this.angle * Math.max(1, config.idleDroneVerticalCycles) + phase);
    const heightAmplitude = bounds.buildingHeight * clamp(config.idleDroneHeightAmplitude, 0, 1);
    const heightOn = motionOn && config.idleDroneHeightEnabled;
    let desiredY = this.baseHeight + (heightOn ? heightWave * heightAmplitude : 0);
    const minY = bounds.groundMinY + bounds.buildingHeight * MIN_HEIGHT_SAFETY_RATIO;
    desiredY = Math.max(desiredY, minY);

    const distanceWave = Math.sin(this.angle * DISTANCE_WAVE_FREQUENCY + phase + DISTANCE_WAVE_PHASE);
    const distanceOn = motionOn && config.idleDroneDistanceEnabled;
    let desiredDistance = this.baseDistance * (1 + (distanceOn ? distanceWave * clamp(config.idleDroneDistanceAmplitude, 0, 1) : 0));
    const minDistance = Math.max(bounds.boundingRadius * MIN_DISTANCE_RADIUS_MULTIPLIER, controls.minDistance);
    const maxDistance = Number.isFinite(controls.maxDistance) ? controls.maxDistance : minDistance * 2;
    desiredDistance = clamp(desiredDistance, Math.min(minDistance, maxDistance), Math.max(minDistance, maxDistance));

    const targetWave = Math.sin(this.angle * TARGET_WAVE_FREQUENCY + phase + TARGET_WAVE_PHASE);
    const targetOn = motionOn && config.idleDroneTargetEnabled;
    const targetOffsetY = bounds.buildingHeight * clamp(config.idleDroneTargetAmplitude, 0, 1) * (targetOn ? targetWave : 0);

    const desiredX = bounds.center.x + Math.sin(this.angle) * desiredDistance;
    const desiredZ = bounds.center.z + Math.cos(this.angle) * desiredDistance;

    // §29 — never snap; exponential damping toward the instantaneous
    // procedural pose. "Smoothness" is a 0-1 admin knob, not a raw
    // per-frame lerp factor: mapped to a damping TIME CONSTANT
    // (dampingFactor's own doc comment) so higher smoothness reads as
    // genuinely slower/gentler motion, matching the slider's label.
    const k = dampingFactor(config.idleDroneSmoothness, dtSeconds);
    camera.position.x = THREE.MathUtils.lerp(camera.position.x, desiredX, k);
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, desiredY, k);
    camera.position.z = THREE.MathUtils.lerp(camera.position.z, desiredZ, k);
    controls.target.x = THREE.MathUtils.lerp(controls.target.x, bounds.center.x, k);
    controls.target.y = THREE.MathUtils.lerp(controls.target.y, bounds.center.y + targetOffsetY, k);
    controls.target.z = THREE.MathUtils.lerp(controls.target.z, bounds.center.z, k);
    // §30 — stable horizon always; the drone never touches camera.up or
    // introduces roll.
  }

  /** PRD §38-39 — editor-only path helper: three horizontal rings (high/
   * mid/low, using the height wave's own amplitude) so an admin can see
   * the orbit's real shape before previewing it. Pure sampling, no THREE
   * scene objects created here (RenderEngine owns that, same "engine
   * modules stay side-effect-free" split as sections.ts). */
  getPathPoints(samples = 64): { high: THREE.Vector3[]; mid: THREE.Vector3[]; low: THREE.Vector3[] } | null {
    const { config, bounds } = this;
    if (!config || !bounds) return null;
    const distance = Math.max(bounds.boundingRadius * MIN_DISTANCE_RADIUS_MULTIPLIER, this.baseDistance || bounds.boundingRadius * 1.6);
    const heightAmplitude = config.idleDroneHeightEnabled && config.idleDroneMotionEnabled ? bounds.buildingHeight * clamp(config.idleDroneHeightAmplitude, 0, 1) : 0;
    const baseY = this.baseHeight || bounds.center.y + bounds.buildingHeight * 0.5;
    const ring = (y: number) => {
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= samples; i++) {
        const a = (i / samples) * TWO_PI;
        pts.push(new THREE.Vector3(bounds.center.x + Math.sin(a) * distance, y, bounds.center.z + Math.cos(a) * distance));
      }
      return pts;
    };
    return { high: ring(baseY + heightAmplitude), mid: ring(baseY), low: ring(Math.max(bounds.groundMinY + bounds.buildingHeight * MIN_HEIGHT_SAFETY_RATIO, baseY - heightAmplitude)) };
  }

  /** Full reset — RenderEngine.dispose() calls this so a later mount()
   * (e.g. re-entering the editor) starts clean rather than resuming a
   * stale angle/base pose from the previous session. */
  reset() {
    this.config = null;
    this.bounds = null;
    this.active = false;
    this.preview = false;
    this.suspended = false;
    this.lastInteractionAt = 0;
    this.angle = 0;
    this.baseDistance = 0;
    this.baseHeight = 0;
  }
}
