#!/usr/bin/env node
// Screenshot every built cell with the installed Chrome: first screen, full page, and phone width.
//   PW=/path/to/node_modules/playwright-core node eval/ui/shot.mjs [--tag NAME]
import { existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const RUNS = join(HERE, "runs", arg("tag", "main"));
const { chromium } = createRequire(import.meta.url)(process.env.PW ?? "/tmp/shibbo-eval/tools/node_modules/playwright-core");

const browser = await chromium.launch({ channel: "chrome" });
for (const brief of readdirSync(RUNS)) {
  for (const arm of readdirSync(join(RUNS, brief))) {
    const dir = join(RUNS, brief, arm);
    if (!existsSync(join(dir, "index.html")) || existsSync(join(dir, "full.png"))) continue;
    for (const [name, width, height, fullPage] of [["hero", 1440, 900, false], ["full", 1440, 900, true], ["phone", 390, 844, true]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
      await page.goto(pathToFileURL(join(dir, "index.html")).href, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      // Scroll through once so scroll-triggered sections show, then return to the top.
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); } scrollTo(0, 0); });
      await page.waitForTimeout(500);
      await page.screenshot({ path: join(dir, `${name}.png`), fullPage });
      await page.close();
    }
    console.log(`shot ${brief}/${arm}`);
  }
}
await browser.close();
