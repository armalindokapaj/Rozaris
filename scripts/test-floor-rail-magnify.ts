import { dockMagnification, DOCK_WINDOW_SLOTS } from "@/lib/dockMagnification";

let pass = 0,
  fail = 0;
function ok(name: string, condition: boolean, detail = "") {
  if (condition) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`);
  }
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

console.log("\n1. shape — biggest under the pointer, smaller beside it, flat outside");
ok("row under the pointer gets the full magnification", near(dockMagnification(0), 1));
ok("immediate neighbour gets clearly less", dockMagnification(1) < 0.7 && dockMagnification(1) > 0.6,
   `got ${r3(dockMagnification(1))}`);
ok("second neighbour gets only a hint", dockMagnification(2) < 0.15 && dockMagnification(2) > 0.05,
   `got ${r3(dockMagnification(2))}`);
ok("third neighbour is untouched", near(dockMagnification(3), 0));
ok("symmetric above and below", near(dockMagnification(-1.4), dockMagnification(1.4)));

console.log("\n2. strictly decreasing across the window — no row out-grows one nearer the pointer");
let monotonic = true;
for (let d = 0; d < DOCK_WINDOW_SLOTS; d += 0.001) {
  if (dockMagnification(d + 0.001) > dockMagnification(d) + 1e-12) monotonic = false;
}
ok("monotonically decreasing from 0 to the window edge", monotonic);

console.log("\n3. the window closes smoothly — a floor entering the group of five must not pop");
ok("exactly zero at the edge", near(dockMagnification(DOCK_WINDOW_SLOTS), 0));
ok("zero everywhere past the edge", near(dockMagnification(DOCK_WINDOW_SLOTS + 3), 0));
ok("approaches the edge with ~zero slope (no visible step)",
   dockMagnification(DOCK_WINDOW_SLOTS - 0.01) < 1e-4,
   `got ${dockMagnification(DOCK_WINDOW_SLOTS - 0.01).toExponential(2)}`);

console.log("\n4. THE RULE — never more than five floors react, at any pointer position");
const ROWS = 40;
let worst = 0;
let worstAt = 0;
let everSix = false;
for (let step = 0; step <= ROWS * 500; step += 1) {
  const pointer = step / 500;
  let affected = 0;
  for (let row = 0; row < ROWS; row += 1) {
    if (dockMagnification(Math.abs(pointer - (row + 0.5))) > 0) affected += 1;
  }
  if (affected > worst) {
    worst = affected;
    worstAt = pointer;
  }
  if (affected > 5) everSix = true;
}
ok("never affects a sixth floor", !everSix);
ok("does reach five (the window is not uselessly narrow)", worst === 5,
   `max affected = ${worst} at pointer ${r3(worstAt)} slots`);

console.log("\n5. degenerate inputs can't produce a NaN transform");
ok("NaN distance -> 0", dockMagnification(Number.NaN) === 0);
ok("Infinity -> 0", dockMagnification(Number.POSITIVE_INFINITY) === 0);

const MAX_SCALE = 1.95;
console.log(
  `\nrendered scales: hovered ×${r3(1 + (MAX_SCALE - 1) * dockMagnification(0))}` +
    `, ±1 ×${r3(1 + (MAX_SCALE - 1) * dockMagnification(1))}` +
    `, ±2 ×${r3(1 + (MAX_SCALE - 1) * dockMagnification(2))}` +
    `, ±3 ×${r3(1 + (MAX_SCALE - 1) * dockMagnification(3))}`
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
