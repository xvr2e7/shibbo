#!/usr/bin/env node
// Measure the design choices in each one-shot page from measure/generate-ui.ts, as readable tokens.
//
//   PW=/tmp/shibbo-eval/tools/node_modules/playwright-core node measure/ui-features.mjs [--jobs 4] [--force]
//   reads  measure/ui-runs-api/<model>/<brief>__<rep>/ (route "api") and measure/ui-runs/claude-*/<brief>__<rep>/ (route "cli")
//   -> measure/ui-features.json, plus screen.jpg, thumb.webp, view.webp, phone.jpg, features.json in each run folder.
//   Reruns measure only new or changed pages (features.json caches each one).
//
// Pages are model output. They load only in headless Chrome, never in Node. Network: the page may fetch fonts,
// stylesheets and scripts from the font and CSS/JS CDNs below (Tailwind's CDN build, Chart.js and icon sets
// change what the page looks like); everything else (images, fetch/XHR, other hosts) is blocked. A page that
// draws its hero from a blocked photo therefore shows an empty box, and its colour reads from what is left.
//
// Each page renders at 1440x900 (all measurements) and at 390x844 (the mobile tokens). The browser scrolls once
// through the page before measuring, so scroll-reveal content shows, then returns to the top for the screenshot.
// Motion preference stays at the default, so pages behave as a visitor sees them.
//
// Thresholds (colours compared in OKLCH; L 0-1, C chroma):
//   ground      the colour covering the most of the full-page screenshot (pixels binned 16 levels per channel,
//               then averaged within the top bin); html/body colour as a fallback.
//               black: every channel <= 8. white: every channel >= 254. dark: L < 0.35.
//               cream: L >= 0.85, C >= 0.005, hue 40-110 (warm). cool-tint: L >= 0.85, C >= 0.003, hue 180-300.
//               off-white: other L >= 0.85. tinted: other L >= 0.6 with C >= 0.03. mid: the rest.
//   accent      hue family with the most weight among chromatic colours (C >= 0.06): button and link fills
//               count 4x, other fills by area (capped at 20% of the screen), text by its area, borders 0.5x.
//               neutral when nothing chromatic. Families by OKLCH hue: pink 330-12, red 12-40, orange 40-75,
//               yellow 75-110, lime 110-135, green 135-165, teal 165-205, cyan 205-230, blue 230-268,
//               indigo 268-282, purple 282-330; brown is red/orange/yellow with L < 0.55 and C < 0.13.
//   hues        count of hue families holding >= 8% of the accent weight: 0 (mono), 1, 2, 3+.
//   gradient    gradient-fill: any gradient background on a box >= 2% of the screen. gradient-text: text
//               filled through background-clip: text. radial-glow: a radial gradient on a box >= 10% of the screen.
//   radius      the median radius of buttons, and of cards: 0, 2-6, 8-12, 14-24, 25+ ("large"), pill
//               (radius >= half the height). Cards are boxes 140-760 wide and 70-760 tall that set themselves
//               apart by a fill (translucent ones too), border or shadow, hold text, and are not buttons.
//   card style  shadow (most cards carry a box-shadow), outline (border, no shadow), fill (neither).
//   shadow      shadows: 4+ boxes with an outer box-shadow. glow: a shadow with C >= 0.06 and blur >= 12 px.
//   type        font: the first family of the h1 and of the body text, quotes and "Variable" stripped,
//               system stacks folded to "system-ui". heading/body: serif, sans or mono, by name or generic.
//               h1 weight: light <= 400, medium 500-600, bold 700, heavy 800+. h1 size: <40, 40-59, 60-79, 80+ px.
//               tight-tracking: h1 letter-spacing <= -0.015em. italic-accent / serif-accent / colour-accent:
//               part of the h1 (under 60% of its text) set in italic, in a serif family the h1 lacks, or in
//               another colour. eyebrows: short (<= 40 chars) uppercase labels <= 15 px with tracking >= 0.05em,
//               counted 0, 1-2, 3-5, 6+. mono-labels: 3+ short mono texts <= 13 px. type-steps: distinct
//               rounded text sizes, <= 5, 6-8, 9+.
//   layout      hero: centred (h1 centre within 6% of the page centre and centred text) or left; split when a
//               box >= 12% of the screen sits beside the h1. cards: 0, 1-5, 6-11, 12+. row-of-3 / row-of-4: a row
//               of exactly 3 or 4 sibling boxes >= 180 px wide with equal widths (within 4 px). bento: a grid of
//               4+ boxes whose widths or heights differ by 1.6x or more. nav: sticky (fixed or sticky bar at the
//               top, >= 80% wide). backdrop-blur: any backdrop-filter blur. sections: top-level blocks >= 160 px
//               tall, <= 4, 5-7, 8-10, 11+. length: page height in screens, 1, 2-4, 5-8, 9+. max-width: the most
//               common max-width (>= 800 px) among boxes >= 600 px wide: under-1100, 1100-1199, 1200, over-1200, none. emoji: 3+ emoji. icon-tiles: 3+ square boxes
//               28-80 px with a tinted fill or border and an icon inside. big-stats: 3+ short numeric texts >= 28 px.
//               hero-badge: a small pill label above the h1. dot-grid / grain: background-image patterns.
//   motion      transitions: 5+ boxes with a transition. keyframes: any @keyframes or running animation.
//               scroll-reveal: boxes hidden below the fold that show after the scroll. hover-lift: a :hover rule
//               that moves a box with translateY. reduced-motion: the page has a prefers-reduced-motion query.
//   mobile      mobile:overflow when the page scrolls sideways at 390 px; mobile:menu-button when the nav
//               links hide behind a button; mobile:small-text when body text is under 14 px.
//   tells       tell:<id> for each interface (domain ui) tell that `shibbo check` finds in the HTML.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNS = join(ROOT, "measure", "ui-runs");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i < 0 ? d : process.argv[i + 1]; };
const FORCE = process.argv.includes("--force");
const JOBS = +arg("jobs", 4);
const VERSION = 7; // bump when the token rules change, so cached pages are measured again
const { chromium } = createRequire(import.meta.url)(process.env.PW ?? "/tmp/shibbo-eval/tools/node_modules/playwright-core");

