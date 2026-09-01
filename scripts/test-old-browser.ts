import { chromium, devices, type Page } from "playwright";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "tower-vlora";
const OLD_CHROMIUM = `${homedir()}/Library/Caches/ms-playwright/chromium-978106/chrome-mac/Chromium.app/Contents/MacOS/Chromium`;

let pass = 0, fail = 0;
function ok(name: string, condition: boolean, detail = "") {
  if (condition) { pass++; console.log(`  ok   ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? `\n       ${detail}` : ""}`); }
}

async function pixelDelta(page: Page, a: Buffer, b: Buffer) {
  return page.evaluate(async ([ua, ub]) => {
    const ia = new Image();
    ia.src = ua;
    await ia.decode();
    const ca = document.createElement("canvas");
    ca.width = ia.width; ca.height = ia.height;
    const xa = ca.getContext("2d")!;
    xa.drawImage(ia, 0, 0);
    const da = xa.getImageData(0, 0, ia.width, ia.height);

    const ib = new Image();
    ib.src = ub;
    await ib.decode();
    const cb = document.createElement("canvas");
    cb.width = ib.width; cb.height = ib.height;
    const xb = cb.getContext("2d")!;
    xb.drawImage(ib, 0, 0);
    const db = xb.getImageData(0, 0, ib.width, ib.height);

    let changed = 0;
    for (let i = 0; i < da.data.length; i += 4) {
      if (Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]) > 40) changed++;
    }
    return Math.round((changed / (da.data.length / 4)) * 1000) / 10;
  }, [`data:image/png;base64,${a.toString("base64")}`, `data:image/png;base64,${b.toString("base64")}`] as [string, string]);
}

async function run(label: string, executablePath?: string) {
  console.log(`\n=== ${label} ===`);
  const browser = await chromium.launch({ headless: false, executablePath });
  const ctx = await browser.newContext({ ...devices["Pixel 5"] });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(`${BASE}/project/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForSelector("canvas", { timeout: 90_000 });
  await page.waitForTimeout(24_000);

  const layout = await page.evaluate(() => {
    const root = document.querySelector("[data-viewer-channel]") as HTMLElement | null;
    const canvas = document.querySelector("canvas") as HTMLCanvasElement | null;
    return {
      supportsDvh: CSS.supports("height", "100dvh"),
      supportsTranslateProp: CSS.supports("translate", "0 -50%"),
      rootHeight: root ? Math.round(root.getBoundingClientRect().height) : -1,
      canvasBuffer: canvas ? { w: canvas.width, h: canvas.height } : null,
      innerHeight: window.innerHeight,
    };
  });
  console.log(`       dvh:${layout.supportsDvh} translate:${layout.supportsTranslateProp} rootHeight:${layout.rootHeight} buffer:${layout.canvasBuffer?.w}x${layout.canvasBuffer?.h}`);

  ok("the viewer root has real height", layout.rootHeight > layout.innerHeight * 0.9, `root ${layout.rootHeight}px vs viewport ${layout.innerHeight}px`);
  ok("the canvas has a real drawing buffer", !!layout.canvasBuffer && layout.canvasBuffer.h > 0, JSON.stringify(layout.canvasBuffer));
  ok("no page errors", errors.length === 0, errors.slice(0, 2).join(" | "));

  await page.locator('button[aria-label="Njësi"], button[aria-label="Units"]').first().click({ timeout: 30_000 });
  await page.waitForTimeout(2500);

  const rail = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")].filter((b) => /^(Kati|Floor) \d/.test(b.getAttribute("aria-label") || ""));
    const wrap = document.querySelector('[class*="left-3"][class*="top-1/2"]') as HTMLElement | null;
    const r = wrap?.getBoundingClientRect();
    return {
      count: buttons.length,
      enabled: buttons.filter((b) => !(b as HTMLButtonElement).disabled).length,
      offBy: r ? Math.round(r.top + r.height / 2 - window.innerHeight / 2) : null,
      transform: wrap ? getComputedStyle(wrap).transform : null,
    };
  });
  ok("the floor rail is present", rail.count > 0, `found ${rail.count}`);
  ok("its floors are enabled (a section is linked to each)", rail.enabled > 0, `${rail.enabled}/${rail.count} enabled`);
  ok(
    `the rail is vertically centred (off by ${rail.offBy}px)`,
    rail.offBy != null && Math.abs(rail.offBy) <= 4,
    `transform: ${rail.transform} — below Chrome 104 this needs the @supports translate fallback in globals.css`
  );

  const before = await page.screenshot();
  await page.locator('button[aria-label="Kati 8"], button[aria-label="Floor 8"]').first().click({ timeout: 20_000 });
  await page.waitForTimeout(7000);
  const after = await page.screenshot();
  const delta = await pixelDelta(page, before, after);
  ok(`tapping a floor cuts the building open (${delta}% of pixels changed)`, delta > 5);

  await browser.close();
}

async function main() {
  await run("modern Chromium — must stay unaffected");
  if (!existsSync(OLD_CHROMIUM)) {
    console.log(`\n=== Chromium 101 — SKIPPED ===\n  Not installed. Run:  npx playwright@1.20.0 install chromium`);
  } else {
    await run("Chromium 101 (older Android: no dvh, no translate:, no :has(), no WebGPU)", OLD_CHROMIUM);
  }
  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main();
