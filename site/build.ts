// Build the static site into site/dist from the registry and measured data.
//   npm run site
import { mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildSync } from "esbuild";
import { tells, models, graphite, sources, root, type Tell, type Model } from "../src/registry.js";

const R = root();
const OUT = join(R, "site", "dist");
const g = graphite();
if (!g) throw new Error("run npm run import:graphite first");
const ms = models();
const evalData = existsSync(join(R, "data/measured/eval.json")) ? JSON.parse(readFileSync(join(R, "data/measured/eval.json"), "utf8")) : null;

const mapJson = readFileSync(join(R, "data/measured/map.json"), "utf8");
const mapData = JSON.parse(mapJson);
const mapJs = buildSync({ entryPoints: [join(R, "site/map.client.ts")], bundle: true, write: false, format: "iife", minify: true, target: "es2020" }).outputFiles[0].text;

const FAMILY_ORDER = ["gpt", "claude", "gemini"];
const ordered: Model[] = FAMILY_ORDER.flatMap((f) => ms.models.filter((m) => m.family === f).sort((a, b) => a.released.localeCompare(b.released)));
const familyVar: Record<string, string> = { gemini: "--fam-1", claude: "--fam-2", gpt: "--fam-3" };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const short = (m: Model) => m.name.replace(/^(GPT-|Claude |Gemini )/, "");
const month = (ym: string) => new Date(ym + "-15").toLocaleString("en", { month: "short", year: "numeric" });

/** Model rate over human rate for a tell: n-gram measure first, else the style feature. */
function ratioOf(t: Tell, m: Model): { ratio: number | null; via: string; counts?: { model: number; human: number } } {
  const n = g!.tells[t.id]?.[m.id];
  if (n && n.ratio !== null) return { ratio: n.ratio, via: n.term ? `"${n.term}"` : "", counts: n.floor ? n.counts : undefined };
  const f = g!.tellFeatures[t.id]?.models[m.id];
  if (f && f.ratio !== null && !g!.tells[t.id]) return { ratio: f.ratio, via: "rate per 1,000 words" };
  if (f && f.ratio !== null && g!.tells[t.id] && Object.values(g!.tells[t.id]).every((x) => x.ratio === null)) return { ratio: f.ratio, via: "rate per 1,000 words" };
  return { ratio: null, via: "" };
}

function fmt(r: number): string {
  if (r >= 1) return r >= 100 ? `${Math.round(r).toLocaleString("en")}×` : r >= 10 ? `${r.toFixed(0)}×` : `${r.toFixed(1)}×`;
  const inv = 1 / r;
  return `people ${inv >= 100 ? Math.round(inv).toLocaleString("en") : inv >= 10 ? inv.toFixed(0) : inv.toFixed(1)}×`;
}

function label(t: Tell): string {
  if (t.label) return t.label.replace(/^"([^"]+)"$/, "“$1”");
  const first = t.name.match(/^"([^"]+)"/);
  return first ? `“${first[1]}”` : t.name;
}

// ───────── diverging bins on log2(ratio) ─────────
const BINS = [
  { min: 64, cls: "o4", text: "64× or more" },
  { min: 16, cls: "o3", text: "16–64×" },
  { min: 4, cls: "o2", text: "4–16×" },
  { min: 2, cls: "o1", text: "2–4×" },
  { min: 0.5, cls: "n0", text: "within 2× of people" },
  { min: 1 / 4, cls: "u1", text: "people 2–4×" },
  { min: 1 / 16, cls: "u2", text: "people 4–16×" },
  { min: 1 / 64, cls: "u3", text: "people 16–64×" },
  { min: 0, cls: "u4", text: "people 64× or more" },
];
const binOf = (r: number) => BINS.find((b) => r >= b.min)!;

