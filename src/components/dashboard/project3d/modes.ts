/** The editor shell's top-level modes, shown as tabs in the full-width top
 * tab bar. "Sections" (first-class Configurator module, 2026-08-13) sits
 * before "Inventory" — it creates and controls the cut; Inventory only
 * consumes the floor identity a section can optionally carry
 * (`Section.floorId`). Order: Model / Materials / Sky / Ocean / Camera /
 * Sections / Inventory / Effects / Viewer.
 *
 * "lighting" was replaced outright by "ocean" (2026-08-14, user request)
 * — the old Lighting tab's 7 sub-tabs (Sun & Time/Sky/Water/Volumetric
 * Cloud/Environment/Effects/Exposure, itself a whole geographic-sun/HDRI/
 * lensflare/light-probe/motion-blur system) are gone; the new "Ocean" tab
 * shows exactly webgl_shaders_ocean.html's own GUI — Sky (elevation/
 * azimuth/exposure), Water (distortionScale/size), Bloom (strength/
 * radius), Clouds (coverage/density/elevation) — nothing else. Ground/
 * Fog/Environment Intensity moved to Effects; Logarithmic Depth moved to
 * Camera; LUT (kept, expanded to the reference demo's full 9-preset GUI
 * per explicit user request) stays on Effects too.
 *
 * "sky" is a separate, later addition (same day) — webgl_shaders_sky.html
 * parity, added *alongside* Ocean rather than merged into it: same
 * elevation/azimuth/exposure fields (reused, not duplicated), plus the
 * demo's remaining turbidity/rayleigh/mieCoefficient/mieDirectionalG
 * params (previously one fixed constant, now real per-project fields),
 * plus a Rozaris-specific on/off switch the demo itself doesn't have. */
export const EDITOR_MODES = [
  "model",
  "materials",
  "sky",
  "ocean",
  "camera",
  "sections",
  "inventory",
  "effects",
  "viewer",
] as const;

export type EditorMode = (typeof EDITOR_MODES)[number];
