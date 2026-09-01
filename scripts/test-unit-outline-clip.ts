import { chromium, type Page } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SLUG = process.env.SLUG ?? "tower-vlora";
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

const readRow = (page: Page, label: string) =>
  page.evaluate((wanted) => {
    const rows = [...document.querySelectorAll("div")].filter(
      (d) => d.children.length === 2 && d.children[0]?.textContent === wanted
    );
    return rows[0]?.children[1]?.textContent ?? "(row missing)";
  }, label);

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
  await page.waitForFunction(() => document.body.innerText.includes("outline clip"), null, { timeout: 60_000 });
  await page.waitForTimeout(12_000);

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
  await rail.click({ force: true });
  await page.waitForTimeout(3500);
  const beforeCut = await readRow(page, "outline clip");
  ok("with the cut released the outline keeps every segment", /^\d+ segs, no cut$/.test(beforeCut), `row read "${beforeCut}"`);
  await rail.click({ force: true });
  await page.waitForTimeout(3500);
  const afterCut = await readRow(page, "outline clip");
  ok("cutting after the selection cuts the outline", cutIsClean(afterCut), `row read "${afterCut}"`);

  console.log("\n4. THE REGRESSION — nothing may leave the outline un-cut");
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