// ───────── heatmap ─────────
function heatmap(rows: Tell[]): string {
  const labelW = 300, cw = 58, ch = 28, gap = 2, famGap = 14, top = 64;
  const colX: number[] = [];
  let x = labelW;
  ordered.forEach((m, i) => {
    if (i > 0 && ordered[i - 1].family !== m.family) x += famGap;
    colX.push(x);
    x += cw + gap;
  });
  const width = x;
  const height = top + rows.length * (ch + gap) + 4;
  const parts: string[] = [];
  // family headers
  for (const f of FAMILY_ORDER) {
    const idx = ordered.map((m, i) => (m.family === f ? i : -1)).filter((i) => i >= 0);
    const x0 = colX[idx[0]], x1 = colX[idx.at(-1)!] + cw;
    parts.push(`<rect x="${x0}" y="6" width="${x1 - x0}" height="3" rx="1.5" fill="var(${familyVar[f]})"/>`);
    parts.push(`<text x="${x0}" y="24" class="fam">${esc(ms.families[f].name)} <tspan class="muted">${esc(ms.families[f].maker)}</tspan></text>`);
  }
  ordered.forEach((m, i) => {
    parts.push(`<text x="${colX[i] + cw / 2}" y="44" text-anchor="middle" class="col">${esc(short(m))}</text>`);
    parts.push(`<text x="${colX[i] + cw / 2}" y="58" text-anchor="middle" class="tick">${m.released.slice(2).replace("-", "/")}${m.verified ? "" : "*"}</text>`);
  });
  rows.forEach((t, r) => {
    const y = top + r * (ch + gap);
    parts.push(`<a href="tells/${t.id}.html"><text x="${labelW - 12}" y="${y + ch / 2 + 4}" text-anchor="end" class="row">${esc(label(t))}</text></a>`);
    ordered.forEach((m, i) => {
      const { ratio, via, counts } = ratioOf(t, m);
      const tip = counts
        ? (ratio! >= 1 ? `${m.name} used ${via} ${counts.model.toLocaleString("en")} times; people, never.` : `People used ${via} ${counts.human.toLocaleString("en")} times; ${m.name}, never.`)
        : `${m.name}, ${label(t)}: ${ratio === null ? "below Graphite's cutoff (fewer than 20 articles or under 2×)" : `${fmt(ratio)} ${ratio >= 1 ? "the human rate" : "more than this model"}`}${via ? ` (${via})` : ""}`;
      if (ratio === null) {
        parts.push(`<rect x="${colX[i]}" y="${y}" width="${cw}" height="${ch}" rx="3" class="nil" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`);
      } else {
        const b = binOf(ratio);
        parts.push(`<rect x="${colX[i]}" y="${y}" width="${cw}" height="${ch}" rx="3" class="c ${b.cls}" data-tip="${esc(tip)}"><title>${esc(tip)}</title></rect>`);
        if (ratio >= 64 || ratio <= 1 / 64) parts.push(`<text x="${colX[i] + cw / 2}" y="${y + ch / 2 + 4}" text-anchor="middle" class="inval ${b.cls}">${counts ? (ratio >= 1 ? `${counts.model}:0` : `0:${counts.human}`) : ratio >= 1 ? fmt(ratio) : Math.round(1 / ratio).toLocaleString("en") + "×"}</text>`);
      }
    });
  });
  return `<svg viewBox="0 0 ${width} ${height}" width="${width}" class="heat" role="img" aria-labelledby="heat-title heat-desc">${parts.join("")}</svg>`;
}

function heatLegend(): string {
  return `<ol class="legend-bins" aria-label="Color scale">${BINS.map((b) => `<li><span class="sw c ${b.cls}"></span>${esc(b.text)}</li>`).join("")}<li><span class="sw nil"></span>not measured</li></ol>`;
}

