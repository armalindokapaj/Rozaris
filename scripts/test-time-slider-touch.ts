/**
 * RZ-VIEWER-TIME-MOBILE-01 — the viewer dock's Time slider on touch.
 * Run with `npm run test:time-slider` (needs `npm run dev` on :3000).
 *
 * Browser-driven rather than a maths-only script (unlike
 * `test-floor-rail-magnify.ts`) because every requirement in the ticket is
 * a property of real layout and real hit-testing: `pointer-events`,
 * `touch-action`, a native range thumb's own travel range, and whether a
 * 28px touch band clears the controls row 2px above it. None of that is
 * observable outside a browser.
 *
 * Headed on purpose — `/project/[slug]` is WebGPU, and headless Chromium
 * here has no GPU (it falls back to SwiftShader and renders black). The
 * DOM measurements below would survive that, but the pixel pass that
 * locates the thumb would not.
 *
 * This does NOT replace the ticket's real-device acceptance run: Chromium
 * synthesises touch, and a synthetic touch passes things a finger fails.
 * It verifies the mechanism (band size, hit-testing, travel, fill
 * alignment); iOS Safari and Android Chrome still need a human.
 */
import { chromium, type Page } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
/** Read out of the component source rather than imported, so this asserts
 * the value the shipped file actually carries — the point of §4 below is
 * that the constant and the browser must agree, and importing it would
 * still pass if both were wrong together. */
const SOURCE_THUMB_INSET = Number(
  /const SLIDER_THUMB_INSET_PX = (\d+)/.exec(readFileSync("src/components/project/viewer-hud/dock/TimeContent.tsx", "utf8"))?.[1]
);
const SLUG = process.env.SLUG ?? "tower-vlora";
/** `DOCK_HEIGHT_MOBILE_STANDARD` (layoutState.ts) — the content height, on
 * top of which DockShell's own 1px top+bottom border lands the shell at 72. */
const DOCK_CONTENT_HEIGHT_MOBILE = 70;

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
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Opens the dock's Time module. `aria-label` on the nav button is the
 * translated string, so this goes by position in the nav row instead of
 * text — the viewer's default locale is Albanian ("Koha"), and hardcoding
 * either language makes this test a locale trap. */
async function openTime(page: Page) {
  await page.waitForSelector(".rz-range-single, [aria-label]", { timeout: 30_000 });
  const timeBtn = page.locator('button[aria-label="Koha"], button[aria-label="Time"]').first();
  await timeBtn.waitFor({ state: "visible", timeout: 30_000 });
  await timeBtn.click();
  await page.waitForSelector("input.rz-range-single", { state: "visible", timeout: 15_000 });
  await page.waitForTimeout(700); // dock morph + content reveal
}

const rectOf = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }, selector);

/** Real touch, not `page.mouse` — the whole ticket is that touch and mouse
 * hit-test this control differently, so a mouse-driven pass would prove
 * nothing. Playwright's own touchscreen API is tap-only, so drags go
 * through CDP directly. */
async function touchDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (x: number, y: number) => [{ x, y, radiusX: 12, radiusY: 12, force: 1 }];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: pt(from.x, from.y) });
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: pt(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t),
    });
    await page.waitForTimeout(16);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

/** Decodes a screenshot back into pixels using the same browser that took
 * it, so the thumb's real rendered box can be located without pulling in an
 * image-decoding dependency. */
async function whitePixelBox(page: Page, clip: { x: number; y: number; width: number; height: number }) {
  const buf = await page.screenshot({ clip });
  const dataUrl = `data:image/png;base64,${buf.toString("base64")}`;
  return page.evaluate(async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, count = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240 && data[i + 3] > 200) {
          count++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return count ? { minX, maxX, minY, maxY, count, width, height } : null;
  }, dataUrl);
}

/** Mean per-channel difference between two screenshots, 0-255. Decoded in
 * the page for the same reason whitePixelBox does it. */
