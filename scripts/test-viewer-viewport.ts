/**
 * The Project Viewer must be exactly one non-scrolling screen.
 * Run with `npm run test:viewer-viewport` (needs `npm run dev` on :3000).
 *
 * Reported 2026-08-27 on iOS Safari: after a reload the bottom dock sat
 * too high with a white band beneath it, and a second reload fixed it.
 * That band is `body`'s own #f7f7f8 showing through — i.e. the document
 * was taller than the viewer and had been scrolled. Cause: `html, body {
 * height: 100% }` resolves against the LARGE viewport on iOS Safari (the
 * screen as if the toolbars were retracted) while the viewer root's
 * `h-dvh` tracks the current one, so the document was always about a
 * toolbar taller than anything visible and Safari's scroll restoration
 * had somewhere to put an offset.
 *
 * Chromium cannot reproduce the iOS lvh/dvh split — there, `100%` and
 * `100dvh` agree. So §1 does not try to; it asserts the GUARANTEE that
 * removes the failure mode on any browser: with the fix in place the
 * document cannot be scrolled even when something taller than the screen
 * is forced into it. Before the fix that same injection scrolls, which is
 * precisely the state the screenshot showed.
 */
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "tower-vlora";

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

// No helper functions inside any page.evaluate body — tsx compiles with
// esbuild's `keepNames`, whose `__name` helper does not exist in the page.
const measure = (page: Page) =>
  page.evaluate(() => {
    const h = document.documentElement;
    const b = document.body;
    const hs = getComputedStyle(h);
    const bs = getComputedStyle(b);
    return {
      innerHeight: window.innerHeight,
      htmlHeight: h.getBoundingClientRect().height,
      bodyHeight: b.getBoundingClientRect().height,
      htmlOverflow: hs.overflowY,
      bodyOverflow: bs.overflowY,
      scrollHeight: h.scrollHeight,
      hasViewerRoot: !!document.querySelector("[data-viewer-channel]"),
    };
  });

async function main() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();

  console.log("\n1. the viewer route is one non-scrolling screen");
  await page.goto(`${BASE}/project/${SLUG}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("[data-viewer-channel]", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const m = await measure(page);
  ok("the viewer root is present (so the `:has()` rule can match)", m.hasViewerRoot);
  ok("<html> is exactly the visible viewport", Math.abs(m.htmlHeight - m.innerHeight) < 1, `html ${r2(m.htmlHeight)} vs innerHeight ${m.innerHeight}`);
  ok("<body> is exactly the visible viewport", Math.abs(m.bodyHeight - m.innerHeight) < 1, `body ${r2(m.bodyHeight)} vs innerHeight ${m.innerHeight}`);
  ok("<html> does not scroll", m.htmlOverflow === "hidden", `got "${m.htmlOverflow}"`);
  ok("<body> does not scroll", m.bodyOverflow === "hidden", `got "${m.bodyOverflow}"`);
  ok("nothing overflows the document", m.scrollHeight <= m.innerHeight + 1, `scrollHeight ${m.scrollHeight} vs ${m.innerHeight}`);

  console.log("\n2. and stays put even when something taller is forced into it");
  // This is the iOS state, simulated: a document taller than the screen,
  // plus an attempt to scroll it. Pre-fix, `html`/`body` were `height:
  // 100%` with default overflow and this scrolls — which is exactly what
  // lifted the dock and exposed body's background underneath.
  const dockBefore = await page.evaluate(() => {
    const el = document.querySelector(".viewer-glass");
    return el ? el.getBoundingClientRect().bottom : -1;
  });
  await page.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.id = "rz-overflow-probe";
    spacer.style.height = "240px";
    // <body> is a flex column, so a plain height on a probe is negotiable
    // — without this the flex algorithm just shrinks the probe away and
    // the test proves nothing.
    spacer.style.flexShrink = "0";
    document.body.appendChild(spacer);
  });
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(300);
  const after = await page.evaluate(() => {
    const el = document.querySelector(".viewer-glass");
    return { scrollY: window.scrollY, dockBottom: el ? el.getBoundingClientRect().bottom : -1, ih: window.innerHeight };
  });
  ok("the document refuses to scroll", after.scrollY === 0, `scrollY ${after.scrollY}`);
  ok("the dock did not ride up", Math.abs(after.dockBottom - dockBefore) < 1, `dock bottom ${r2(dockBefore)} → ${r2(after.dockBottom)}`);
  ok("the dock still sits at the bottom of the screen", after.ih - after.dockBottom < 40, `${r2(after.ih - after.dockBottom)}px of gap below the dock`);
  await page.evaluate(() => document.getElementById("rz-overflow-probe")?.remove());

  console.log("\n3. every other page is untouched — it must still scroll");
  const site = await ctx.newPage();
  await site.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await site.waitForTimeout(1200);
  const sm = await measure(site);
  ok("the landing page has no viewer root", !sm.hasViewerRoot);
  ok("<html> is not forced to `overflow: hidden` there", sm.htmlOverflow !== "hidden", `got "${sm.htmlOverflow}"`);
  ok("<body> is not forced to `overflow: hidden` there", sm.bodyOverflow !== "hidden", `got "${sm.bodyOverflow}"`);
  ok("<html> height is not pinned there", Math.abs(sm.htmlHeight - sm.innerHeight) < 1 ? sm.htmlOverflow !== "hidden" : true);
  // The landing page happens to be exactly one screen at this width
  // (scrollHeight === innerHeight), so "did it scroll" proves nothing on
  // its own. Force real overflow instead: off the viewer route the
  // document scroller must still work, which is the mirror of §2.
  await site.evaluate(() => {
    const spacer = document.createElement("div");
    spacer.style.height = "600px";
    spacer.style.flexShrink = "0"; // same reason as §2
    document.body.appendChild(spacer);
  });
  await site.evaluate(() => window.scrollTo(0, 300));
  await site.waitForTimeout(300);
  ok("a normal page still scrolls when its content overflows", (await site.evaluate(() => window.scrollY)) > 0, "the viewer rule leaked onto a normal page");

  await browser.close();
  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