function heatTable(rows: Tell[]): string {
  const head = `<tr><th scope="col">Tell</th>${ordered.map((m) => `<th scope="col">${esc(m.name)}</th>`).join("")}</tr>`;
  const body = rows.map((t) => `<tr><th scope="row"><a href="tells/${t.id}.html">${esc(label(t))}</a></th>${ordered.map((m) => { const x = ratioOf(t, m); return `<td>${x.ratio === null ? "–" : x.counts ? (x.ratio >= 1 ? `${x.counts.model} vs 0` : `0 vs ${x.counts.human}`) : esc(fmt(x.ratio))}</td>`; }).join("")}</tr>`).join("");
  return `<table><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

// ───────── small multiples over time ─────────
const T0 = Date.UTC(2024, 0, 1), T1 = Date.UTC(2026, 11, 31);
const tx = (ym: string, w: number, padL: number, padR: number) => padL + ((Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7) - 1, 15) - T0) / (T1 - T0)) * (w - padL - padR);

function overTime(t: Tell, opts: { invert?: boolean; extra?: { at: string; ratio: number; text: string } } = {}): string {
  const w = 340, h = 190, padL = 54, padR = 64, padT = 14, padB = 26;
  const pts = ordered.map((m) => ({ m, r: ratioOf(t, m).ratio })).map((p) => ({ ...p, v: p.r === null ? null : opts.invert ? 1 / p.r : p.r }));
  const vals = pts.map((p) => p.v).filter((v): v is number => v !== null);
  if (opts.extra) vals.push(opts.extra.ratio);
  const lo = Math.min(0.5, ...vals), hi = Math.max(4, ...vals);
  const l0 = Math.floor(Math.log10(lo)), l1 = Math.ceil(Math.log10(hi));
  const ty = (v: number) => padT + (1 - (Math.log10(v) - l0) / (l1 - l0)) * (h - padT - padB);
  const parts: string[] = [];
  for (let e = l0; e <= l1; e++) {
    const v = 10 ** e;
    parts.push(`<line x1="${padL}" x2="${w - padR}" y1="${ty(v)}" y2="${ty(v)}" class="${v === 1 ? "base" : "grid"}"/>`);
    parts.push(`<text x="${padL - 6}" y="${ty(v) + 3.5}" text-anchor="end" class="tick">${v >= 1 ? v.toLocaleString("en") + "×" : v + "×"}</text>`);
  }
  for (const y of [2024, 2025, 2026]) {
    const xx = tx(`${y}-01`, w, padL, padR);
    parts.push(`<text x="${xx}" y="${h - 8}" class="tick">${y}</text>`);
    parts.push(`<line x1="${xx}" x2="${xx}" y1="${h - padB}" y2="${h - padB + 4}" class="base"/>`);
  }
  if (opts.extra) {
    const ex = tx(opts.extra.at, w, padL, padR), ey = ty(opts.extra.ratio);
    parts.push(`<rect x="${ex - 4}" y="${ey - 4}" width="8" height="8" transform="rotate(45 ${ex} ${ey})" class="era" data-tip="${esc(opts.extra.text)}"><title>${esc(opts.extra.text)}</title></rect>`);
    parts.push(`<text x="${ex + 8}" y="${ey + 4}" class="anno">PubMed 2024</text>`);
  }
  const ends: Array<{ y: number; text: string }> = [];
  for (const f of FAMILY_ORDER) {
    const fp = pts.filter((p) => p.m.family === f);
    const known = fp.filter((p) => p.v !== null);
    if (known.length > 1) parts.push(`<polyline fill="none" stroke="var(${familyVar[f]})" class="ln" points="${known.map((p) => `${tx(p.m.released, w, padL, padR).toFixed(1)},${ty(p.v!).toFixed(1)}`).join(" ")}"/>`);
    for (const p of fp) {
      const cx = tx(p.m.released, w, padL, padR);
      const tip = `${p.m.name} (${month(p.m.released)}): ${p.r === null ? "not measured" : opts.invert ? `people ${fmt(p.v!)} as often` : `${fmt(p.v!)} the human rate`}`;
      if (p.v === null) parts.push(`<circle cx="${cx}" cy="${h - padB - 4}" r="3.5" class="hollow" stroke="var(${familyVar[f]})" data-tip="${esc(tip)}"><title>${esc(tip)}</title></circle>`);
      else parts.push(`<circle cx="${cx}" cy="${ty(p.v)}" r="4.5" fill="var(${familyVar[f]})" class="dot" data-tip="${esc(tip)}"><title>${esc(tip)}</title></circle>`);
    }
    const last = known.at(-1);
    if (last) ends.push({ y: ty(last.v!) + 4, text: short(last.m) });
  }
  // Direct labels at line ends, nudged apart so they never overlap.
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  const overflow = ends.length ? ends.at(-1)!.y - (h - padB) : 0;
  if (overflow > 0) for (const e of ends) e.y -= overflow;
  for (const e of ends) parts.push(`<text x="${w - padR + 8}" y="${e.y}" class="endlab">${esc(e.text)}</text>`);
  return `<svg viewBox="0 0 ${w} ${h}" class="mini" role="img" aria-label="${esc(label(t))} over time">${parts.join("")}</svg>`;
}

// ───────── copy ─────────
// Article prose only: chat tells and advisory notes would mislead on this corpus.
const rows = tells()
  .filter((t) => t.domain === "prose" && t.severity > 0)
  .filter((t) => ordered.some((m) => ratioOf(t, m).ratio !== null))
  .map((t) => {
    const newest = FAMILY_ORDER.map((f) => ordered.filter((m) => m.family === f).at(-1)!);
    const score = newest.reduce((a, m) => a + Math.log2(ratioOf(t, m).ratio ?? 1), 0);
    return { t, score };
  })
  .sort((a, b) => b.score - a.score)
  .map((x) => x.t);

const byId = (id: string) => tells().find((t) => t.id === id)!;
const kobak = ms.eras.find((e) => e.id === "chatgpt-pubmed-2024")!;

const famSeq = (f: string) => ordered.filter((m) => m.family === f);
const turnover = FAMILY_ORDER.flatMap((f) => famSeq(f).slice(1).map((m, i) => ({ from: famSeq(f)[i], to: m, shared: g.models[m.id].shared_with_previous! })));

const minis: Array<{ t: Tell; note: string; invert?: boolean; extra?: { at: string; ratio: number; text: string } }> = [
  { t: byId("delve"), note: `Rate per 1,000 words against people. The diamond is "delves" in 2024 PubMed abstracts: ${kobak.words[0].ratio}× its expected rate.`, extra: { at: "2024-06", ratio: kobak.words[0].ratio, text: `"delves" in 2024 PubMed abstracts: ${kobak.words[0].ratio}× expected (Kobak et al.)` } },
  { t: byId("genuinely"), note: "Claude’s word. Opus 5 wrote “genuinely useful” 411 times; people, never. Points where people never used a phrase are lower bounds." },
  { t: byId("contraction-avoidance"), note: "Flipped: how much more often people write “it’s”, “don’t”, “isn’t”.", invert: true },
  { t: byId("em-dash-density"), note: "Rate per 1,000 words. Below 1× means people use more." },
];

const evalRows = evalData ? ["human", ...ordered.map((m) => m.id)].map((id) => ({ id, name: id === "human" ? "People" : ordered.find((m) => m.id === id)!.name, ...evalData.test.default[id], aware: evalData.test.model_aware[id], reg: evalData.test.registry_only[id] })) : [];

const CSS = `
.atlas{position:relative;height:min(86vh,900px);min-height:560px;margin:14px 0 0;border-top:1px solid var(--grid);border-bottom:1px solid var(--grid);overflow:hidden;
--sea:#e6ecf0;--land-1:#fbfbfa;--land-2:#efeee9;--land-3:#e0ded5;--land-4:#ccc9bd;--land-5:#b3afa1;--contour:rgba(70,68,60,.28);--shore:#cfe0f5;--shore-line:#256abf;--fossil:rgba(70,68,60,.35);
--fam-gpt:#1baf7a;--fam-claude:#eb6834;--fam-gemini:#2a78d6;--halo:rgba(252,252,251,.92);--ring:#fcfcfb}
.atlas canvas{position:absolute;inset:0;width:100%;height:100%;cursor:grab;touch-action:none}
.atlas canvas:active{cursor:grabbing}
.panel{position:absolute;background:var(--surface);border:1px solid var(--ring-line);border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.atlas-title{top:18px;left:18px;max-width:380px;padding:16px 18px}
.atlas-title h1{font-size:28px;margin:0 0 8px;line-height:1.1}
.atlas-title p{margin:0;font-size:14px;color:var(--ink-2);line-height:1.5}
.atlas-legend{top:18px;right:18px;padding:12px 14px;font-size:12.5px;color:var(--ink-2);display:grid;gap:6px}
.atlas-legend span{display:flex;align-items:center;gap:8px}
.atlas-legend i{width:10px;height:10px;border-radius:50%;display:inline-block}
.atlas-legend i.fossil{background:none;border:1px solid var(--muted)}
.atlas-legend i.land{border-radius:2px;background:var(--land-4);width:14px}
.atlas-legend i.shore{border-radius:2px;background:var(--shore);width:14px}
.atlas-controls{left:18px;right:18px;bottom:16px;display:flex;align-items:center;gap:14px;padding:10px 14px;flex-wrap:wrap}
.atlas-controls button{font:inherit;font-size:13px;font-weight:600;border:1px solid var(--axis);background:var(--surface);color:var(--ink);border-radius:5px;padding:5px 12px;cursor:pointer;min-width:64px}
.atlas-controls input[type=range]{flex:1;min-width:160px;accent-color:var(--ink)}
#atlas-date{font-weight:700;font-size:18px;min-width:150px;font-variant-numeric:tabular-nums}
#atlas-stat{font-size:12.5px;color:var(--muted);min-width:170px}
#atlas-tip{position:absolute;left:0;top:0;pointer-events:none;background:var(--surface);color:var(--ink);border:1px solid var(--ring-line);border-radius:6px;padding:10px 12px;font-size:12px;box-shadow:0 4px 14px rgba(0,0,0,.12);z-index:4;min-width:250px}
#atlas-tip strong{display:block;font-size:14px;margin-bottom:2px}
#atlas-tip em{display:block;color:var(--shore-line);margin-bottom:4px}
#atlas-tip table{margin:6px 0 0;font-size:11.5px;border-collapse:collapse;width:100%}
#atlas-tip th{font-weight:400;color:var(--ink-2);text-align:left;padding:1px 8px 1px 0;border:0}
#atlas-tip td{padding:1px 0;border:0;text-align:right}
#atlas-tip td:nth-child(2){width:90px;padding-right:8px}
#atlas-tip .b{display:block;height:6px;border-radius:0 3px 3px 0;background:var(--muted)}
#atlas-tip .b.under{background:var(--shore-line)}
#atlas-tip tr.later{opacity:.4}
#atlas-tip small{display:block;color:var(--muted);margin-top:6px}
@media (max-width:760px){.atlas-legend{display:none}.atlas-title{right:18px;max-width:none}.atlas-title h1{font-size:22px}}
:root{color-scheme:light;--ring-line:rgba(11,11,11,.12);--surface:#fcfcfb;--plane:#f9f9f7;--ink:#0b0b0b;--ink-2:#52514e;--muted:#6f6d68;--grid:#e1e0d9;--axis:#c3c2b7;--ring:rgba(11,11,11,.10);
--fam-1:#2a78d6;--fam-2:#eb6834;--fam-3:#1baf7a;--n0:#f0efec;--nil:#fcfcfb;
--o1:#f3d3cd;--o2:#ec9d93;--o3:#e34948;--o4:#a3262a;--u1:#dbe8f8;--u2:#9ec5f4;--u3:#3987e5;--u4:#1c5cab;--link:#1c5cab}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])){color-scheme:dark;--surface:#1a1a19;--plane:#0d0d0d;--ink:#f0efec;--ink-2:#c3c2b7;--muted:#9a988f;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);
--fam-1:#3987e5;--fam-2:#d95926;--fam-3:#199e70;--n0:#383835;--nil:#1a1a19;--o1:#5a2b29;--o2:#8f3633;--o3:#d4423f;--o4:#f08b86;--u1:#22344d;--u2:#1f4f8a;--u3:#3987e5;--u4:#9ec5f4;--link:#86b6ef}}
:root[data-theme="dark"]{color-scheme:dark;--surface:#1a1a19;--plane:#0d0d0d;--ink:#f0efec;--ink-2:#c3c2b7;--muted:#9a988f;--grid:#2c2c2a;--axis:#383835;--ring:rgba(255,255,255,.10);
--fam-1:#3987e5;--fam-2:#d95926;--fam-3:#199e70;--n0:#383835;--nil:#1a1a19;--o1:#5a2b29;--o2:#8f3633;--o3:#d4423f;--o4:#f08b86;--u1:#22344d;--u2:#1f4f8a;--u3:#3987e5;--u4:#9ec5f4;--link:#86b6ef}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) .atlas{--sea:#0e1317;--land-1:#1b1f22;--land-2:#24282b;--land-3:#2f3437;--land-4:#3c4246;--land-5:#4d5459;--contour:rgba(255,255,255,.13);--shore:#18304d;--shore-line:#86b6ef;--fossil:rgba(255,255,255,.3);--fam-gpt:#199e70;--fam-claude:#d95926;--fam-gemini:#3987e5;--halo:rgba(14,19,23,.9);--ring:#1a1a19}:root:where(:not([data-theme="light"])){--ring-line:rgba(255,255,255,.14)}}
:root[data-theme="dark"] .atlas{--sea:#0e1317;--land-1:#1b1f22;--land-2:#24282b;--land-3:#2f3437;--land-4:#3c4246;--land-5:#4d5459;--contour:rgba(255,255,255,.13);--shore:#18304d;--shore-line:#86b6ef;--fossil:rgba(255,255,255,.3);--fam-gpt:#199e70;--fam-claude:#d95926;--fam-gemini:#3987e5;--halo:rgba(14,19,23,.9);--ring:#1a1a19}
:root[data-theme="dark"]{--ring-line:rgba(255,255,255,.14)}
*{box-sizing:border-box}
html{background:var(--plane);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;-webkit-text-size-adjust:100%}
body{margin:0}
a{color:var(--link);text-underline-offset:2px}
a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--link);outline-offset:2px;border-radius:2px}
.wrap{max-width:1120px;margin:0 auto;padding:0 24px}
header.top{display:flex;align-items:baseline;gap:24px;padding:20px 0 0}
.mark{font-weight:700;letter-spacing:-.01em;font-size:17px;color:var(--ink);text-decoration:none}
header.top nav{display:flex;gap:18px;font-size:14px;flex-wrap:wrap}
header.top nav a{color:var(--ink-2);text-decoration:none}
header.top nav a:hover{color:var(--ink);text-decoration:underline}
.theme{margin-left:auto;font:inherit;font-size:13px;background:none;border:1px solid var(--axis);color:var(--ink-2);border-radius:4px;padding:3px 10px;cursor:pointer}
.intro{padding:56px 0 28px;max-width:720px}
h1{font-size:clamp(28px,4.2vw,44px);line-height:1.1;letter-spacing:-.02em;margin:0 0 18px;font-weight:700}
.lede{font-size:19px;color:var(--ink-2);margin:0 0 12px}
.lede em{font-style:italic;color:var(--ink)}
section{padding:32px 0 8px;border-top:1px solid var(--grid)}
h2{font-size:22px;letter-spacing:-.01em;margin:0 0 6px}
.sub{color:var(--ink-2);margin:0 0 18px;max-width:760px}
.card{background:var(--surface);border:1px solid var(--ring);border-radius:8px;padding:20px 20px 12px}
.scroll{overflow-x:auto}
svg text{fill:var(--ink-2);font:12px system-ui,-apple-system,"Segoe UI",sans-serif}
svg .fam{fill:var(--ink);font-weight:600;font-size:13px}
svg .muted,svg .tick{fill:var(--muted);font-size:11px;font-variant-numeric:tabular-nums}
svg .col{fill:var(--ink);font-weight:500}
svg .row{fill:var(--ink);font-size:13px}
svg a:hover .row{text-decoration:underline}
svg .inval{font-size:10.5px;font-weight:600;fill:#fff;pointer-events:none}
svg .inval.u3,svg .inval.u4,svg .inval.o3,svg .inval.o4{fill:#fff}
:root[data-theme="dark"] svg .inval.o4,:root[data-theme="dark"] svg .inval.u4{fill:#0b0b0b}
@media (prefers-color-scheme:dark){:root:where(:not([data-theme="light"])) svg .inval.o4,:root:where(:not([data-theme="light"])) svg .inval.u4{fill:#0b0b0b}}
.c.o1{fill:var(--o1);background:var(--o1)}.c.o2{fill:var(--o2);background:var(--o2)}.c.o3{fill:var(--o3);background:var(--o3)}.c.o4{fill:var(--o4);background:var(--o4)}
.c.n0{fill:var(--n0);background:var(--n0)}
.c.u1{fill:var(--u1);background:var(--u1)}.c.u2{fill:var(--u2);background:var(--u2)}.c.u3{fill:var(--u3);background:var(--u3)}.c.u4{fill:var(--u4);background:var(--u4)}
rect.nil{fill:var(--nil);stroke:var(--grid);stroke-width:1}
.heat rect.c:hover,.heat rect.nil:hover{stroke:var(--ink);stroke-width:1.5}
.legend-bins{display:flex;flex-wrap:wrap;gap:6px 16px;list-style:none;padding:0;margin:14px 0 4px;font-size:12.5px;color:var(--ink-2)}
.legend-bins li{display:flex;align-items:center;gap:6px}
.sw{display:inline-block;width:14px;height:14px;border-radius:3px}
.sw.nil{background:var(--nil);border:1px solid var(--grid)}
.note{font-size:13px;color:var(--muted);margin:8px 0 0}
details{margin:12px 0 4px}
summary{cursor:pointer;color:var(--ink-2);font-size:14px}
table{border-collapse:collapse;font-size:13px;margin-top:10px;font-variant-numeric:tabular-nums}
th,td{padding:5px 10px;border-bottom:1px solid var(--grid);text-align:right;white-space:nowrap}
th[scope=row],thead th:first-child{text-align:left}
thead th{color:var(--ink-2);font-weight:600}
.grid-minis{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
.mini-card{background:var(--surface);border:1px solid var(--ring);border-radius:8px;padding:14px 14px 8px}
.mini-card h3{font-size:15px;margin:0 0 2px;font-weight:600}
.mini-card p{font-size:13px;color:var(--ink-2);margin:0 0 6px;min-height:2.6em}
.mini{width:100%;height:auto;display:block}
.mini .grid{stroke:var(--grid);stroke-width:1}
.mini .base{stroke:var(--axis);stroke-width:1}
.mini .ln{stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.mini .dot{stroke:var(--surface);stroke-width:2}
.mini .hollow{fill:var(--surface);stroke-width:1.5}
.mini .era{fill:var(--ink-2);stroke:var(--surface);stroke-width:2}
.mini .anno{fill:var(--muted);font-size:11px}
.mini .endlab{fill:var(--ink-2);font-size:11px}
.fam-legend{display:flex;gap:18px;font-size:13.5px;color:var(--ink-2);margin:0 0 14px;flex-wrap:wrap}
.fam-legend span{display:inline-flex;align-items:center;gap:7px}
.fam-legend i{width:18px;height:3px;border-radius:2px;display:inline-block}
.turn{list-style:none;padding:0;margin:0;max-width:640px}
.turn li{display:grid;grid-template-columns:230px 1fr 48px;gap:12px;align-items:center;padding:6px 0;border-bottom:1px solid var(--grid);font-size:14px}
.bar{height:10px;background:var(--n0);border-radius:2px;position:relative;overflow:hidden}
.bar b{position:absolute;inset:0 auto 0 0;border-radius:0 3px 3px 0}
.turn .v{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:28px}
@media (max-width:820px){.cols{grid-template-columns:1fr}.turn li{grid-template-columns:150px 1fr 44px}}
pre{background:var(--surface);border:1px solid var(--ring);border-radius:6px;padding:12px 14px;overflow-x:auto;font-size:13px;line-height:1.5}
code{font:13px ui-monospace,SFMono-Regular,Menlo,monospace}
p code{background:var(--surface);border:1px solid var(--ring);border-radius:3px;padding:0 4px}
footer{border-top:1px solid var(--grid);margin-top:40px;padding:20px 0 48px;font-size:13px;color:var(--muted)}
#tip{position:fixed;pointer-events:none;background:var(--ink);color:var(--surface);font-size:12.5px;padding:6px 9px;border-radius:5px;max-width:320px;opacity:0;transition:opacity .08s;z-index:5}
@media (prefers-reduced-motion:reduce){#tip{transition:none}}
.tell-page .facts{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;font-size:14.5px;margin:14px 0 22px}
.tell-page .facts dt{color:var(--muted)}
.tell-page .facts dd{margin:0}
.ex{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:8px 0 18px}
.ex div{background:var(--surface);border:1px solid var(--ring);border-radius:6px;padding:10px 12px;font-size:15px}
.ex small{display:block;color:var(--muted);font-size:12px;margin-bottom:2px}
`;

const JS = `
const tip=document.getElementById('tip');
document.addEventListener('mousemove',e=>{const t=e.target.closest&&e.target.closest('[data-tip]');if(!t){tip.style.opacity=0;return}
tip.textContent=t.getAttribute('data-tip');tip.style.opacity=1;const x=Math.min(e.clientX+14,innerWidth-tip.offsetWidth-8);tip.style.left=x+'px';tip.style.top=(e.clientY+16)+'px'});
for(const el of document.querySelectorAll('[data-tip] title'))el.remove();
const btn=document.querySelector('.theme');const root=document.documentElement;
const saved=localStorage.getItem('theme');if(saved)root.dataset.theme=saved;
const cur=()=>root.dataset.theme||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');
const sync=()=>{btn.textContent=cur()==='dark'?'Light':'Dark';btn.setAttribute('aria-label','Switch to '+(cur()==='dark'?'light':'dark')+' theme')};
btn.addEventListener('click',()=>{root.dataset.theme=cur()==='dark'?'light':'dark';localStorage.setItem('theme',root.dataset.theme);sync()});sync();
`;

function page(title: string, desc: string, body: string, depth = 0, hero = ""): string {
  const up = depth ? "../" : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${depth ? "<!-- shibbo-ignore -->" : ""}<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">${depth ? "<!-- /shibbo-ignore -->" : ""}
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
<header class="top">
<a class="mark" href="${up}index.html">shibbo</a>
<nav aria-label="Sections"><a href="${up}index.html#atlas">Atlas</a><a href="${up}index.html#chart">Tell by tell</a><a href="${up}index.html#time">Over time</a><a href="${up}index.html#test">Test</a><a href="${up}index.html#use">Use it</a></nav>
<button class="theme" type="button">Dark</button>
</header>
</div>
${hero}
<div class="wrap">
<main>
${body}
</main>
<footer>
Measurements: Graphite, “AI Tells” (2026), <a href="https://graphite.io/research/ai-tells">graphite.io</a>, CC BY 4.0. 2024 PubMed figures: Kobak et al., <a href="https://arxiv.org/abs/2406.07016">arXiv 2406.07016</a>. Release months marked * are unverified. Built ${new Date().toISOString().slice(0, 10)} from <code>data/tells.yaml</code>.
</footer>
</div>
<div id="tip" role="tooltip"></div>
<script>${JS}</script>
</body>
</html>
`;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

const atlas = `<section id="atlas" class="atlas" aria-labelledby="atlas-h">
<canvas role="img" aria-label="Map of phrases that models write far more or less often than people. Each model family's releases form a route; people sit at the origin."></canvas>
<div class="panel atlas-title"><h1 id="atlas-h">An atlas of AI writing tells</h1>
<p>Every dot is a phrase some model writes at least 4× as often as people do. Land rises where those phrases crowd together. Lines trace each family’s releases, and distance from <b>People</b> shows how differently a model writes. Press play to replay 2025 and 2026.</p></div>
<div class="panel atlas-legend" aria-label="Legend">
${FAMILY_ORDER.map((f) => `<span><i style="background:var(--fam-${f})"></i>${esc(ms.families[f].name)} (${esc(ms.families[f].maker)})</span>`).join("")}
<span><i class="land"></i>Phrases current models over-use</span>
<span><i class="shore"></i>Phrases people use, models avoid</span>
<span><i class="fossil"></i>Dropped by a newer release</span>
</div>
<div class="panel atlas-controls">
<button id="atlas-play" type="button" aria-pressed="false">Play</button>
<output id="atlas-date" for="atlas-time"></output>
<input id="atlas-time" type="range" step="1" aria-label="Month">
<span id="atlas-stat" aria-live="polite"></span>
<button id="atlas-reset" type="button">Reset view</button>
</div>
<div id="atlas-tip" hidden></div>
<script type="application/json" id="map-data">${mapJson.replace(/</g, "\\u003c")}</script>
<script>${mapJs}</script>
</section>`;

const index = page(
  "shibbo: the words that give a model away",
  "A dated, per-model record of the patterns that mark writing as machine-made, measured against human writing.",
  `
<p class="note" style="margin:14px 0 26px">Map axes: the first two principal components of each model’s phrase ratios, with people fixed at the origin (${mapData.explained}% of the variation). ${mapData.terms.length.toLocaleString("en")} phrases, 9 models, ${(9984).toLocaleString("en")} matched topics. Release months marked * are unverified.</p>

<section id="chart" aria-labelledby="heat-title">
<h2 id="heat-title">Tell by tell</h2>
<p class="sub" id="heat-desc">Model rate over human rate. Red: the model uses it more. Blue: people do. Click a row for its evidence.</p>
<div class="card"><!-- shibbo-ignore --><div class="scroll">${heatmap(rows)}</div><!-- /shibbo-ignore -->${heatLegend()}
<p class="note">Empty: under Graphite’s cutoff (fewer than 20 articles, or under 2×). “411:0” means the model used the phrase 411 times and people never did.</p>
<details><summary>Show as a table</summary><!-- shibbo-ignore --><div class="scroll">${heatTable(rows)}</div><!-- /shibbo-ignore --></details>
</div>
</section>

<section id="time">
<h2>Over time</h2>
<p class="sub">Four tells on a calendar. Log scale; the darker line is the human rate.</p>
<div class="fam-legend">${FAMILY_ORDER.map((f) => `<span><i style="background:var(${familyVar[f]})"></i>${esc(ms.families[f].name)} (${esc(ms.families[f].maker)})</span>`).join("")}</div>
<div class="grid-minis">
${minis.map((x) => `<div class="mini-card"><!-- shibbo-ignore --><h3><a href="tells/${x.t.id}.html">${esc(label(x.t))}</a></h3><p>${esc(x.note)}</p><!-- /shibbo-ignore -->${overTime(x.t, { invert: x.invert, extra: x.extra })}</div>`).join("\n")}
</div>
<div class="cols" style="margin-top:28px">
<div>
<h3>How much carries over between versions</h3>
<p class="sub">Share of a model’s tells it shares with the previous version in its family.</p>
<ul class="turn">${turnover.map((x) => `<li><span>${esc(short(x.from))} → ${esc(short(x.to))} <span class="muted" style="color:var(--muted)">${esc(ms.families[x.to.family].name)}</span></span><span class="bar"><b style="width:${x.shared * 100}%;background:var(${familyVar[x.to.family]})"></b></span><span class="v">${pct(x.shared)}</span></li>`).join("")}</ul>
</div>
</div>
</section>

${evalData ? `<section id="test">
<h2>Does the checker work?</h2>
<p class="sub">Tested on the ${evalData.topics.test.toLocaleString("en")} held-out topics. The phrase list and score scale were fit on the other ${evalData.topics.train.toLocaleString("en")} topics only. AUC is the chance a model’s article scores worse than a person’s; 0.5 is a coin flip. “Flagged” counts articles scoring under 80.</p>
<div class="card"><div class="scroll"><table>
<thead><tr><th scope="col">Writer</th><th scope="col">AUC</th><th scope="col">Flagged</th><th scope="col">Median score</th><th scope="col">AUC, rules only</th><th scope="col">AUC, model known</th></tr></thead>
<tbody>${evalRows.map((r) => `<tr><th scope="row">${esc(r.name)}</th><td>${r.id === "human" ? "–" : r.auc.toFixed(2)}</td><td>${pct(r.flagged)}</td><td>${r.median}</td><td>${r.id === "human" ? "–" : r.reg.auc.toFixed(2)}</td><td>${r.id === "human" ? "–" : r.aware.auc.toFixed(2)}</td></tr>`).join("")}</tbody>
</table></div>
<p class="note">The hand-written rules were drafted after reading Graphite’s full tell lists, so the rules-only column is optimistic. The phrase list in this test was rebuilt from training topics alone. Scores are tuned so 90% of human training articles count as clean, which means about 1 in 10 human articles still gets flagged. “Model known” checks the human articles with the same model setting; it ranks better but flags about 1 in 4 human articles, since the score scale was not recalibrated for it.</p></div>
</section>` : ""}

<section id="use">
<h2>Use it</h2>
<p class="sub">One registry feeds every target. Rules are ranked by what the model in use actually over-uses.</p>
<div class="cols">
<div>
<h3>Check a file</h3>
<pre><code>npx shibbo check README.md --model claude-opus-5
npx shibbo check site/ --threshold 80</code></pre>
<h3>Rules for a prompt</h3>
<pre><code>npx shibbo rules --model gpt-6
npx shibbo export claude     # or agents, cursor, vale</code></pre>
</div>
<div>
<h3>Claude Code</h3>
<pre><code>/plugin marketplace add &lt;owner&gt;/shibbo
/plugin install shibbo@shibbo</code></pre>
<p>Checks each file Claude writes and hands back the hits, with fixes, before Claude moves on.</p>
<h3>Any agent, over MCP</h3>
<pre><code>npx shibbo mcp</code></pre>
</div>
</div>
</section>
`,
  0,
  atlas,
);

// ───────── per-tell pages ─────────
function tellPage(t: Tell): string {
  const srcs = t.sources.map((s) => sources()[s]).filter(Boolean);
  const measured = ordered.some((m) => ratioOf(t, m).ratio !== null);
  const body = `
<div class="intro tell-page">
<p class="note"><a href="../index.html#chart">All tells</a></p>
<!-- shibbo-ignore -->
<h1>${esc(t.name)}</h1>
<p class="lede">${esc(t.what)}</p>
<dl class="facts">
<dt>Kind</dt><dd>${esc(t.domain)}, ${esc(t.kind)}</dd>
<dt>Status</dt><dd>${esc(t.status)}${t.era?.first_seen ? `, first seen ${esc(String(t.era.first_seen))}` : ""}</dd>
<dt>Confidence</dt><dd>${esc(t.confidence)}</dd>
${t.fix ? `<dt>Fix</dt><dd>${esc(t.fix)}</dd>` : ""}
${t.substitutes?.length ? `<dt>Turns into</dt><dd>${t.substitutes.map((s) => (tells().some((x) => x.id === s) ? `<a href="${s}.html">${esc(label(byId(s)))}</a>` : esc(s))).join(", ")}</dd>` : ""}
${t.false_positives ? `<dt>Careful</dt><dd>${esc(t.false_positives)}</dd>` : ""}
</dl>
${t.examples?.bad ? `<div class="ex"><div><small>Tell</small>${esc(t.examples.bad)}</div><div><small>Plain</small>${esc(t.examples.good ?? "")}</div></div>` : ""}
<!-- /shibbo-ignore -->
</div>
${measured ? `<section><h2>Measured</h2><div class="fam-legend">${FAMILY_ORDER.map((f) => `<span><i style="background:var(${familyVar[f]})"></i>${esc(ms.families[f].name)}</span>`).join("")}</div><div class="mini-card" style="max-width:520px">${overTime(t, { invert: !!t.measure?.graphite_absent })}</div>
<details open><summary>Per model</summary><!-- shibbo-ignore --><table><thead><tr><th scope="col">Model</th><th scope="col">Released</th><th scope="col">vs. people</th><th scope="col">Strongest phrase</th></tr></thead><tbody>${ordered.map((m) => { const r = ratioOf(t, m); return `<tr><th scope="row">${esc(m.name)}</th><td>${month(m.released)}${m.verified ? "" : "*"}</td><td>${r.ratio === null ? "–" : r.counts ? (r.ratio >= 1 ? `${r.counts.model} uses vs 0` : `0 vs ${r.counts.human} uses`) : esc(fmt(r.ratio))}</td><td style="text-align:left">${esc(r.via)}</td></tr>`; }).join("")}</tbody></table><!-- /shibbo-ignore --></details></section>` : ""}
<section><h2>Detection</h2><p class="sub">${t.detect.method === "regex" ? `Pattern:</p><pre><code>${esc(t.detect.pattern!)}</code></pre>` : t.detect.method === "stat" ? `Statistical check: <code>${esc(t.detect.fn!)}</code>.</p>` : "Needs a reader’s judgment.</p>"}${t.detect.judge ? `<p class="sub">Judge question: ${esc(t.detect.judge)}</p>` : ""}</section>
<section><h2>Sources</h2><!-- shibbo-ignore --><ul>${srcs.map((s) => `<li>${s.url ? `<a href="${esc(s.url)}">${esc(s.title)}</a>` : esc(s.title)}</li>`).join("")}</ul><!-- /shibbo-ignore --></section>`;
  return page(`${t.name} | shibbo`, t.what, body, 1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "tells"), { recursive: true });
writeFileSync(join(OUT, "index.html"), index);
for (const t of tells()) writeFileSync(join(OUT, "tells", `${t.id}.html`), tellPage(t));
console.log(`site: ${OUT} (${rows.length} heatmap rows, ${tells().length} tell pages)`);