const ALLOW = /^(fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.bunny\.net|rsms\.me|api\.fontshare\.com|cdn\.fontshare\.com|use\.typekit\.net|cdn\.tailwindcss\.com|cdn\.jsdelivr\.net|unpkg\.com|cdnjs\.cloudflare\.com|code\.iconify\.design|kit\.fontawesome\.com|ka-f\.fontawesome\.com)$/;
const KINDS = new Set(["stylesheet", "font", "script"]);

// ── which pages ──
// Two routes, kept apart: measure/ui-runs-api/<model>/ holds bare API requests (the main, like-for-like set);
// measure/ui-runs/<claude-model>/ holds Claude models through the Claude Code CLI, whose system prompt wraps every
// request. Any other folder under ui-runs (early trial pages nested by provider) is skipped.
const canon = (id) => String(id).split("/").pop().replace(/-\d{8}$/, "");
const TRUNCATED = new Set(["max_tokens", "length"]);
const pages = [];
function collect(dir, route, depth) {
  if (!existsSync(dir) || depth > 3) return;
  for (const name of readdirSync(dir).sort()) {
    const sub = join(dir, name);
    if (!statSync(sub).isDirectory()) continue;
    if (route === "cli" && depth === 0 && !name.startsWith("claude-")) continue;
    if (!existsSync(join(sub, "run.json"))) { collect(sub, route, depth + 1); continue; }
    const run = JSON.parse(readFileSync(join(sub, "run.json"), "utf8"));
    if (!run.ok || run.mismatch || !existsSync(join(sub, "index.html"))) continue;
    // A reply that stopped at the token limit holds a page cut off mid-file (Fable 5.2 spends most of its 32k
    // tokens reasoning): measuring it would read the missing half as design choices, so it counts as a failed run.
    if (TRUNCATED.has(run.stop)) continue;
    // A few replies arrive JSON-escaped (literal \n and \" with no real line breaks): measure an unescaped copy,
    // page.html, and flag the page as repaired.
    let file = join(sub, "index.html"), repaired = false;
    const html = readFileSync(file, "utf8");
    if (!html.includes("\n") && (html.match(/\\n/g) ?? []).length >= 20) {
      file = join(sub, "page.html");
      const fixed = html.replace(/\\r/g, "").replace(/\\n/g, "\n").replace(/\\t/g, "\t").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
      if (!existsSync(file) || readFileSync(file, "utf8") !== fixed) writeFileSync(file, fixed);
      repaired = true;
    }
    pages.push({ route, model: canon(run.model), model_raw: run.model, via: run.via ?? (route === "cli" ? "claude-cli" : null), brief: run.brief, kind: run.kind, rep: run.rep ?? 1, dir: sub, file, repaired, served: run.served });
  }
}
collect(join(ROOT, "measure", "ui-runs-api"), "api", 0);
collect(RUNS, "cli", 0);

// ── the checker, once over every page ──
const uiTells = new Set();
for (const f of [join(ROOT, "data/tells.yaml"), ...readdirSync(join(ROOT, "data/tells.d")).map((x) => join(ROOT, "data/tells.d", x))]) {
  for (const t of YAML.parse(readFileSync(f, "utf8")) ?? []) if (t.domain === "ui") uiTells.add(t.id);
}
const tellsOf = new Map();
if (pages.length) {
  const files = pages.map((p) => relative(ROOT, p.file));
  const out = execFileSync("npx", ["tsx", "src/cli.ts", "check", ...files, "--format", "json"], { cwd: ROOT, maxBuffer: 1 << 28, encoding: "utf8" });
  const reports = [].concat(JSON.parse(out));
  for (const r of reports) tellsOf.set(r.file, [...new Set(r.findings.filter((f) => uiTells.has(f.id)).map((f) => f.id))].sort());
}

