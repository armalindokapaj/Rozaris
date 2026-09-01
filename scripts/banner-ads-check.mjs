import { chromium } from "playwright";
const SCRATCH = "/private/tmp/claude-501/-Users-mnrv-Desktop-Rozaris/531c6fa7-174c-41df-a20a-65d0eaf14a9a/scratchpad";
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const texts = await page.locator("text=Your AD can be put here").count();
console.log("ad slot text count (real slides only counted visually, DOM has decoys too):", texts);

await page.screenshot({ path: `${SCRATCH}/banner-ads-1.png` });

for (let i = 0; i < 6; i++) {
  await page.evaluate(() => {
    const el = document.querySelectorAll("div.-mx-5.flex.snap-x")[1];                                 
    if (!el) return;
    const cardWidth = el.scrollWidth / el.children.length;
    el.scrollLeft += cardWidth;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(220);
}
await page.screenshot({ path: `${SCRATCH}/banner-ads-2-after-loop.png` });

await browser.close();