async function meanAbsDiff(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(async ([ua, ub]) => {
    // Written out twice rather than through a local helper: see the note in
    // §1 about esbuild's `keepNames` and `__name`.
    const imgA = new Image();
    imgA.src = ua;
    await imgA.decode();
    const ca = document.createElement("canvas");
    ca.width = imgA.width;
    ca.height = imgA.height;
    const cxa = ca.getContext("2d")!;
    cxa.drawImage(imgA, 0, 0);
    const ia = cxa.getImageData(0, 0, imgA.width, imgA.height);

    const imgB = new Image();
    imgB.src = ub;
    await imgB.decode();
    const cb = document.createElement("canvas");
    cb.width = imgB.width;
    cb.height = imgB.height;
    const cxb = cb.getContext("2d")!;
    cxb.drawImage(imgB, 0, 0);
    const ib = cxb.getImageData(0, 0, imgB.width, imgB.height);

    if (ia.data.length !== ib.data.length) return -1;
    let sum = 0;
    for (let i = 0; i < ia.data.length; i += 4) {
      sum += Math.abs(ia.data[i] - ib.data[i]) + Math.abs(ia.data[i + 1] - ib.data[i + 1]) + Math.abs(ia.data[i + 2] - ib.data[i + 2]);
    }
    return sum / (ia.data.length / 4) / 3;
  }, [`data:image/png;base64,${a.toString("base64")}`, `data:image/png;base64,${b.toString("base64")}`] as [string, string]);
}

