import { chromium } from "playwright";
const SCRATCH = "/private/tmp/claude-501/-Users-mnrv-Desktop-Rozaris/ddc5a5bc-8e54-43a0-9acf-12723f0e6b92/scratchpad";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle" });
await page.waitForTimeout(800); // let useLiveProjects fetch resolve
await page.screenshot({ path: `${SCRATCH}/banner-back-1.png` });

const cardCount = await page.locator("a[href^='/projects/']").count();
console.log("promo cards found:", cardCount);

// Swipe through a full loop to confirm it wraps instead of stopping.
for (let i = 0; i < 6; i++) {
  await page.evaluate(() => {
    const el = document.querySelector("a[href^='/projects/']")?.parentElement;
    if (!el) return;
    const cardWidth = el.scrollWidth / el.children.length;
    el.scrollLeft += cardWidth;
    el.dispatchEvent(new Event("scroll"));
  });
  await page.waitForTimeout(220);
}
await page.screenshot({ path: `${SCRATCH}/banner-back-2-after-loop.png` });

await browser.close();
