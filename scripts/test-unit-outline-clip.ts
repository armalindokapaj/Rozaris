/**
 * A Section must cut the SELECTED unit's outline, not just the block it
 * traces. Run with `npm run test:outline-clip` (needs `npm run dev` on
 * :3000 and a real GPU — headless Chromium renders this scene black, so
 * this runs headed like the other viewer harnesses).
 *
 * Why this one needs a browser at all. three.js cannot clip a fat line:
 * `LineSegments2` draws every segment as an instanced screen-facing quad
 * whose real endpoints live in `instanceStart`/`instanceEnd`, so
 * `ClippingNode` judges the whole outline at its object's ORIGIN (the full
 * mechanics are in clipSegmentsToPlanes' doc comment). Rozaris therefore
 * cuts the outline itself, on the CPU, and the pure-maths half of that is
 * already testable without a browser. What is NOT is the half that keeps
 * breaking: whether the cut actually RUNS at the moment it has to. That
 * has now regressed twice — 2026-08-26 and again 2026-08-27 — both times
 * because a real sequence reached the screen with the outline holding its
 * un-cut edge set, and both times it looked exactly like a build that
 * never had the fix.
 *
 * So this asserts sequences, not arithmetic, and it asserts them through
 * `?diag=1`'s own `outline clip` row — which does not merely count
 * segments, it re-tests every endpoint the outline is currently drawing
 * against the live planes and reports anything still outside the volume.
 * That is the same string a visitor can screenshot off a phone, so a green
 * run here and a report from a device are directly comparable.
 */
import { chromium, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "tower-vlora";
/** The floor with a real authored Section on the demo project, and a unit
 * standing on it whose box crosses the cut. */
const FLOOR_LABEL = "Kati 8";
const UNIT_CODE = "A-003";

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

// No helper functions inside any page.evaluate body — tsx compiles with
// esbuild's `keepNames`, whose `__name` helper does not exist in the page.
const readRow = (page: Page, label: string) =>
  page.evaluate((wanted) => {
    const rows = [...document.querySelectorAll("div")].filter(
      (d) => d.children.length === 2 && d.children[0]?.textContent === wanted
    );
    return rows[0]?.children[1]?.textContent ?? "(row missing)";
  }, label);

/** `n/m segs cut`, optionally followed by `— k outside`. */
const CUT = /^(\d+)\/(\d+) segs cut( — (\d+) outside)?$/;

function cutIsClean(row: string): boolean {
  const m = CUT.exec(row);
  return m !== null && m[4] === undefined;
}

async function main() {
  const browser = await chromium.launch({ headless: false, args: ["--enable-unsafe-webgpu"] });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/project/${SLUG}?diag=1`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector("[data-viewer-channel]", { timeout: 60_000 });
  // The row stays "—" until the engine has mounted and sampled a frame.
  await page.waitForFunction(() => document.body.innerText.includes("outline clip"), null, { timeout: 60_000 });
  await page.waitForTimeout(12_000);

  // `force` throughout: the diagnostics panel overlays this corner of the
  // viewer. It is `pointer-events-none`, so the click really does reach
  // the control underneath — Playwright's own occlusion check just cannot
  // know that.
  const rail = page.getByLabel(FLOOR_LABEL).first();
  const openUnits = async () => {
    await page.getByRole("button", { name: /^Njësi$|^Units$/ }).first().click({ force: true });
    await page.waitForTimeout(1200);
    await page.getByText(/Lista e Filtrave|Filter List/).first().click({ force: true });
    await page.waitForTimeout(1200);
  };
  const selectUnit = async () => {
    await page.getByText(UNIT_CODE, { exact: true }).first().click({ force: true });
    await page.waitForTimeout(3500);
  };

  console.log("\n1. baseline — nothing selected, nothing cut");
  ok("the panel reports no selection", (await readRow(page, "outline clip")) === "no selection");

  console.log("\n2. cut first, select second (the floor rail, then a unit)");
  await openUnits();
  await rail.click({ force: true });
  await page.waitForTimeout(4000);
  ok("a cut with no selection is reported as such", (await readRow(page, "outline clip")) === "cut, no selection");
  await selectUnit();
  const afterSelect = await readRow(page, "outline clip");
  ok("selecting under a live cut cuts the outline", cutIsClean(afterSelect), `row read "${afterSelect}"`);

  console.log("\n3. select first, cut second (the order the unit card takes)");
  // Toggling the same floor off leaves the selection exactly where it is,
  // which is the state this case needs to start from — and re-uses the one
  // control that is reachable while a unit detail panel is open.
  await rail.click({ force: true });
  await page.waitForTimeout(3500);
  const beforeCut = await readRow(page, "outline clip");
  ok("with the cut released the outline keeps every segment", /^\d+ segs, no cut$/.test(beforeCut), `row read "${beforeCut}"`);
  await rail.click({ force: true });
  await page.waitForTimeout(3500);
  const afterCut = await readRow(page, "outline clip");
  ok("cutting after the selection cuts the outline", cutIsClean(afterCut), `row read "${afterCut}"`);

  console.log("\n4. THE REGRESSION — nothing may leave the outline un-cut");
  // The failure this whole harness exists for does not announce itself as
  // an error; it renders a complete purple box floating over the cut at a
  // solid 60fps. `— k outside` is the only thing that ever said so.
  ok("no segment is left outside the section volume", !afterSelect.includes("outside") && !afterCut.includes("outside"),
     `"${afterSelect}" / "${afterCut}"`);

  await browser.close();
  console.log(`\n${fail === 0 ? "PASS" : "FAIL"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