async function main() {
  console.log("\n0. the change that must NOT have been made — .rz-range-thumb is dual-thumb-only");
  const css = readFileSync("src/app/globals.css", "utf8");
  const thumbBlock = css.slice(css.indexOf(".rz-range-thumb {"), css.indexOf(".rz-range-single {"));
  ok(
    "`.rz-range-thumb` still declares `pointer-events: none` on the input",
    /\.rz-range-thumb \{[^}]*pointer-events:\s*none/.test(thumbBlock),
    "deleting it here instead of adding .rz-range-single breaks Units → Surface and /search, silently, under drag only"
  );
  ok("`.rz-range-thumb::-webkit-slider-thumb` still re-enables them", /-webkit-slider-thumb \{[^}]*pointer-events:\s*auto/.test(thumbBlock));
  ok("`.rz-range-single` declares no `pointer-events` of its own", !/\.rz-range-single \{[^}]*pointer-events/.test(css));
  ok("`.rz-range-single:disabled` does", /\.rz-range-single:disabled \{\s*pointer-events:\s*none/.test(css));

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/project/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await openTime(page);

  console.log("\n1. the touch band — R3, R5, R6");
  const input = (await rectOf(page, "input.rz-range-single"))!;
  // No helper functions inside any `page.evaluate` body in this file: tsx
  // compiles with esbuild's `keepNames`, which rewrites named function
  // expressions to reference a `__name` helper that does not exist in the
  // page. Everything below is therefore written out longhand on purpose.
  const geom = await page.evaluate(() => {
    const el = document.querySelector("input.rz-range-single")!;
    const wrapper = el.parentElement!;            // relative h-5 flex-1
    const row2 = wrapper.parentElement!;          // slider row
    const root = row2.parentElement!;             // TimeContent mobile root
    const row1 = root.children[0] as HTMLElement; // controls row
    const w = wrapper.getBoundingClientRect();
    const r1 = row1.getBoundingClientRect();
    const rt = root.getBoundingClientRect();
    return {
      wrapper: { top: w.top, bottom: w.bottom, height: w.height, left: w.left, right: w.right, width: w.width },
      row1: { top: r1.top, bottom: r1.bottom, height: r1.height },
      root: { top: rt.top, bottom: rt.bottom, height: rt.height },
      touchAction: getComputedStyle(el).touchAction,
      pointerEvents: getComputedStyle(el).pointerEvents,
    };
  });
  ok("R3 — band is 28px tall", input.height === 28, `got ${input.height}px`);
  ok("R3 — band spans the full track width", Math.abs(input.width - geom.wrapper.width) < 0.5, `input ${r2(input.width)} vs wrapper ${r2(geom.wrapper.width)}`);
  ok("R5 — band clears the controls row above it", input.top >= geom.row1.bottom, `band top ${r2(input.top)} vs row1 bottom ${r2(geom.row1.bottom)} (overlap ${r2(geom.row1.bottom - input.top)}px)`);
  ok("R6 — dock content height is still 70px", Math.abs(geom.root.height - DOCK_CONTENT_HEIGHT_MOBILE) < 0.5, `got ${r2(geom.root.height)}px`);
  ok("R4 — `touch-action: none`", geom.touchAction === "none", `got "${geom.touchAction}"`);
  ok("the input is hit-testable at all", geom.pointerEvents !== "none", `got pointer-events: ${geom.pointerEvents}`);
  console.log(`       band y ${r2(input.top - geom.root.top)}–${r2(input.bottom - geom.root.top)} within the 0–${DOCK_CONTENT_HEIGHT_MOBILE}px content box; row 1 ends at ${r2(geom.row1.bottom - geom.root.top)}`);

  const val = () => page.locator("input.rz-range-single").inputValue().then(Number);
  const min = Number(await page.locator("input.rz-range-single").getAttribute("min"));
  const max = Number(await page.locator("input.rz-range-single").getAttribute("max"));

  console.log("\n2. tap-to-seek — R1");
  await page.locator("input.rz-range-single").evaluate((el: HTMLInputElement) => { el.focus(); });
  await page.keyboard.press("Home");
  await page.waitForTimeout(120);
  const atMin = await val();
  ok("keyboard Home reaches the minimum (a11y regression guard)", Math.abs(atMin - min) < 1e-6, `got ${atMin}, min ${min}`);
  await page.touchscreen.tap(input.left + input.width / 2, input.top + input.height / 2);
  await page.waitForTimeout(200);
  const afterTap = await val();
  ok("R1 — a tap on the middle of the track moves the value there", Math.abs(afterTap - (min + max) / 2) < (max - min) * 0.08, `got ${r2(afterTap)}, expected ~${r2((min + max) / 2)}`);
  await page.touchscreen.tap(input.left + input.width * 0.2, input.top + 2);
  await page.waitForTimeout(200);
  const afterTopEdgeTap = await val();
  ok("R3 — a tap on the band's very top edge counts too", Math.abs(afterTopEdgeTap - afterTap) > 1e-6, `value stayed at ${r2(afterTopEdgeTap)}`);

  console.log("\n3. drag from empty track, with vertical deviation — R2, R4");
  await page.keyboard.press("Home");
  await page.waitForTimeout(120);
  const beforeDrag = await val();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  const dockTopBefore = (await rectOf(page, "input.rz-range-single"))!.top;
  await touchDrag(
    page,
    { x: input.left + input.width * 0.25, y: input.top + input.height / 2 },
    { x: input.left + input.width * 0.85, y: input.top + input.height / 2 + 22 } // ~20° of vertical deviation
  );
  await page.waitForTimeout(250);
  const afterDrag = await val();
  ok("R2 — a drag starting on empty track (not the thumb) moves the value", afterDrag > beforeDrag + (max - min) * 0.3, `${r2(beforeDrag)} → ${r2(afterDrag)}`);
  ok("R4 — the page did not pan", (await page.evaluate(() => window.scrollY)) === scrollBefore);
  ok("R4 — the dock did not move", Math.abs((await rectOf(page, "input.rz-range-single"))!.top - dockTopBefore) < 0.5);

  console.log("\n4. the thumb's real geometry — R9's premise");
  const clip = { x: Math.floor(input.left), y: Math.floor(input.top), width: Math.ceil(input.width), height: 28 };
  await page.keyboard.press("Home");
  await page.waitForTimeout(200);
  const boxMin = await whitePixelBox(page, clip);
  await page.keyboard.press("End");
  await page.waitForTimeout(200);
  const boxMax = await whitePixelBox(page, clip);
  if (!boxMin || !boxMax) {
    ok("thumb located in the rendered pixels", false, "no white pixels found in the track clip");
  } else {
    const wMin = boxMin.maxX - boxMin.minX + 1;
    const centreMin = (boxMin.minX + boxMin.maxX) / 2;
    const centreMax = (boxMax.minX + boxMax.maxX) / 2;
    const inset = centreMin; // distance of the thumb centre from the track's left edge at value=min
    console.log(`       thumb\u2019s white fill spans ${wMin}px (the 2px brand ring is excluded); centre travels ${r2(centreMin)} → ${r2(centreMax)} of ${clip.width}px`);
    ok(
      `SLIDER_THUMB_INSET_PX (${SOURCE_THUMB_INSET}) matches the real thumb centre inset`,
      Math.abs(inset - SOURCE_THUMB_INSET) <= 1,
      `measured ${r2(inset)}px — update the constant in TimeContent.tsx and \`margin-top\` in globals.css together`
    );
    ok("the travel is symmetric about the track", Math.abs((clip.width - 1 - centreMax) - centreMin) <= 1.5, `left inset ${r2(centreMin)}, right inset ${r2(clip.width - 1 - centreMax)}`);
    const thumbCentreY = (boxMin.minY + boxMin.maxY) / 2;
    ok("the thumb is vertically centred in the 28px band", Math.abs(thumbCentreY - (clip.height - 1) / 2) <= 1.5, `centre at y=${r2(thumbCentreY)} of ${clip.height}px — adjust \`margin-top\` on .rz-range-single::-webkit-slider-thumb`);
  }

  console.log("\n5. fill terminates at the thumb centre — R9");
  for (const [label, key] of [["minimum", "Home"], ["maximum", "End"]] as const) {
    await page.keyboard.press(key);
    await page.waitForTimeout(200);
    const fill = await page.evaluate(() => {
      const el = document.querySelector("input.rz-range-single")!;
      const bar = el.parentElement!.querySelector(":scope > div > div") as HTMLElement;
      const r = bar.getBoundingClientRect();
      return { left: r.left, right: r.right, width: r.width };
    });
    const box = await whitePixelBox(page, clip);
    if (!box) continue;
    const thumbCentreAbs = clip.x + (box.minX + box.maxX) / 2;
    ok(`R9 — fill ends at the thumb centre at the ${label}`, Math.abs(fill.right - thumbCentreAbs) <= 2, `fill ends at ${r2(fill.right)}, thumb centre at ${r2(thumbCentreAbs)} (off by ${r2(fill.right - thumbCentreAbs)}px)`);
  }

  console.log("\n6. disabled still swallows nothing — AC8");
  const disabledPE = await page.evaluate(() => {
    const el = document.querySelector("input.rz-range-single") as HTMLInputElement;
    el.disabled = true;
    const pe = getComputedStyle(el).pointerEvents;
    const mid = el.getBoundingClientRect();
    const hit = document.elementFromPoint(mid.left + mid.width / 2, mid.top + mid.height / 2);
    el.disabled = false;
    return { pe, hitIsInput: hit === el };
  });
  ok("AC8 — a disabled Time slider is `pointer-events: none`", disabledPE.pe === "none", `got "${disabledPE.pe}"`);
  ok("AC8 — taps fall through to what is beneath it", !disabledPE.hitIsInput);

  console.log("\n7. the dual-thumb sliders are untouched — R7, AC6");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const unitsBtn = page.locator('button[aria-label="Njësi"], button[aria-label="Units"]').first();
  if (await unitsBtn.count()) {
    await unitsBtn.click();
    await page.waitForTimeout(800);
    const dual = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input.rz-range-thumb")).map((el) => ({
        pe: getComputedStyle(el).pointerEvents,
        ta: getComputedStyle(el).touchAction,
        h: el.getBoundingClientRect().height,
      }))
    );
    ok("R7 — Units' dual-thumb inputs are still on `.rz-range-thumb`", dual.length >= 2, `found ${dual.length}`);
    ok("R7 — they still resolve to `pointer-events: none` on the input", dual.every((d) => d.pe === "none"), JSON.stringify(dual));
    ok("R7 — and are still 20px, not 28", dual.every((d) => d.h === 20), JSON.stringify(dual.map((d) => d.h)));
  } else {
    console.log("  skip Units module not present on this project");
  }

  console.log("\n8. dock height across mode switches — AC9");
  const heights: number[] = [];
  for (const label of [["Koha", "Time"], ["Njësi", "Units"], ["Koha", "Time"]] as const) {
    // The nav row only exists in Explore mode, so every hop returns there
    // first — otherwise the module currently open hides the button.
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    const b = page.locator(`button[aria-label="${label[0]}"], button[aria-label="${label[1]}"]`).first();
    if (!(await b.count())) continue;
    await b.click();
    await page.waitForTimeout(700);
    const shell = await page.evaluate(() => {
      const el = document.querySelector(".viewer-glass");
      return el ? el.getBoundingClientRect().height : -1;
    });
    heights.push(shell);
  }
  ok("AC9 — dock shell height is stable across Nav → Time → Nav", heights.length > 0 && heights.every((h) => Math.abs(h - heights[0]) < 0.5), JSON.stringify(heights.map(r2)));

  console.log("\n10. the scrub fast path skips nothing — R10's correctness half");
  // `setEnvironmentConfig` short-circuits a tick that changed only
  // viewerTimeHours/simulationDate. That is only safe while every read of
  // those two (and of the sun vector derived from them) lives inside
  // `applySunState`, which BOTH paths call — anything time-dependent left
  // behind in `applyEnvironmentConfig` would silently stop updating during
  // a scrub and only reappear on the next unrelated config change. Static,
  // because that is exactly the kind of regression a screenshot misses.
  const engineSrc = readFileSync("src/lib/render-engine/RenderEngine.ts", "utf8");
  const fullPathBody = engineSrc.slice(
    engineSrc.indexOf("private applyEnvironmentConfig(config: EnvironmentConfig, immediateRebuild: boolean) {"),
    engineSrc.indexOf("this.scheduleEnvironmentRebuild(config, immediateRebuild);")
  );
  ok("`applyEnvironmentConfig` still exists to slice", fullPathBody.length > 200);
  for (const token of ["viewerTimeHours", "simulationDate", "sunPos", "sunDirection", "sunColorForElevation"]) {
    ok(
      `no \`${token}\` left outside applySunState`,
      !fullPathBody.includes(token),
      `move it into applySunState — the scrub fast path does not run the rest of applyEnvironmentConfig`
    );
  }
  ok("both paths go through `applySunState`", /setEnvironmentConfig\(config: EnvironmentConfig\) \{[\s\S]{0,400}this\.applySunState\(config\)/.test(engineSrc) && fullPathBody.includes("this.applySunState(config)"));
  ok("the fast path is gated on one real full pass having run", engineSrc.includes("if (!this.hasAppliedEnvironmentConfigOnce) return false;"));

  console.log("\n11. a scrub still re-renders the scene — R10's behaviour half");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await (await page.locator('button[aria-label="Koha"], button[aria-label="Time"]').first()).click();
  await page.waitForSelector("input.rz-range-single", { state: "visible" });
  await page.waitForTimeout(600);
  const sceneClip = { x: 0, y: 120, width: 390, height: 400 };
  await page.locator("input.rz-range-single").evaluate((el: HTMLInputElement) => el.focus());
  await page.keyboard.press("Home");
  await page.waitForTimeout(1200);
  const shotEarly = await page.screenshot({ clip: sceneClip });
  await page.keyboard.press("End");
  await page.waitForTimeout(1200);
  const shotLate = await page.screenshot({ clip: sceneClip });
  await page.keyboard.press("Home");
  await page.waitForTimeout(1200);
  const shotEarlyAgain = await page.screenshot({ clip: sceneClip });
  const moved = await meanAbsDiff(page, shotEarly, shotLate);
  const returned = await meanAbsDiff(page, shotEarly, shotEarlyAgain);
  ok("scrubbing to the other end visibly changes the render", moved > 2, `mean channel delta ${r2(moved)}/255 — the sun did not move`);
  ok("scrubbing back reproduces the same render", returned < Math.max(1.5, moved / 4), `returning to the start differed by ${r2(returned)}/255 (the move itself was ${r2(moved)})`);

  console.log("\n9. desktop is unchanged, and gains tap-to-seek — R8");
  const desk = await ctx.newPage();
  await desk.setViewportSize({ width: 1440, height: 900 });
  await desk.goto(`${BASE}/project/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await openTime(desk);
  const deskInput = (await rectOf(desk, "input.rz-range-single"))!;
  await desk.locator("input.rz-range-single").evaluate((el: HTMLInputElement) => el.focus());
  await desk.keyboard.press("Home");
  await desk.waitForTimeout(150);
  const deskBefore = Number(await desk.locator("input.rz-range-single").inputValue());
  await desk.mouse.click(deskInput.left + deskInput.width * 0.7, deskInput.top + deskInput.height / 2);
  await desk.waitForTimeout(200);
  const deskAfter = Number(await desk.locator("input.rz-range-single").inputValue());
  ok("R8 — desktop click-to-seek on the track works", deskAfter > deskBefore, `${r2(deskBefore)} → ${r2(deskAfter)}`);
  ok("R8 — desktop band is the same 28px", deskInput.height === 28, `got ${deskInput.height}`);

  await browser.close();
  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
