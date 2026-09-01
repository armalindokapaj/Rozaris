import {
  computeSunTimeline,
  geographicSunPosition,
  snapSunTimeHours,
  snapSunTimePresets,
  sunTimelinePresets,
  type SunTimePreset,
  type SunTimeWindow,
} from "@/lib/sunPosition";

let pass = 0, fail = 0;
function eq(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}\n       got  ${g}\n       want ${w}`); }
}

function sunTimeWindow(startHours: number, endHours: number, stepMinutes: number): SunTimeWindow {
  const MIN_SUN_TIME_WINDOW_HOURS = 1;
  const lo = Math.min(startHours, endHours);
  const hi = Math.max(startHours, endHours);
  const start = Math.min(Math.max(Math.round(lo), 0), 23);
  const stepHours = Math.max(1, Math.round(stepMinutes / 60));
  const spanHours = Math.max(stepHours, MIN_SUN_TIME_WINDOW_HOURS, Math.floor((Math.round(hi) - start) / stepHours) * stepHours);
  return { startHours: start, endHours: Math.min(24, start + spanHours), stepHours };
}

const W = sunTimeWindow(6, 20, 15);

console.log("\n1. the window is whole hours, and every stop on it is reachable");
eq("6/20/15min -> 6-20 step 1h", W, { startHours: 6, endHours: 20, stepHours: 1 });
eq("half hours round", sunTimeWindow(6.5, 19.5, 15), { startHours: 7, endHours: 20, stepHours: 1 });
eq("an inverted window (14->5) is still a real window", sunTimeWindow(14, 5, 15), { startHours: 5, endHours: 14, stepHours: 1 });
eq("a collapsed window (12->12) stays draggable", sunTimeWindow(12, 12, 15), { startHours: 12, endHours: 13, stepHours: 1 });
eq("a coarse step is honoured", sunTimeWindow(6, 20, 180), { startHours: 6, endHours: 18, stepHours: 3 });
eq("...and End lands ON that step, never a partial one above min", (sunTimeWindow(6, 20, 180).endHours - 6) % 3, 0);
eq("a step under an hour becomes an hour", sunTimeWindow(6, 20, 1).stepHours, 1);
eq("a window narrower than one step still spans one step", sunTimeWindow(6, 7, 180), { startHours: 6, endHours: 9, stepHours: 3 });

console.log("\n2. every scrubbed value lands on the hour, inside the window");
eq("10:40 -> 11:00", snapSunTimeHours(10.667, W), 11);
eq("10:20 -> 10:00", snapSunTimeHours(10.333, W), 10);
eq("exactly on a stop is untouched", snapSunTimeHours(13, W), 13);
eq("below the window clamps to Start", snapSunTimeHours(1.25, W), 6);
eq("above the window clamps to End", snapSunTimeHours(23.9, W), 20);
eq("a value that would round PAST End clamps to End", snapSunTimeHours(19.9, W), 20);
eq("3h steps snap to 3h stops", snapSunTimeHours(13.4, sunTimeWindow(6, 20, 180)), 12);
eq("...and never off-grid at the top", snapSunTimeHours(17.9, sunTimeWindow(6, 20, 180)), 18);

console.log("\n3. presets are stops on THIS slider, not raw astronomy");
const raw: SunTimePreset[] = [
  { id: "morning", hour: 5.184 },                                               
  { id: "noon", hour: 10.667 },
  { id: "goldenHour", hour: 17.424 },
  { id: "evening", hour: 18.507 },
];
eq("clamped + snapped, order kept", snapSunTimePresets(raw, W), [
  { id: "morning", hour: 6 },
  { id: "noon", hour: 11 },
  { id: "goldenHour", hour: 17 },
  { id: "evening", hour: 19 },
]);
eq("no preset can escape the window", snapSunTimePresets(raw, W).every((p) => p.hour >= W.startHours && p.hour <= W.endHours), true);
eq("no preset is off the hour", snapSunTimePresets(raw, W).every((p) => Number.isInteger(p.hour)), true);
const narrow = sunTimeWindow(5, 14, 41);
eq("two presets collapsing onto one stop keep the nearer one", snapSunTimePresets(raw, narrow), [
  { id: "morning", hour: 5 },
  { id: "noon", hour: 11 },
  { id: "goldenHour", hour: 14 },
]);
eq("noon alone (polar day: no sunrise/sunset anchors) survives", snapSunTimePresets([{ id: "noon", hour: 10.667 }], W), [{ id: "noon", hour: 11 }]);

console.log("\n4. the real projects (DB, 2026-08-27) — astronomy through the same grid");
for (const c of [
  { name: "Tirana 21 Jun, 06-20", lat: 41.3275, lng: 19.8187, date: "2026-06-21T00:00:00.000Z", start: 6, end: 20, step: 15 },
  { name: "Fier 21 Jun, 06-20", lat: 40.7, lng: 19.82, date: "2026-06-21T00:00:00.000Z", start: 6, end: 20, step: 15 },
  { name: "Tirana 16 Aug, 05-14", lat: 41.3275, lng: 19.8187, date: "2026-08-16T00:29:26.566Z", start: 5, end: 14, step: 41 },
]) {
  const win = sunTimeWindow(c.start, c.end, c.step);
  const presets = snapSunTimePresets(
    sunTimelinePresets(computeSunTimeline((h) => geographicSunPosition(new Date(c.date), c.lat, c.lng, h).elevationDeg)),
    win
  );
  eq(`${c.name} — all presets on the hour, inside ${win.startHours}-${win.endHours}`,
     presets.every((p) => Number.isInteger(p.hour) && p.hour >= win.startHours && p.hour <= win.endHours), true);
  eq(`${c.name} — no two presets share a stop`, new Set(presets.map((p) => p.hour)).size, presets.length);
  console.log(`       ${presets.map((p) => `${p.id} ${String(p.hour).padStart(2, "0")}:00`).join("  ")}`);
}

console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
