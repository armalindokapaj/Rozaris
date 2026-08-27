/**
 * RZ-VIEWER-IOS-01 — the viewer on a device with no WebGPU. Run with
 * `npm run test:webgl2-fallback` (needs `npm run dev` on :3000).
 *
 * Why WebKit, and why headed: reported 2026-08-27 as "Time, Sun,
 * Environment doesn't work correctly in Mobile in my iPhone, it's dark.
 * In Desktop works fine. Even in Mobile View in Desktop browser works
 * fine." That last sentence is the whole diagnosis — a desktop browser's
 * mobile-emulation mode still has WebGPU, so it exercises a completely
 * different backend from the phone. `three` falls back to its WebGL2
 * backend when `navigator.gpu` is missing, which is every iPhone before
 * iOS 26 (Safari shipped WebGPU in Safari 26), and that path had never
 * been run here at all.
 *
 * `navigator.gpu` is removed via an init script rather than trusting the
 * WebKit build: Playwright's WebKit 26.5 *does* expose WebGPU, so without
 * this the run silently tests the path that already worked. The init
 * script is passed as a STRING, not a function — see the `__name` note in
 * `test-time-slider-touch.ts`.
 *
 * Headed for the same reason every other browser test here is: a headless
 * GPU-less Chromium/WebKit renders the viewer black, which is precisely
 * the symptom under test (see the "3D headless testing limitation" note).
 *
 * What it asserts, in the order the bug actually presented:
 *  1. the WebGL2 backend is really what's under test,
 *  2. no shader/program errors at all (the original failure was three's
 *     own SSRNode emitting `max(int, 1.0)`, illegal in GLSL ES 3.00),
 *  3. the scene is LIT — a mean-luminance floor, the literal "it's dark",
 *  4. Time/Sun/Environment respond: scrubbing the Time dock across the
 *     day visibly relights the scene rather than doing nothing.
 */
import { webkit, devices, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "tower-vlora";
/** Mean 0-255 luminance below which a daylight scene is "dark". The real
 * failure rendered near-black; a correct render of this project sits far
 * above this, so the threshold is deliberately loose — it is a smoke
 * alarm for "the pipeline died", not a look regression test. */
const DARK_FLOOR = 30;

let pass = 0, fail = 0;
function ok(name: string, condition: boolean, detail = "") {
  if (condition) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`); }
}
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mean luminance of a screenshot, decoded in the page itself so this
 * needs no image dependency (same technique as the time-slider test). No
 * named function inside the evaluate body — esbuild's `keepNames` would
 * reference a `__name` helper that does not exist in the page. */
async function meanLuma(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const buf = await page.screenshot({ clip });
  return page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data } = ctx.getImageData(0, 0, img.width, img.height);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    return sum / (data.length / 4);
  }, `data:image/png;base64,${buf.toString("base64")}`);
}

async function main() {
  const browser = await webkit.launch({ headless: false });
  const ctx = await browser.newContext({ ...devices["iPhone 14 Pro"] });
  await ctx.addInitScript({
    content: 'Object.defineProperty(navigator, "gpu", { get: function () { return undefined; }, configurable: true });',
  });
  const page = await ctx.newPage();
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
    if (m.type() === "warning") warnings.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/project/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("canvas", { timeout: 60_000 });
  await page.waitForTimeout(22_000); // GLB load + terrain + first shaded frames

  console.log("\n1. the backend actually under test");
  // `=== undefined`, not `in`: the init script shadows the property with a
  // getter, so `"gpu" in navigator` stays true while `navigator.gpu` is
  // undefined — which is what three's own probe reads.
  ok("`navigator.gpu` is undefined (an iPhone before iOS 26)", await page.evaluate(() => (navigator as Navigator & { gpu?: unknown }).gpu === undefined));
  ok(
    "three reports it fell back to the WebGL2 backend",
    warnings.some((w) => w.includes("running under WebGL2 backend")),
    "no fallback warning seen — this run may not be testing the fallback at all"
  );

  console.log("\n2. every shader in the chain compiles — RZ-VIEWER-IOS-01");
  const shaderErrors = errors.filter((e) => /Shader Error|not compiled|program not linked|program not valid/i.test(e));
  ok("no shader compile/link errors", shaderErrors.length === 0, shaderErrors.slice(0, 2).join("\n       "));
  const otherGlErrors = errors.filter((e) => /WebGL:/i.test(e) && !shaderErrors.includes(e));
  ok("no other WebGL errors", otherGlErrors.length === 0, otherGlErrors.slice(0, 3).join("\n       "));

  console.log("\n3. the scene is lit — the reported symptom was 'it's dark'");
  const view = page.viewportSize()!;
  // The canvas band between the top chrome and the bottom dock, so HUD
  // panels (which render fine even when the scene does not) can't prop up
  // the average.
  const clip = { x: 0, y: Math.round(view.height * 0.25), width: view.width, height: Math.round(view.height * 0.45) };
  const lumaAtLoad = await meanLuma(page, clip);
  ok(`scene luminance ${r2(lumaAtLoad)} is above the dark floor (${DARK_FLOOR})`, lumaAtLoad > DARK_FLOOR);

  console.log("\n4. Time / Sun / Environment respond on this backend");
  const timeBtn = page.locator('button[aria-label="Koha"], button[aria-label="Time"]').first();
  await timeBtn.click();
  await page.waitForSelector("input.rz-range-single", { state: "visible", timeout: 20_000 });
  await page.waitForTimeout(900);
  const slider = page.locator("input.rz-range-single");
  const min = Number(await slider.getAttribute("min"));
  const max = Number(await slider.getAttribute("max"));

  await slider.evaluate((el: HTMLInputElement) => { el.focus(); });
  await page.keyboard.press("Home");
  await page.waitForTimeout(2500);
  const lumaStart = await meanLuma(page, clip);
  const valStart = Number(await slider.inputValue());

  await page.keyboard.press("End");
  await page.waitForTimeout(2500);
  const lumaEnd = await meanLuma(page, clip);
  const valEnd = Number(await slider.inputValue());

  ok(`the slider really moved (${valStart} -> ${valEnd})`, valStart === min && valEnd === max, `min ${min} max ${max}`);
  ok(
    `scrubbing the day relights the scene (luma ${r2(lumaStart)} -> ${r2(lumaEnd)})`,
    Math.abs(lumaEnd - lumaStart) > 2,
    "the sun is not reaching the render on this backend"
  );
  ok(`the start of the day is lit (${r2(lumaStart)})`, lumaStart > DARK_FLOOR);
  // Not a brightness floor at the far end: this project's window runs to
  // 20:00 and its sun sets before that, so a dark frame there is the
  // correct answer. What it must not be is *unchanged* — night darker
  // than morning is the proof the one global sun vector reaches the
  // WebGL2 render path at all.
  ok(`after sunset is darker than morning (${r2(lumaEnd)} < ${r2(lumaStart)})`, lumaEnd < lumaStart);

  // Opt-in, and never into the repo: `SHOT_DIR=/tmp npm run
  // test:webgl2-fallback` when a human needs to look at the frame.
  if (process.env.SHOT_DIR) {
    const shot = `${process.env.SHOT_DIR}/webgl2-fallback-check.png`;
    await page.screenshot({ path: shot });
    console.log(`\n       screenshot: ${shot}`);
  }
  await browser.close();

  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