// ── in the page: everything below runs inside Chrome ──
function measure(pix) {
  const W = innerWidth, H = innerHeight, VA = W * H;
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (c, min = 26) => {
    if (!c || c === "transparent" || c === "rgba(0, 0, 0, 0)") return null;
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    return d[3] < min ? null : [d[0], d[1], d[2], d[3] / 255];
  };
  const lin = (u) => { u /= 255; return u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };
  const oklch = ([r, g, b]) => {
    const R = lin(r), G = lin(g), B = lin(b);
    const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
    const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
    const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return { L, C: Math.hypot(A, Bb), h: ((Math.atan2(Bb, A) * 180) / Math.PI + 360) % 360 };
  };
  const family = ({ L, C, h }) => {
    if (C < 0.06) return null;
    if ((h >= 12 && h < 110) && L < 0.55 && C < 0.13) return "brown";
    const bands = [[12, "red"], [40, "orange"], [75, "yellow"], [110, "lime"], [135, "green"], [165, "teal"], [205, "cyan"], [230, "blue"], [268, "indigo"], [282, "purple"], [330, "pink"]];
    let f = "pink";
    for (const [lo, n] of bands) if (h >= lo) f = n;
    return h < 12 ? "pink" : f;
  };
  const vis = (el, r) => {
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && +s.opacity > 0.05;
  };
  const all = [...document.body.querySelectorAll("*")].filter((e) => !["SCRIPT", "STYLE", "LINK", "META", "HEAD", "NOSCRIPT", "TEMPLATE", "BR"].includes(e.tagName));
  const items = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (!vis(el, r)) continue;
    items.push({ el, r, s: getComputedStyle(el), top: r.top + scrollY });
  }
  const ownText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
  const text = (el) => (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  const T = [];
  const add = (...t) => T.push(...t);

  // ── fonts ──
  const SERIFS = /serif|georgia|times|garamond|baskerville|playfair|fraunces|cormorant|lora|merriweather|crimson|newsreader|spectral|bodoni|literata|gloock|caslon|didot|libre caslon|instrument serif|dm serif|young serif|abril|prata|eb garamond|cardo|alegreya(?! sans)|vollkorn|bitter|zilla|domine|gelasio|marcellus|cinzel|tinos|charter|iowan|palatino|petrona|besley|bricolage serif|source serif|pt serif|noto serif|ibm plex serif|roboto serif|bona nova|yeseva|rozha|ultra/i;
  const MONOS = /mono|code|courier|menlo|consolas|monaco|fira code|space mono|ibm plex mono|jetbrains|sfmono|ui-monospace|monospace|inconsolata|iosevka|commit|berkeley/i;
  const fam1 = (ff) => {
    const list = ff.split(",").map((x) => x.trim().replace(/^["']|["']$/g, ""));
    let f = list[0] || "";
    if (/^(-apple-system|blinkmacsystemfont|system-ui|segoe ui|ui-sans-serif|sans-serif|helvetica neue|roboto|arial|helvetica)$/i.test(f) && /system|apple|segoe|ui-sans/i.test(ff)) f = "system-ui";
    f = f.replace(/\s+Variable$/i, "").replace(/\s+VF$/i, "");
    const generic = list.find((x) => /^(serif|sans-serif|monospace|ui-serif|ui-monospace|ui-sans-serif|system-ui|cursive)$/i.test(x)) || "";
    const cls = MONOS.test(f) || /mono/i.test(generic) ? "mono" : (SERIFS.test(f) && !/sans/i.test(f)) || (!/sans|system/i.test(generic) && /serif/i.test(generic) && !SERIFS.test(f) && !/inter|geist|manrope|dm sans|poppins|grotesk|satoshi|plus jakarta|outfit|sora|figtree|work sans|nunito|lato|open sans|montserrat|raleway|rubik|karla|mulish|urbanist|lexend/i.test(f)) ? "serif" : "sans";
    const name = f.toLowerCase() === "system-ui" ? "system-ui" : f.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bUi\b/, "UI").replace(/\bIbm\b/, "IBM").replace(/\bDm\b/, "DM").replace(/\bPt\b/, "PT").replace(/\bEb\b/, "EB");
    return { name, cls };
  };
  const h1 = items.find((x) => x.el.tagName === "H1" && text(x.el).length > 1)
    ?? items.filter((x) => x.r.top < H && ownText(x.el).length > 3).sort((a, b) => parseFloat(b.s.fontSize) - parseFloat(a.s.fontSize))[0];
  const texty = items.filter((x) => ["P", "LI", "SPAN", "A", "TD", "LABEL", "DIV", "BUTTON", "DD"].includes(x.el.tagName) && ownText(x.el).length >= 20);
  const byFam = {};
  for (const x of texty) { const k = x.s.fontFamily; byFam[k] = (byFam[k] || 0) + ownText(x.el).length; }
  const bodyFF = Object.entries(byFam).sort((a, b) => b[1] - a[1])[0]?.[0] ?? getComputedStyle(document.body).fontFamily;
  const hf = h1 ? fam1(h1.s.fontFamily) : null, bf = fam1(bodyFF);
  if (hf) add(`font:${hf.name}`, `heading:${hf.cls}`);
  if (!hf || bf.name !== hf.name) add(`font:${bf.name}`);
  add(`body:${bf.cls}`);
  if (hf && hf.name !== bf.name) add("two-families");
  if (h1) {
    const fw = +h1.s.fontWeight, fs = parseFloat(h1.s.fontSize);
    add(`h1:${fw <= 400 ? "light" : fw <= 600 ? "medium" : fw <= 700 ? "bold" : "heavy"}`);
    add(`h1-size:${fs < 40 ? "under-40" : fs < 60 ? "40-59" : fs < 80 ? "60-79" : "80-plus"}`);
    const ls = h1.s.letterSpacing === "normal" ? 0 : parseFloat(h1.s.letterSpacing) / fs;
    if (ls <= -0.015) add("h1:tight-tracking");
    const all1 = text(h1.el).length;
    let ital = false, serif = false, colour = false, grad = false;
    const c0 = rgba(h1.s.color);
    for (const d of h1.el.querySelectorAll("*")) {
      const s = getComputedStyle(d), t = text(d).length;
      if (!t || t > all1 * 0.6) continue;
      if (s.fontStyle === "italic" && h1.s.fontStyle !== "italic") ital = true;
      if (fam1(s.fontFamily).cls === "serif" && hf.cls !== "serif") serif = true;
      const c = rgba(s.color);
      if (c && c0 && Math.abs(c[0] - c0[0]) + Math.abs(c[1] - c0[1]) + Math.abs(c[2] - c0[2]) > 60) colour = true;
      if (/text/.test(s.webkitBackgroundClip || s.backgroundClip) && /gradient/.test(s.backgroundImage)) grad = true;
    }
    if (ital) add("h1:italic-accent");
    if (serif) add("h1:serif-accent");
    if (colour || grad) add("h1:colour-accent");
  }
  // eyebrows and mono labels
  let eyebrows = 0, monos = 0;
  const sizes = new Set();
  for (const x of items) {
    const t = ownText(x.el);
    if (!t) continue;
    const fs = parseFloat(x.s.fontSize);
    if (t.length >= 2) sizes.add(Math.round(fs));
    if (t.length > 40) continue;
    const ls = x.s.letterSpacing === "normal" ? 0 : parseFloat(x.s.letterSpacing) / fs;
    const upper = x.s.textTransform === "uppercase" || (/[A-Z]{3}/.test(t) && t === t.toUpperCase());
    if (upper && fs <= 15 && ls >= 0.05 && /[A-Za-z]{2}/.test(t)) eyebrows++;
    if (fs <= 13 && fam1(x.s.fontFamily).cls === "mono" && x.el.tagName !== "CODE" && x.el.tagName !== "PRE" && !x.el.closest("pre")) monos++;
  }
  add(`eyebrows:${eyebrows === 0 ? "none" : eyebrows <= 2 ? "1-2" : eyebrows <= 5 ? "3-5" : "6-plus"}`);
  if (monos >= 3) add("mono-labels");
  add(`type-steps:${sizes.size <= 5 ? "5-or-fewer" : sizes.size <= 8 ? "6-8" : "9-plus"}`);

  // ── colour ──
  // The ground is the colour that covers the most of the full-page screenshot (pix); the DOM is the fallback.
  let ground = pix ?? rgba(getComputedStyle(document.documentElement).backgroundColor);
  const bodyBg = rgba(getComputedStyle(document.body).backgroundColor);
  if (!pix && bodyBg && bodyBg[3] > 0.9) ground = bodyBg;
  if (!ground || ground[3] < 0.9) {
    scrollTo(0, 0);
    let best = null;
    for (const el of document.elementsFromPoint(W / 2, H * 0.6)) {
      const r = el.getBoundingClientRect(), c = rgba(getComputedStyle(el).backgroundColor);
      if (c && c[3] > 0.9 && r.width >= W * 0.9) best = c;
    }
    ground = best ?? [255, 255, 255, 1];
  }
  const g = oklch(ground);
  const gname = ground.slice(0, 3).every((v) => v <= 8) ? "black" : ground.slice(0, 3).every((v) => v >= 254) ? "white" : g.L < 0.35 ? "dark"
    : g.L >= 0.85 && g.C >= 0.005 && g.h >= 40 && g.h <= 110 ? "cream" : g.L >= 0.85 && g.C >= 0.003 && g.h >= 180 && g.h <= 300 ? "cool-tint"
    : g.L >= 0.85 ? "off-white" : g.L >= 0.6 && g.C >= 0.03 ? "tinted" : "mid";
  add(`ground:${gname}`);
  const weight = {};
  const put = (c, w) => { if (!c) return; const f = family(oklch(c)); if (f) weight[f] = (weight[f] || 0) + w * c[3]; };
  const isButton = (x) => x.el.matches("button, input[type=submit], input[type=button], [role=button], a[class*=btn], a[class*=button], .btn, .button") || (x.el.tagName === "A" && parseFloat(x.s.paddingLeft) >= 10 && x.r.height >= 28 && x.r.height <= 72 && rgba(x.s.backgroundColor));
  let gradFill = false, gradText = false, radial = false, dotGrid = false, grain = false, blur = false, shadows = 0, glow = false, transitions = 0;
  for (const x of items) {
    const a = x.r.width * x.r.height;
    const bg = rgba(x.s.backgroundColor);
    if (bg) put(bg, isButton(x) ? 4 * Math.min(a, VA * 0.2) / VA * 10 + 4 : Math.min(a, VA * 0.2) / VA * 10);
    if (ownText(x.el)) put(rgba(x.s.color), Math.min(ownText(x.el).length * parseFloat(x.s.fontSize) ** 2 * 0.6, VA * 0.05) / VA * 10);
    if (parseFloat(x.s.borderTopWidth) > 0 || parseFloat(x.s.borderLeftWidth) > 0) put(rgba(x.s.borderTopColor !== "rgba(0, 0, 0, 0)" ? x.s.borderTopColor : x.s.borderLeftColor), 0.5 * Math.min(x.r.width + x.r.height, 2000) / 2000);
    const bi = x.s.backgroundImage;
    if (bi && bi !== "none") {
      if (/gradient/.test(bi)) {
        for (const m of bi.matchAll(/(rgba?\([^)]*\)|#[0-9a-f]{3,8}|oklch\([^)]*\)|hsla?\([^)]*\))/gi)) put(rgba(m[1]), Math.min(a, VA * 0.2) / VA * 5);
        if (/text/.test(x.s.webkitBackgroundClip || x.s.backgroundClip)) gradText = true;
        else if (a >= VA * 0.02 && /linear|conic/.test(bi)) gradFill = true;
        if (/radial/.test(bi) && a >= VA * 0.1 && !/^\d+px/.test(x.s.backgroundSize)) radial = true;
        if (/radial/.test(bi) && /^\d+px/.test(x.s.backgroundSize)) dotGrid = true;
        if (/linear-gradient\(.*(90deg|0deg|to right|to bottom).*1px/.test(bi) && /^\d+px/.test(x.s.backgroundSize)) dotGrid = true;
      }
      if (/url\(.*(svg|data:image)/.test(bi) && /noise|feTurbulence|turbulence/i.test(decodeURIComponent(bi))) grain = true;
    }
    if (/blur/.test(x.s.backdropFilter || x.s.webkitBackdropFilter || "")) blur = true;
    const bs = x.s.boxShadow;
    if (bs && bs !== "none" && !/^inset/.test(bs)) {
      shadows++;
      for (const part of bs.split(/,(?![^(]*\))/)) {
        if (/inset/.test(part)) continue;
        const col = rgba((part.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}/i) || [])[0]);
        const nums = part.replace(/rgba?\([^)]*\)/, "").match(/-?[\d.]+px/g) || [];
        const blurPx = nums[2] ? parseFloat(nums[2]) : 0;
        if (col && oklch(col).C >= 0.06 && blurPx >= 12) glow = true;
      }
    }
    if (x.s.transitionDuration && x.s.transitionDuration.split(",").some((d) => parseFloat(d) > 0)) transitions++;
  }
  const tot = Object.values(weight).reduce((a, b) => a + b, 0);
  const fams = Object.entries(weight).sort((a, b) => b[1] - a[1]);
  add(`accent:${fams.length && tot > 0.05 ? fams[0][0] : "neutral"}`);
  const nh = fams.filter(([, w]) => w >= tot * 0.08).length;
  add(`hues:${tot <= 0.05 ? "0" : nh >= 3 ? "3-plus" : nh}`);
  if (gradFill) add("gradient-fill");
  if (gradText) add("gradient-text");
  if (radial) add("radial-glow");
  if (dotGrid) add("dot-grid");
  if (grain) add("grain");
  if (blur) add("backdrop-blur");
  if (shadows >= 4) add("shadows");
  if (glow) add("glow");
  if (transitions >= 5) add("transitions");

  // ── shape ──
  const radius = (x) => {
    const r = parseFloat(x.s.borderTopLeftRadius) || 0;
    if (/%/.test(x.s.borderTopLeftRadius)) return r >= 50 ? Infinity : r * x.r.width / 100;
    return r;
  };
  const bucket = (r, h) => (r >= h / 2 - 1 && r > 0 ? "pill" : r < 1 ? "0" : r <= 6.5 ? "2-6" : r <= 13 ? "8-12" : r <= 24 ? "14-24" : "25-plus");
  const median = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  const buttons = items.filter((x) => isButton(x) && x.r.height >= 24 && x.r.height <= 80 && x.r.width >= 40 && text(x.el).length >= 2 && (rgba(x.s.backgroundColor) || parseFloat(x.s.borderTopWidth) > 0));
  if (buttons.length) {
    const rs = buttons.map((x) => ({ r: radius(x), h: x.r.height }));
    const m = median(rs.map((z) => (z.r >= z.h / 2 - 1 && z.r > 0 ? 9999 : z.r)));
    add(`button-radius:${m === 9999 ? "pill" : bucket(m, 9e9)}`);
  }
  const parentBg = (el) => { for (let p = el.parentElement; p; p = p.parentElement) { const c = rgba(getComputedStyle(p).backgroundColor); if (c && c[3] > 0.5) return c; } return ground; };
  const differs = (a, b) => a && b && Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 6;
  const cards = items.filter((x) => {
    if (x.r.width < 140 || x.r.width > 760 || x.r.height < 70 || x.r.height > 760 || isButton(x) || ["A", "BUTTON", "INPUT", "TEXTAREA", "SELECT", "IMG", "SVG", "svg", "CANVAS", "TABLE", "TR", "TD", "TH", "TBODY", "UL", "NAV", "HEADER", "FOOTER", "FORM"].includes(x.el.tagName)) return false;
    if (text(x.el).length < 12) return false;
    // Translucent fills (white at 4% on a dark board) count: they still set the box apart.
    const bg = rgba(x.s.backgroundColor, 6);
    x.fill = !!bg && (bg[3] < 0.97 || differs(bg, parentBg(x.el)));
    x.border = parseFloat(x.s.borderTopWidth) >= 1 && parseFloat(x.s.borderBottomWidth) >= 1 && parseFloat(x.s.borderLeftWidth) >= 1 && !!rgba(x.s.borderTopColor);
    x.shadow = x.s.boxShadow !== "none" && !/^inset/.test(x.s.boxShadow);
    return x.fill || x.border || x.shadow;
  });
  // A card holding cards is a panel; count the innermost.
  const inner = cards.filter((c) => !cards.some((d) => d !== c && c.el.contains(d.el)));
  const nc = inner.length;
  add(`cards:${nc === 0 ? "0" : nc <= 5 ? "1-5" : nc <= 11 ? "6-11" : "12-plus"}`);
  if (nc >= 2) {
    add(`card-radius:${bucket(median(inner.map((x) => Math.min(radius(x), 9999))), 9e9)}`);
    const sh = inner.filter((x) => x.shadow).length, bo = inner.filter((x) => x.border).length;
    add(`card-style:${sh >= nc / 2 ? "shadow" : bo >= nc / 2 ? "outline" : "fill"}`);
  }

  // ── layout ──
  if (h1) {
    const c = h1.r.left + h1.r.width / 2;
    const centred = h1.s.textAlign === "center" && Math.abs(c - W / 2) < W * 0.06;
    add(`hero:${centred ? "centred" : "left"}`);
    const beside = items.some((x) => x.top < H * 1.1 && x.r.width * x.r.height >= VA * 0.12 && x.r.width < W * 0.7 && (x.r.left >= h1.r.right - 10 || x.r.right <= h1.r.left + 10) && x.r.top < h1.r.bottom + 200 && x.r.bottom > h1.r.top);
    if (!centred && beside) add("hero:split");
    const badge = items.find((x) => x.top < h1.top && x.top > h1.top - 220 && x.r.height <= 40 && x.r.height >= 16 && text(x.el).length > 2 && text(x.el).length <= 60 && radius(x) >= x.r.height / 2 - 1 && (rgba(x.s.backgroundColor) || parseFloat(x.s.borderTopWidth) > 0) && !isButton(x));
    if (badge) add("hero-badge");
  }
  let row3 = false, row4 = false, bento = false;
  for (const x of items) {
    if (!/flex|grid/.test(x.s.display)) continue;
    const kids = [...x.el.children].map((k) => ({ k, r: k.getBoundingClientRect() })).filter((k) => k.r.width >= 1 && k.r.height >= 1);
    if (kids.length < 3) continue;
    const rows = {};
    for (const k of kids) (rows[Math.round(k.r.top / 4)] ??= []).push(k);
    for (const row of Object.values(rows)) {
      if (row.length !== 3 && row.length !== 4) continue;
      const ws = row.map((k) => k.r.width);
      if (Math.min(...ws) >= 180 && Math.max(...ws) - Math.min(...ws) <= 4 && row.length === kids.filter((k) => Math.abs(k.r.top - row[0].r.top) < 4).length) {
        if (row.length === 3) row3 = true; else row4 = true;
      }
    }
    if (x.s.display.includes("grid") && kids.length >= 4) {
      const ws = kids.map((k) => k.r.width), hs = kids.map((k) => k.r.height);
      const tops = new Set(kids.map((k) => Math.round(k.r.top / 8)));
      if (tops.size >= 2 && Math.min(...ws) >= 120 && (Math.max(...ws) / Math.min(...ws) >= 1.6 || Math.max(...hs) / Math.min(...hs) >= 1.6) && kids.every((k) => k.r.height >= 80)) bento = true;
    }
  }
  if (row3) add("row-of-3");
  if (row4) add("row-of-4");
  if (bento) add("bento");
  scrollTo(0, 0);
  const sticky = items.some((x) => /fixed|sticky/.test(x.s.position) && x.el.getBoundingClientRect().top <= 10 && x.r.height < 140 && x.r.width >= W * 0.8);
  if (sticky) add("nav:sticky");
  const ph = document.documentElement.scrollHeight;
  const screens = ph / H;
  add(`length:${screens <= 1.15 ? "1-screen" : screens <= 4 ? "2-4-screens" : screens <= 8 ? "5-8-screens" : "9-plus-screens"}`);
  // Sections: the top-level blocks, after unwrapping single-child wrappers.
  // Descend through any wrapper that holds 70%+ of its parent's height, then count the blocks inside.
  let top = document.body;
  for (let i = 0; i < 6; i++) {
    const hh = top.getBoundingClientRect().height || ph;
    const big = [...top.children].find((k) => k.getBoundingClientRect().height >= hh * 0.7 && k.children.length >= 2);
    if (big) top = big; else break;
  }
  const blocks = [...top.children].filter((k) => k.getBoundingClientRect().height >= 160).length;
  const sectionEls = items.filter((x) => x.el.tagName === "SECTION" && x.r.height >= 160 && !x.el.parentElement.closest("section")).length;
  const ns = Math.max(blocks, sectionEls);
  add(`sections:${ns <= 4 ? "4-or-fewer" : ns <= 7 ? "5-7" : ns <= 10 ? "8-10" : "11-plus"}`);
  const mw = {};
  for (const x of items) {
    const v = x.s.maxWidth;
    if (v.endsWith("px") && parseFloat(v) >= 800 && x.r.width >= 600) { const n = Math.round(parseFloat(v)); mw[n] = (mw[n] || 0) + 1; }
  }
  const topMw = Object.entries(mw).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  const mwv = topMw ? +topMw[0] : 0;
  add(`max-width:${!mwv ? "none" : mwv < 1100 ? "under-1100" : mwv < 1200 ? "1100-1199" : mwv === 1200 ? "1200" : "over-1200"}`);
  const bodyText = document.body.innerText || "";
  const emoji = (bodyText.match(/\p{Extended_Pictographic}/gu) || []).filter((c) => !/[©®™★☆]/.test(c)).length;
  if (emoji >= 3) add("emoji");
  const tiles = items.filter((x) => x.r.width >= 28 && x.r.width <= 80 && Math.abs(x.r.width - x.r.height) <= 3 && radius(x) < x.r.width / 2 - 1 && (rgba(x.s.backgroundColor) || parseFloat(x.s.borderTopWidth) > 0) && (x.el.querySelector("svg, i, img") || /\p{Extended_Pictographic}/u.test(text(x.el)) || text(x.el).length === 1)).length;
  if (tiles >= 3) add("icon-tiles");
  const stats = items.filter((x) => { const t = ownText(x.el); return t && t.length <= 10 && /^[$€£]?[\d.,]+\s?[%kKmMbB+x×★]?\+?\/?\w{0,3}$/.test(t) && parseFloat(x.s.fontSize) >= 28; }).length;
  if (stats >= 3) add("big-stats");

  // ── motion ──
  let keyframes = false, hoverLift = false, rmq = false;
  const walk = (rules) => {
    for (const r of rules) {
      if (r.type === CSSRule.KEYFRAMES_RULE) keyframes = true;
      else if (r.type === CSSRule.MEDIA_RULE) { if (/prefers-reduced-motion/.test(r.conditionText || r.media?.mediaText)) rmq = true; walk(r.cssRules); }
      else if (r.selectorText && /:hover/.test(r.selectorText) && /translateY\(-|translate\([^,]+,\s*-|translate3d\([^,]+,\s*-/.test(r.style?.transform || "")) hoverLift = true;
      else if (r.cssRules) walk(r.cssRules);
    }
  };
  for (const sh of document.styleSheets) { try { walk(sh.cssRules); } catch { /* cross-origin sheet */ } }
  if (document.getAnimations().length) keyframes = true;
  if (keyframes) add("keyframes");
  if (hoverLift) add("hover-lift");
  if (rmq) add("reduced-motion");
  return { tokens: T, h1: h1 ? text(h1.el).slice(0, 140) : null, ground: `rgb(${ground.slice(0, 3).join(",")})`, accentWeights: Object.fromEntries(fams.map(([k, v]) => [k, +v.toFixed(3)])), height: ph };
}

// Elements below the fold that start hidden (opacity ~0) and show after a scroll.
function hiddenBelow() {
  const out = [];
  for (const el of document.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.top + scrollY > innerHeight && r.height > 20 && +getComputedStyle(el).opacity < 0.1 && (el.innerText || "").trim().length > 3) { el.dataset.shibboHidden = "1"; out.push(1); }
  }
  return out.length;
}
function revealed() { return [...document.querySelectorAll("[data-shibbo-hidden]")].filter((el) => +getComputedStyle(el).opacity > 0.5).length; }

function mobile() {
  const T = [];
  if (document.documentElement.scrollWidth > innerWidth + 2) T.push("mobile:overflow");
  const nav = document.querySelector("nav, header");
  if (nav) {
    const links = [...nav.querySelectorAll("a")].filter((a) => { const r = a.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(a).visibility !== "hidden"; });
    const btn = [...nav.querySelectorAll("button, [aria-label*=menu i], .menu-toggle, .hamburger")].some((b) => b.getBoundingClientRect().width > 0);
    if (btn && links.length <= 2) T.push("mobile:menu-button");
  }
  const p = [...document.querySelectorAll("p")].find((x) => x.getBoundingClientRect().width > 0 && (x.innerText || "").length > 40);
  if (p && parseFloat(getComputedStyle(p).fontSize) < 14) T.push("mobile:small-text");
  return T;
}

async function open(browser, file, width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.route("**/*", (route) => {
    const req = route.request(), url = req.url();
    if (url.startsWith("file:") || url.startsWith("data:") || url.startsWith("blob:")) return route.continue();
    try { if (ALLOW.test(new URL(url).hostname) && KINDS.has(req.resourceType())) return route.continue(); } catch { /* bad url */ }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.dismiss().catch(() => {}));
  await page.goto(pathToFileURL(file).href, { waitUntil: "load", timeout: 30000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  return { ctx, page };
}

/** Resize a screenshot inside a blank page, so no image library is needed. */
async function shrink(browser, buf, w, h, type, q) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const data = await page.evaluate(async ({ src, w, h, type, q }) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
    g.drawImage(img, 0, 0, img.width, img.width * h / w, 0, 0, w, h);
    return c.toDataURL(type, q);
  }, { src: `data:image/jpeg;base64,${buf.toString("base64")}`, w, h, type, q });
  await ctx.close();
  return Buffer.from(data.split(",")[1], "base64");
}

/** The most common colour in a screenshot: bin each pixel to 16 levels per channel, average the top bin. */
async function groundOf(browser, buf) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const c = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const w = 240, h = Math.max(1, Math.min(4000, Math.round(img.height * w / img.width)));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const g = cv.getContext("2d"); g.drawImage(img, 0, 0, img.width, Math.min(img.height, h * img.width / w), 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h).data, bins = new Map();
    for (let i = 0; i < d.length; i += 4) {
      const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
      const b = bins.get(k) ?? [0, 0, 0, 0]; b[0] += d[i]; b[1] += d[i + 1]; b[2] += d[i + 2]; b[3]++; bins.set(k, b);
    }
    const top = [...bins.values()].sort((a, b) => b[3] - a[3])[0];
    return [Math.round(top[0] / top[3]), Math.round(top[1] / top[3]), Math.round(top[2] / top[3]), 1];
  }, `data:image/jpeg;base64,${buf.toString("base64")}`).catch(() => null);
  await ctx.close();
  return c;
}

async function one(browser, p) {
  const file = p.file;
  const cache = join(p.dir, "features.json");
  const mtime = statSync(file).mtimeMs;
  if (!FORCE && existsSync(cache)) {
    const c = JSON.parse(readFileSync(cache, "utf8"));
    if (c.version === VERSION && c.mtime === mtime && existsSync(join(p.dir, "thumb.webp"))) return c;
  }
  const { ctx, page } = await open(browser, file, 1440, 900);
  const hidden = await page.evaluate(hiddenBelow).catch(() => 0);
  await page.evaluate(async () => { for (let y = 0; y < document.documentElement.scrollHeight; y += 450) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 70)); } scrollTo(0, 0); }).catch(() => {});
  await page.waitForTimeout(700);
  const shown = hidden ? await page.evaluate(revealed).catch(() => 0) : 0;
  const full = await page.screenshot({ type: "jpeg", quality: 50, fullPage: true, clip: undefined }).catch(() => null);
  const pix = full ? await groundOf(browser, full) : null;
  await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
  const m = await page.evaluate(measure, pix).catch((e) => ({ tokens: [], error: String(e).slice(0, 300) }));
  if (shown >= 2) m.tokens.push("scroll-reveal");
  await page.evaluate(() => scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(150);
  const shot = await page.screenshot({ type: "jpeg", quality: 82 });
  await ctx.close();
  writeFileSync(join(p.dir, "screen.jpg"), shot);
  writeFileSync(join(p.dir, "thumb.webp"), await shrink(browser, shot, 320, 200, "image/webp", 0.72));
  writeFileSync(join(p.dir, "view.webp"), await shrink(browser, shot, 720, 450, "image/webp", 0.6));
  const ph = await open(browser, file, 390, 844);
  const mt = await ph.page.evaluate(mobile).catch(() => []);
  writeFileSync(join(p.dir, "phone.jpg"), await ph.page.screenshot({ type: "jpeg", quality: 78 }));
  await ph.ctx.close();
  const rel = relative(ROOT, file);
  const tells = (tellsOf.get(rel) ?? []).map((id) => `tell:${id}`);
  const out = { version: VERSION, mtime, ...m, tokens: [...new Set([...m.tokens, ...mt, ...tells])] };
  writeFileSync(cache, JSON.stringify(out, null, 1));
  return out;
}

const browser = await chromium.launch({ channel: "chrome" });
const results = [];
const queue = [...pages];
let done = 0;
await Promise.all(Array.from({ length: JOBS }, async () => {
  while (queue.length) {
    const p = queue.shift();
    try {
      const f = await one(browser, p);
      // Tells come from the checker run above, so refresh them even for cached pages.
      const tells = (tellsOf.get(relative(ROOT, p.file)) ?? []).map((id) => `tell:${id}`);
      const tokens = [...new Set([...f.tokens.filter((t) => !t.startsWith("tell:")), ...tells])];
      results.push({ route: p.route, repaired: p.repaired || undefined, model: p.model, model_raw: p.model_raw, via: p.via, brief: p.brief, kind: p.kind, rep: p.rep, served: p.served, tokens, h1: f.h1 ?? null, ground: f.ground ?? null, height: f.height ?? null, error: f.error,
        screenshot: relative(ROOT, join(p.dir, "screen.jpg")), thumb: relative(ROOT, join(p.dir, "thumb.webp")), view: relative(ROOT, join(p.dir, "view.webp")), phone: relative(ROOT, join(p.dir, "phone.jpg")) });
    } catch (e) {
      console.error(`${p.model}/${p.brief}: ${String(e).slice(0, 200)}`);
    }
    if (++done % 20 === 0) console.error(`${done}/${pages.length}`);
  }
}));
await browser.close();
results.sort((a, b) => a.route.localeCompare(b.route) || a.model.localeCompare(b.model) || a.brief.localeCompare(b.brief) || a.rep - b.rep);
writeFileSync(join(ROOT, "measure", "ui-features.json"), JSON.stringify({
  version: VERSION, measured: new Date().toISOString().slice(0, 10),
  method: "Headless Chrome at 1440x900 and 390x844; fonts, stylesheets and scripts from font and CSS CDNs allowed, all other network blocked. Thresholds at the top of measure/ui-features.mjs.",
  pages: results,
}, null, 1));
console.log(`measured ${results.length} pages (${pages.length} usable runs) -> measure/ui-features.json`);
