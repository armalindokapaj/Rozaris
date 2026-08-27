/**
 * RZ-VIEWER-FX-01 — the `?fx=` pass-bisect override. Run with
 * `npm run test:effect-overrides`. Pure functions, no browser, no server.
 *
 * Why this is worth a test at all: this override exists to be reached by a
 * hand-typed URL on a phone that is already rendering wrong, by someone
 * who cannot see a console. Every failure mode here is silent — a typo
 * that parses as "disable everything", or an override that turns a pass
 * ON, would send the next debugging session down a false trail and look
 * exactly like a device bug. The one invariant that actually matters is
 * the last case below: an override can only ever SUBTRACT.
 */
import {
  BISECTABLE_EFFECTS,
  applyEffectOverridesToLighting,
  applyEffectOverridesToRendering,
  formatEffectOverrides,
  parseEffectOverrides,
  type EffectName,
} from "../src/lib/viewerEffectOverrides";
import type { LightingConfig, RenderingConfig } from "../src/lib/types";

let pass = 0;
let fail = 0;
function ok(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
}

console.log("\n1. parsing");
ok("no parameter disables nothing", parseEffectOverrides("").size === 0);
ok("an unrelated query disables nothing", parseEffectOverrides("?diag=1").size === 0);
ok("`-gi` disables exactly gi", (() => {
  const s = parseEffectOverrides("?fx=-gi");
  return s.size === 1 && s.has("gi");
})());
ok("the leading dash is optional", parseEffectOverrides("?fx=gi").has("gi"));
ok("a comma list disables each one", (() => {
  const s = parseEffectOverrides("?fx=-gi,-ssr,-traa");
  return s.size === 3 && s.has("gi") && s.has("ssr") && s.has("traa");
})());
ok("whitespace and case are tolerated", parseEffectOverrides("?fx= -GI , -SSR ").size === 2);
ok("`none` disables every bisectable pass", parseEffectOverrides("?fx=none").size === BISECTABLE_EFFECTS.length);
// A typo must degrade to "no override", never to a black viewer.
ok("an unknown token is ignored, not fatal", parseEffectOverrides("?fx=-nonsense").size === 0);
ok("an unknown token does not poison its neighbours", parseEffectOverrides("?fx=-nonsense,-gi").has("gi"));

console.log("\n2. round-tripping (the diagnostics panel's links)");
ok("format -> parse is identity", (() => {
  const original = new Set<EffectName>(["gi", "ssr"]);
  const back = parseEffectOverrides(`?fx=${formatEffectOverrides(original)}`);
  return back.size === 2 && back.has("gi") && back.has("ssr");
})());
ok("an empty set formats to an empty string", formatEffectOverrides(new Set()) === "");

console.log("\n3. applying to real configs");
const lighting = { giEnabled: true, volumetricLightingEnabled: true, giAOIntensity: 2.25 } as unknown as LightingConfig;
const rendering = {
  ssrEnabled: true,
  antialiasEnabled: true,
  bloomEnabled: true,
  motionBlurEnabled: true,
  lutEnabled: true,
  depthOfFieldEnabled: false,
  distanceBlurEnabled: false,
} as unknown as RenderingConfig;

ok("no overrides returns the config untouched", applyEffectOverridesToLighting(new Set(), lighting) === lighting);
ok("`-gi` turns GI off", applyEffectOverridesToLighting(parseEffectOverrides("?fx=-gi"), lighting).giEnabled === false);
ok("`-gi` leaves the other lighting fields alone", (() => {
  const out = applyEffectOverridesToLighting(parseEffectOverrides("?fx=-gi"), lighting);
  return out.volumetricLightingEnabled === true && out.giAOIntensity === 2.25;
})());
ok("`-ssr` turns SSR off and nothing else", (() => {
  const out = applyEffectOverridesToRendering(parseEffectOverrides("?fx=-ssr"), rendering);
  return out.ssrEnabled === false && out.bloomEnabled === true && out.antialiasEnabled === true;
})());
ok("`none` turns every rendering pass off", (() => {
  const out = applyEffectOverridesToRendering(parseEffectOverrides("?fx=none"), rendering);
  return !out.ssrEnabled && !out.antialiasEnabled && !out.bloomEnabled && !out.motionBlurEnabled && !out.lutEnabled;
})());

console.log("\n4. the invariant: an override can only ever SUBTRACT");
// The whole point of this control is to answer "is pass X the culprit?".
// If it could ever switch a pass ON, a project that never enabled that
// pass would start rendering differently under `?fx=`, and the answer it
// gave would be about a scene nobody publishes.
const allOffLighting = { giEnabled: false, volumetricLightingEnabled: false } as unknown as LightingConfig;
const allOffRendering = {
  ssrEnabled: false,
  antialiasEnabled: false,
  bloomEnabled: false,
  motionBlurEnabled: false,
  lutEnabled: false,
  depthOfFieldEnabled: false,
  distanceBlurEnabled: false,
} as unknown as RenderingConfig;
const everything = parseEffectOverrides("?fx=none");
ok("a project with GI already off stays off", applyEffectOverridesToLighting(everything, allOffLighting).giEnabled === false);
ok("no rendering pass is ever switched on", (() => {
  const out = applyEffectOverridesToRendering(everything, allOffRendering) as unknown as Record<string, unknown>;
  return Object.values(out).every((v) => v !== true);
})());

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
