#!/usr/bin/env node
// Rendered checks: open each built page in Chrome and measure what markup alone can't show.
// None of these come from shibbo's tell list, so they don't favour the shibbo arms.
//   node eval/ui/render.mjs [--tag NAME]          writes render.json beside each index.html
//
// Per page, at 390 and 1440 px wide:
//   overflowX      the page scrolls sideways
//   lowContrast    text elements below WCAG AA (4.5:1, or 3:1 for large text) against their resolved background
//   tinyText       visible text set under 12 px
//   noFocus        of the first 12 focusable controls, how many show no visible change when focused by keyboard
//   offscreen      text elements cut by the viewport's left or right edge
// And a fingerprint for sameness between repeat builds: h1 text, fonts, page and accent colours, section count.
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const RUNS = join(HERE, "runs", arg("tag", "main"));
const force = process.argv.includes("--force");
const { chromium } = createRequire(import.meta.url)(process.env.PW ?? "/tmp/shibbo-eval/tools/node_modules/playwright-core");

// Runs in the page. Kept free of outside references so Playwright can serialise it.
function measure() {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
  // Resolve the colour behind an element by walking up; give up (null) at images and gradients.
  function bgOf(el) {
    const stack = [];
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    let out = { r: 255, g: 255, b: 255, a: 1 };
    for (const c of stack.reverse()) out = blend(c, out);
    return out;
  }
  const W = innerWidth;
  const res = { overflowX: document.documentElement.scrollWidth > W + 1, lowContrast: [], tinyText: [], offscreen: [] };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !n.textContent.trim()) continue;
    seen.add(el);
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (s.visibility === "hidden" || +s.opacity === 0 || r.width === 0 || r.height === 0) continue;
    if (el.closest("[aria-hidden=true]") || /^(SCRIPT|STYLE|NOSCRIPT|OPTION)$/.test(el.tagName)) continue;
    const text = n.textContent.trim().slice(0, 40);
    const size = parseFloat(s.fontSize);
    if (size < 12) res.tinyText.push({ text, size });
    if (r.right > W + 2 || r.left < -2) res.offscreen.push({ text });
    const fg = parse(s.color), bg = bgOf(el);
    if (fg && bg) {
      const c = ratio(blend(fg, bg), bg);
      const large = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
      if (c < (large ? 3 : 4.5)) res.lowContrast.push({ text, ratio: +c.toFixed(2) });
    }
  }
  // Fingerprint
  const h1 = document.querySelector("h1");
  const fam = (e) => (e ? getComputedStyle(e).fontFamily.split(",")[0].replace(/["']/g, "").trim() : null);
  const colours = new Map();
  for (const e of document.querySelectorAll("body *")) {
    const r = e.getBoundingClientRect();
    const area = Math.min(r.width, innerWidth) * Math.min(r.height, 4000);
    if (area < 400) continue;
    const c = parse(getComputedStyle(e).backgroundColor);
    if (!c || c.a < 0.5) continue;
    const k = `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
    colours.set(k, (colours.get(k) ?? 0) + area);
  }
  res.fingerprint = {
    h1: h1?.innerText.trim().replace(/\s+/g, " ").slice(0, 120) ?? null,
    headingFont: fam(h1), bodyFont: fam(document.querySelector("p") ?? document.body),
    page: (() => { const c = parse(getComputedStyle(document.body).backgroundColor); return c && c.a > 0 ? `rgb(${c.r},${c.g},${c.b})` : null; })(),
    colours: [...colours.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k),
    sections: document.querySelectorAll("main > section, body > section, main > div > section").length,
    height: document.documentElement.scrollHeight,
  };
  return res;
}

async function focusCheck(page) {
  const handles = await page.$$("a[href], button, input, select, textarea, [tabindex]:not([tabindex='-1'])");
  let tried = 0, none = 0;
  for (const h of handles.slice(0, 12)) {
    const visible = await h.isVisible().catch(() => false);
    if (!visible) continue;
    const look = () => h.evaluate((e) => { const s = getComputedStyle(e); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.backgroundColor, s.borderColor, s.textDecorationLine, s.color].join("|"); });
    await page.mouse.click(1, 1).catch(() => {});
    const before = await look();
    await h.focus();
    await page.keyboard.press("Shift");
    // :focus-visible needs keyboard modality; a Tab round trip sets it reliably.
    await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab");
    const after = await look();
    tried++;
    if (before === after) none++;
  }
  return { tried, none };
}

const browser = await chromium.launch({ channel: "chrome" });
for (const brief of readdirSync(RUNS).filter((d) => !d.includes("."))) {
  for (const arm of readdirSync(join(RUNS, brief))) {
    const dir = join(RUNS, brief, arm);
    if (!existsSync(join(dir, "index.html")) || (existsSync(join(dir, "render.json")) && !force)) continue;
    const out = {};
    for (const [label, width, height] of [["phone", 390, 844], ["desktop", 1440, 900]]) {
      const page = await browser.newPage({ viewport: { width, height }, reducedMotion: "reduce" });
      await page.goto(pathToFileURL(join(dir, "index.html")).href, { waitUntil: "networkidle", timeout: 30000 }).catch(() => {});
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } scrollTo(0, 0); });
      await page.waitForTimeout(400);
      const m = await page.evaluate(measure);
      if (label === "desktop") m.focus = await focusCheck(page);
      out[label] = m;
      await page.close();
    }
    out.summary = {
      overflowX: out.phone.overflowX || out.desktop.overflowX,
      lowContrast: out.phone.lowContrast.length + out.desktop.lowContrast.length,
      tinyText: out.desktop.tinyText.length,
      offscreen: out.phone.offscreen.length,
      noFocus: out.desktop.focus?.none ?? null,
      focusTried: out.desktop.focus?.tried ?? null,
    };
    writeFileSync(join(dir, "render.json"), JSON.stringify(out, null, 1));
    console.log(`${brief}/${arm}`, JSON.stringify(out.summary));
  }
}
await browser.close();
